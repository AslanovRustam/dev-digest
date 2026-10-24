import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { BlastRadiusResponse } from '@devdigest/shared';
import type { RepoIntel, BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILES = ['src/b.ts', 'src/a.ts'];

let seq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 9,
      title: 'Blast',
      author: 'dev',
      branch: 'feat/blast',
      base: 'main',
      headSha: 'abc123',
      additions: 1,
      deletions: 0,
      filesCount: FILES.length,
      status: 'needs_review',
      body: '',
    })
    .returning();
  await db.insert(t.prFiles).values(FILES.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0, patch: '' })));
  return { pr: pr!, repoId: repo!.id };
}

const BLAST: BlastResult = {
  changedSymbols: [{ file: 'src/a.ts', name: 'run', kind: 'function' }],
  callers: [
    { file: 'src/api.ts', symbol: 'handler', viaSymbol: 'run', line: 12, rank: 0.5 },
    { file: 'src/cli.ts', symbol: 'main', viaSymbol: 'run', line: 4, rank: 0.2 },
  ],
  impactedEndpoints: ['GET /x'],
  factsByFile: { 'src/api.ts': { endpoints: ['GET /x'], crons: [] } },
  degraded: false,
};

function fakeRepoIntel(status: IndexState['status']) {
  const calls: { repoId: string; paths: string[] }[] = [];
  const fake = {
    getBlastRadius: async (repoId: string, paths: string[]) => {
      calls.push({ repoId, paths });
      return BLAST;
    },
    getIndexState: async (repoId: string) => ({ repoId, status, lastIndexedSha: 'idx-sha' }) as IndexState,
  } as unknown as RepoIntel;
  return { fake, calls };
}

d('Blast radius route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(repoIntel: RepoIntel) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', {}), openrouter: new MockLLMProvider('openai', {}) },
        repoIntel,
      },
    });
  }

  it('returns a grouped, schema-valid map and calls the facade once with the sorted paths', async () => {
    const { fake, calls } = fakeRepoIntel('full');
    const app = await appWith(fake);
    const { pr, repoId } = await setupPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    expect(calls).toEqual([{ repoId, paths: ['src/a.ts', 'src/b.ts'] }]);
    expect(body.downstream).toHaveLength(1);
    expect(body.downstream[0]!.callers.length).toBeGreaterThanOrEqual(2);
    expect(body.downstream[0]!.endpoints_affected).toEqual(['GET /x']);
    expect(body.stats).toEqual({ symbols: 1, callers: 2, endpoints: 1, crons: 0 });
    expect(body.degraded).toBe(false);
    expect(body.indexed_sha).toBe('idx-sha');
    await app.close();
  });

  it('flags a partial index as degraded', async () => {
    const app = await appWith(fakeRepoIntel('partial').fake);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const body = BlastRadiusResponse.parse(
      (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` })).json(),
    );
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('index_partial');
    await app.close();
  });

  it('404s on an unknown pull request', async () => {
    const app = await appWith(fakeRepoIntel('full').fake);
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/blast` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('404s on a pull request from another workspace', async () => {
    const { fake, calls } = fakeRepoIntel('full');
    const app = await appWith(fake);
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const { pr } = await setupPr(pg.handle.db, other!.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(calls).toHaveLength(0);
    await app.close();
  });
});
