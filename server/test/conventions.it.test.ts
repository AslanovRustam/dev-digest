import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const USERS_TS = [
  "import { db } from '../lib/db.js';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const REDIS_TS = "import Redis from 'ioredis';\nexport const redis = new Redis(config.redisUrl);\n";

const EXTRACTION = {
  candidates: [
    {
      category: 'async',
      rule: 'Always use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
      evidence_line: 1,
      confidence: 0.91,
    },
    {
      category: 'architecture',
      rule: 'Redis access goes through the src/lib/redis.ts singleton',
      evidence_path: 'src/lib/redis.ts',
      evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
      evidence_line: 2,
      confidence: 0.85,
    },
    {
      // invented code — the gate must drop it
      category: 'error-handling',
      rule: 'Wrap every handler in tryCatch()',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'return tryCatch(async () => handler(req));',
      evidence_line: 9,
      confidence: 0.7,
    },
    {
      // path traversal — the gate must drop it without reading
      category: 'other',
      rule: 'Read secrets from disk',
      evidence_path: '../../secrets.json',
      evidence_snippet: 'OPENAI_API_KEY',
      evidence_line: null,
      confidence: 0.4,
    },
  ],
};

/**
 * Conventions Extractor end to end against a real Postgres: sample → mock LLM
 * → evidence gate → persist → triage → skill (+ agent link).
 */
d('/repos/:id/conventions', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let repoId: string;
  let llm: MockLLMProvider;
  const samples: string[] = ['src/api/users.ts', 'src/lib/redis.ts'];

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
    await pg.handle.db.update(t.repos).set({ clonePath: '/mock/clones/acme/payments-api' }).where(eq(t.repos.id, repoId));

    llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: EXTRACTION } });
    const repoIntel = {
      getConventionSamples: async (_repoId: string, n: number) => samples.slice(0, n),
    } as unknown as RepoIntel;
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({
          head: 'deadbeef',
          files: {
            'src/api/users.ts': USERS_TS,
            'src/lib/redis.ts': REDIS_TS,
            'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
          },
        }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm },
        repoIntel,
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const extract = () => app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
  const list = async () => (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();

  it('lists nothing before the first scan', async () => {
    expect(await list()).toEqual({ scan: null, candidates: [] });
  });

  it('extracts: only evidence-backed candidates survive, with server-computed lines', async () => {
    const res = await extract();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scan).toMatchObject({
      source_sha: 'deadbeef',
      model: 'deepseek/deepseek-v4-flash',
      proposed: 4,
      dropped_ungrounded: 2,
      dropped_duplicate: 0,
    });
    expect(body.scan.sample_files).toEqual(['tsconfig.json', 'src/api/users.ts', 'src/lib/redis.ts']);
    expect(body.candidates).toHaveLength(2);
    const async = body.candidates.find((c: { category: string }) => c.category === 'async');
    expect(async).toMatchObject({
      status: 'pending',
      evidence_path: 'src/api/users.ts',
      evidence_start_line: 4,
      evidence_end_line: 5,
      evidence_snippet: '  const user = await db.users.find(id);\n  const posts = await db.posts.findMany({ userId: id });',
      skill_id: null,
    });

    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      schemaName: string;
      messages: { content: string }[];
    };
    expect(req.schemaName).toBe('ConventionExtraction');
    expect(req.messages[1]!.content).toContain('<untrusted source="src/api/users.ts">');
  });

  it('triages: accept, reject, edit; a re-scan replaces only pending rows', async () => {
    const { candidates } = await list();
    const [a, b] = candidates as { id: string; rule: string }[];
    const accept = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${a!.id}`,
      payload: { status: 'accepted', rule: `${a!.rule} (edited)` },
    });
    expect(accept.statusCode).toBe(200);
    const reject = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${b!.id}`,
      payload: { status: 'rejected' },
    });
    expect(reject.statusCode).toBe(200);

    const empty = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${a!.id}`,
      payload: {},
    });
    expect(empty.statusCode).toBe(422);

    // Re-scan with the same proposals: triaged rules are known → duplicates.
    const res = await extract();
    expect(res.json().scan).toMatchObject({ dropped_duplicate: 2, dropped_ungrounded: 2 });
    expect(res.json().candidates).toHaveLength(2);
    const after = (await list()).candidates as { id: string; status: string; rule: string }[];
    expect(after.find((c) => c.id === a!.id)).toMatchObject({ status: 'accepted', rule: `${a!.rule} (edited)` });
    expect(after.find((c) => c.id === b!.id)).toMatchObject({ status: 'rejected' });

    // The rejected rule is fed back to the model as a negative.
    const lastReq = llm.calls.filter((c) => c.method === 'completeStructured').at(-1)!.req as {
      messages: { content: string }[];
    };
    expect(lastReq.messages[1]!.content).toContain('Dismissed by the maintainer');
    expect(lastReq.messages[1]!.content).toContain(b!.rule);
  });

  it('refuses to put a non-accepted candidate into a skill', async () => {
    const { candidates } = await list();
    const rejected = candidates.find((c: { status: string }) => c.status === 'rejected');
    const draft = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill/draft`,
      payload: { convention_ids: [rejected.id] },
    });
    expect(draft.statusCode).toBe(422);
    const create = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { convention_ids: [rejected.id], name: 'x', body: 'y' },
    });
    expect(create.statusCode).toBe(422);
  });

  it('drafts and creates an extracted skill, marks the candidates and links an agent', async () => {
    const { candidates } = await list();
    const accepted = candidates.filter((c: { status: string }) => c.status === 'accepted');
    const ids = accepted.map((c: { id: string }) => c.id);

    const draft = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill/draft`,
        payload: { convention_ids: ids },
      })
    ).json();
    expect(draft).toMatchObject({ name: 'payments-api-async-conventions', type: 'convention' });
    expect(draft.body).toContain('Detected in `src/api/users.ts:4-5`');

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as { id: string }[];
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { convention_ids: ids, name: 'payments-conventions', description: draft.description, body: draft.body, agent_ids: [agents[0]!.id] },
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created).toMatchObject({ name: 'payments-conventions', version: 1, linked_agent_ids: [agents[0]!.id] });

    const skill = (await app.inject({ method: 'GET', url: `/skills/${created.skill_id}` })).json();
    expect(skill).toMatchObject({
      type: 'convention',
      source: 'extracted',
      enabled: true,
      evidence_files: ['src/api/users.ts:4-5'],
      agent_count: 1,
    });

    const marked = (await list()).candidates.find((c: { id: string }) => c.id === ids[0]);
    expect(marked).toMatchObject({ skill_id: created.skill_id, skill_name: 'payments-conventions' });

    const links = (await app.inject({ method: 'GET', url: `/agents/${agents[0]!.id}/skills` })).json();
    expect(links.map((l: { skill_id: string }) => l.skill_id)).toContain(created.skill_id);
  });

  it('bulk-sets status and 404s an unknown repo', async () => {
    const { candidates } = await list();
    const ids = candidates.map((c: { id: string }) => c.id);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/status`,
      payload: { ids, status: 'pending' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidates.every((c: { status: string }) => c.status === 'pending')).toBe(true);

    const missing = await app.inject({
      method: 'GET',
      url: '/repos/00000000-0000-0000-0000-000000000000/conventions',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('409s when the repo has nothing to sample', async () => {
    samples.length = 0;
    const res = await extract();
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_indexed');
  });
});
