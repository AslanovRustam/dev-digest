import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiff } from '@devdigest/shared';
import type { Finding } from '@devdigest/shared';
import { insertReviewWithFindings } from '../src/modules/reviews/repository/review.repo.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILES = [
  { path: 'src/core.ts', additions: 10, deletions: 2 },
  { path: 'src/core.test.ts', additions: 5, deletions: 0 },
  { path: 'src/index.ts', additions: 1, deletions: 1 },
  { path: 'README.md', additions: 3, deletions: 0 },
  { path: 'pnpm-lock.yaml', additions: 20, deletions: 20 },
];

let seq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Smart diff',
      author: 'dev',
      branch: 'feat/sd',
      base: 'main',
      headSha: 'abc123',
      additions: 39,
      deletions: 23,
      filesCount: FILES.length,
      status: 'needs_review',
      body: '',
    })
    .returning();
  await db.insert(t.prFiles).values(FILES.map((f) => ({ prId: pr!.id, ...f, patch: '' })));
  return pr!;
}

const finding = (file: string, line: number): Finding => ({
  id: randomUUID(),
  severity: 'WARNING',
  category: 'bug',
  title: `issue ${file}:${line}`,
  file,
  start_line: line,
  end_line: line,
  rationale: 'because',
  confidence: 0.8,
  kind: 'finding',
});

const reviewValues = (workspaceId: string, prId: string) => ({
  workspaceId,
  prId,
  agentId: null,
  runId: null,
  kind: 'review' as const,
  verdict: 'comment',
  summary: 's',
  score: null,
  model: null,
});

d('Smart Diff route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const openai = new MockLLMProvider('openai', {});
  const openrouter = new MockLLMProvider('openai', {});

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        llm: { openai, openrouter },
      },
    });
  }

  const linesOf = (body: SmartDiff, path: string) =>
    body.groups.flatMap((g) => g.files).find((f) => f.path === path)!.finding_lines;

  it('groups by role before any review, with no LLM call', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(body.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(body.split_suggestion.total_lines).toBe(62);
    expect(openai.calls).toHaveLength(0);
    expect(openrouter.calls).toHaveLength(0);
    await app.close();
  });

  it('uses only the newest review and drops dismissed findings', async () => {
    const app = await appWith();
    const db = pg.handle.db;
    const pr = await setupPr(db, workspaceId);

    await insertReviewWithFindings(db, reviewValues(workspaceId, pr.id), [finding('src/index.ts', 3)]);
    await new Promise((r) => setTimeout(r, 20));
    const newer = await insertReviewWithFindings(db, reviewValues(workspaceId, pr.id), [
      finding('src/core.ts', 11),
      finding('src/core.ts', 11),
      finding('src/core.ts', 5),
    ]);

    const first = SmartDiff.parse(
      (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json(),
    );
    expect(linesOf(first, 'src/core.ts')).toEqual([5, 11]);
    expect(linesOf(first, 'src/index.ts')).toEqual([]);

    const toDismiss = newer.findings.find((f) => f.startLine === 5)!;
    const dismissed = await app.inject({ method: 'POST', url: `/findings/${toDismiss.id}/dismiss` });
    expect(dismissed.statusCode).toBe(200);

    const second = SmartDiff.parse(
      (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json(),
    );
    expect(linesOf(second, 'src/core.ts')).toEqual([11]);
    await app.close();
  });

  it('404 for an unknown pull request', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
