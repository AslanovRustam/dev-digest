import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Review, SecretsProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  type MockGitHubOptions,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const HEAD = 'a1b2c3d4e5f6';
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -5,3 +5,4 @@
   "dependencies": {
     "fastify": "^5.0.0",
+    "ioredis": "^5.4.1"
   }`;

const INTENT_FIXTURE = {
  summary: 'Adds Redis-backed rate limiting to the public API.',
  in_scope: ['rate limiter'],
  out_of_scope: ['auth'],
  confidence: 'high',
  risk_areas: [{ kind: 'performance', label: 'Adds Redis round-trip per request' }],
};

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Secret committed.',
  score: 40,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed.',
      confidence: 0.95,
      kind: 'finding',
      scope: 'in',
    },
  ],
};

d('L03 intent layer (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Every app gets an openrouter mock (hermetic) unless a test passes its own secrets. */
  function appWith(opts: {
    github?: MockGitHubOptions;
    secrets?: SecretsProvider;
    withOpenrouter?: boolean;
  } = {}) {
    const openrouter = new MockLLMProvider('openai', {
      structuredBySchema: { PrIntentClassification: INTENT_FIXTURE },
    });
    const openai = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const github = new MockGitHubClient(opts.github);
    const app = buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github,
        ...(opts.secrets ? { secrets: opts.secrets } : {}),
        llm: { openai, ...(opts.withOpenrouter === false ? {} : { openrouter }) },
      },
    });
    return { app, openrouter, openai, github };
  }

  async function setupPr(body: string | null, title = 'Add rate limiting') {
    const name = `intent-api-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title,
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: HEAD,
        status: 'needs_review',
        body,
      })
      .returning();
    return pr!;
  }

  const classifierCalls = (m: MockLLMProvider) =>
    m.calls.filter(
      (c) =>
        c.method === 'completeStructured' &&
        (c.req as { schemaName: string }).schemaName === 'PrIntentClassification',
    );

  it('GET returns null + not stale and never calls a model', async () => {
    const { app, openrouter } = appWith();
    const pr = await setupPr('body');
    const res = await (await app).inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null, pr_head_sha: HEAD, stale: false });
    expect(openrouter.calls).toHaveLength(0);
    await (await app).close();
  });

  it('POST derives from description + linked plan + issue; the model sees paths, never diff bodies', async () => {
    const { app: appP, openrouter, github } = appWith({
      github: { files: { 'specs/05-x.md': '# Plan\nBuild a Redis rate limiter.' } },
    });
    const app = await appP;
    const pr = await setupPr('Implements specs/05-x.md. Closes #12');
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const { intent, stale } = res.json();
    expect(stale).toBe(false);
    expect(intent.intent).toBe(INTENT_FIXTURE.summary);
    expect(intent.head_sha).toBe(HEAD);
    expect(intent.model).toBe('deepseek/deepseek-v4-flash');
    const byKind = (k: string) => intent.sources.filter((s: { kind: string }) => s.kind === k);
    expect(byKind('plan')[0]).toMatchObject({ ref: 'specs/05-x.md', status: 'used' });
    expect(byKind('issue')[0]).toMatchObject({ ref: '#12', status: 'used' });
    // code-derived dependency risk comes first, the model's after
    expect(intent.risk_areas).toEqual([
      { kind: 'dependency', label: 'New dependency: ioredis', origin: 'code' },
      { kind: 'performance', label: 'Adds Redis round-trip per request', origin: 'model' },
    ]);
    // the plan was read at the PR head, not at a URL's ref
    expect(github.fileReads).toEqual([{ path: 'specs/05-x.md', ref: HEAD }]);

    const calls = classifierCalls(openrouter);
    expect(calls).toHaveLength(1);
    const sent = JSON.stringify((calls[0]!.req as { messages: unknown }).messages);
    expect(sent).toContain('Build a Redis rate limiter.');
    expect(sent).toContain('@@ -10,3 +10,4 @@');
    expect(sent).toContain('src/config.ts');
    expect(sent).toContain('ioredis');
    expect(sent).not.toContain('stripeKey');
    expect(sent).not.toContain('sk_live_xxx');
    expect(sent).not.toContain('^5.4.1');

    // GET now returns the stored row
    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(got.intent.intent).toBe(INTENT_FIXTURE.summary);
    await app.close();
  });

  it('an unreachable doc is recorded by code, with a missing-context line, and caps confidence', async () => {
    const { app: appP } = appWith({ github: { fileErrors: { 'specs/05-x.md': 404 } } });
    const app = await appP;
    const pr = await setupPr('Implements specs/05-x.md');
    const { intent } = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).json();
    const plan = intent.sources.find((s: { kind: string }) => s.kind === 'plan');
    expect(plan).toMatchObject({ status: 'unreachable', reason: 'not found at head a1b2c3d' });
    expect(intent.missing_context).toContain('specs/05-x.md: not found at head a1b2c3d');
    expect(intent.confidence).toBe('medium'); // the model said "high"
    await app.close();
  });

  it('an empty description caps confidence at low', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const pr = await setupPr('');
    const { intent } = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).json();
    expect(intent.confidence).toBe('low');
    expect(intent.missing_context).toContain('PR description is empty');
    await app.close();
  });

  it('a body that was never persisted (null) is fetched live and not written back', async () => {
    const { app: appP, openrouter } = appWith({
      github: { detail: { body: 'Live body mentioning docs/live.md' } },
    });
    const app = await appP;
    const pr = await setupPr(null);
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(JSON.stringify(classifierCalls(openrouter)[0]!.req)).toContain('Live body mentioning');
    const [row] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(row!.body).toBeNull();
    await app.close();
  });

  it('GET reports stale once the head sha moves', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const pr = await setupPr('Some description');
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'ffffffff0000' }).where(eq(t.pullRequests.id, pr.id));
    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(got.stale).toBe(true);
    expect(got.pr_head_sha).toBe('ffffffff0000');
    expect(got.intent.head_sha).toBe(HEAD);
    await app.close();
  });

  it('unknown PR → 404 on both verbs; bad id → 422', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/pulls/${id}/intent` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${id}/intent` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pulls/nope/intent' })).statusCode).toBe(422);
    await app.close();
  });

  async function runReview(app: Awaited<ReturnType<typeof buildApp>>, prId: string) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Rev ${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const before = (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId))).length;
    const res = (
      await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, prId, { expected: before + 1 });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${res.runs[0].run_id}/trace` })).json();
    return trace as {
      log: { kind: string; msg: string }[];
      prompt_assembly: { intent?: string | null; user: string };
    };
  }

  it('a review with no stored intent derives it ONCE (cheap model) before the review call; the next run reuses it', async () => {
    const { app: appP, openrouter, openai } = appWith();
    const app = await appP;
    const pr = await setupPr('Adds rate limiting');

    const first = await runReview(app, pr.id);
    expect(classifierCalls(openrouter)).toHaveLength(1);
    expect(openai.calls.filter((c) => (c.req as { schemaName?: string }).schemaName === 'Review')).toHaveLength(1);
    const msgs = first.log.map((l) => l.msg);
    const intentAt = msgs.findIndex((m) => m.includes('call=intent'));
    const reviewAt = msgs.findIndex((m) => m.includes('call=review'));
    expect(intentAt).toBeGreaterThanOrEqual(0);
    expect(reviewAt).toBeGreaterThan(intentAt);
    expect(first.prompt_assembly.intent).toContain('Summary: Adds Redis-backed rate limiting');
    expect(first.prompt_assembly.user).toContain('## PR intent');
    // the LLM-call logs carry sizes, never prompt content
    const joined = msgs.join('\n');
    expect(joined).not.toContain('sk_live_xxx');
    expect(joined).not.toContain('stripeKey');

    const second = await runReview(app, pr.id);
    expect(classifierCalls(openrouter)).toHaveLength(1); // reused, not re-derived
    expect(second.log.some((l) => l.msg.startsWith('Intent reused'))).toBe(true);

    // moving the head makes the stored intent stale: still reused, loudly
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'beefbeef0000' }).where(eq(t.pullRequests.id, pr.id));
    const third = await runReview(app, pr.id);
    expect(classifierCalls(openrouter)).toHaveLength(1);
    expect(third.log.some((l) => l.msg.includes('STALE'))).toBe(true);
    await app.close();
  });

  it('without an openrouter key the review still completes, without intent', async () => {
    const { app: appP, openai } = appWith({
      secrets: { get: async () => undefined },
      withOpenrouter: false,
    });
    const app = await appP;
    const pr = await setupPr('Adds rate limiting');
    const trace = await runReview(app, pr.id);
    expect(openai.calls.some((c) => (c.req as { schemaName?: string }).schemaName === 'Review')).toBe(true);
    expect(trace.prompt_assembly.intent ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## PR intent');
    expect(trace.log.some((l) => l.kind === 'error' && l.msg.includes('reviewing without intent'))).toBe(true);
    await app.close();
  });
});
