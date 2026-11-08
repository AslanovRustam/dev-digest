import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BlastRadiusResponse, IssueMeta, PrIntentResponse, RepoRef, StructuredResult } from '@devdigest/shared';
import { MAX_RETRIES, TRANSPORT_ATTEMPTS } from '../src/modules/brief/constants.js';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { IntentFacade } from '../src/modules/intent/types.js';
import type { BlastFacade } from '../src/modules/blast/types.js';
import type { ProjectContextFacade } from '../src/modules/project-context/types.js';
import { BriefService } from '../src/modules/brief/service.js';
import { ConfigError } from '../src/platform/errors.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const HEAD = 'a1b2c3d4e5f6';
const PATCH = '@@ -10,3 +10,4 @@ function secretHeading() {\n   port: 3000,\n+  SECRET_DIFF_LINE\n   redisUrl: x,';

const ANSWER = {
  summary: 'Adds a stripe key to the config.',
  risks: [
    { kind: 'security', title: 'Key in config', explanation: 'A key is committed.', severity: 'high', file_refs: ['src/config.ts:11-11', 'invented.ts'] },
    { kind: 'api', title: 'Ghost', explanation: 'x', severity: 'low', file_refs: ['../etc/passwd'] },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 500, reason: 'moved into the hunk' },
    { file: 'src/caller.ts', line: 3, reason: 'caller' },
  ],
};

const BLAST: BlastRadiusResponse = {
  changed_symbols: [{ name: 'cfg', file: 'src/config.ts', kind: 'const' }],
  downstream: [{ symbol: 'cfg', callers: [{ name: 'boot', file: 'src/caller.ts', line: 3 }], endpoints_affected: [], crons_affected: [] }],
  summary: 'cfg is read at boot.',
  stats: { symbols: 1, callers: 1, endpoints: 0, crons: 0 },
  degraded: false,
  reason: null,
  indexed_sha: HEAD,
};

/** A provider that reports a repaired answer (2 attempts), like the real one after one retry. */
class RepairingLLM extends MockLLMProvider {
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    const r = (await super.completeStructured(req)) as StructuredResult<T>;
    return { ...r, attempts: 2 };
  }
}

d('L05 PR brief (Testcontainers pg)', () => {
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

  function appWith(
    opts: { llm?: MockLLMProvider; noKey?: boolean; blast?: BlastFacade; nodeEnv?: string; git?: MockGitClient; github?: MockGitHubClient } = {},
  ) {
    const openai = opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { PrBriefAnswer: ANSWER } });
    const intent: IntentFacade = {
      get: async (): Promise<PrIntentResponse> => ({ intent: null, pr_head_sha: HEAD, stale: false }),
      derive: async () => {
        throw new Error('brief must never derive intent');
      },
      forReview: async () => null,
    };
    const blast: BlastFacade = opts.blast ?? { get: async () => BLAST };
    const projectContext = {
      forBrief: async () => ({ documents: [], missing: 'none_attached' as const }),
    } as unknown as ProjectContextFacade;
    const app = buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: opts.nodeEnv ?? 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: opts.git ?? new MockGitClient({ diff: '' }),
        github: opts.github ?? new MockGitHubClient(),
        intent,
        blast,
        projectContext,
        ...(opts.noKey ? { secrets: { get: async () => undefined } } : { llm: { openai } }),
      },
    });
    return { app, openai };
  }

  async function setupPr(body = 'Closes #9', withFiles = true) {
    const name = `brief-api-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 11,
        title: 'Add key',
        author: 'a',
        branch: 'feat/k',
        base: 'main',
        headSha: HEAD,
        status: 'needs_review',
        body,
      })
      .returning();
    if (withFiles) {
      await pg.handle.db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: PATCH });
    }
    return pr!;
  }

  async function addReview(prId: string) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', verdict: 'request_changes', summary: 's', score: 40, model: 'm' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id, file: 'src/config.ts', startLine: 11, endLine: 11, severity: 'CRITICAL',
      category: 'security', title: 'Hardcoded key', rationale: 'r', confidence: 0.9,
    });
    return review!;
  }

  const briefCalls = (m: MockLLMProvider) => m.calls.filter((c) => c.method === 'completeStructured');

  it('GET with nothing stored → null, no model call', async () => {
    const { app: appP, openai } = appWith();
    const app = await appP;
    const pr = await setupPr();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, pr_head_sha: HEAD, stale: false, stale_reasons: [] });
    expect(briefCalls(openai)).toHaveLength(0);
    await app.close();
  });

  it('POST generates with the risk_brief model, checks paths, never sends diff code; GET reads it back without a call', async () => {
    const { app: appP, openai } = appWith();
    const app = await appP;
    const pr = await setupPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    const { brief, stale } = res.json();
    expect(stale).toBe(false);
    expect(brief.model).toBe('gpt-4.1');
    expect(brief.head_sha).toBe(HEAD);
    expect(brief.review_id).toBeNull();
    // invented path dropped from the first risk, the second risk (no valid ref) dropped
    expect(brief.risks).toHaveLength(1);
    expect(brief.risks[0].file_refs).toEqual(['src/config.ts:11-11']);
    // line 500 moved to the hunk start; the caller file keeps its caller line
    expect(brief.review_focus.map((f: { file: string; line: number }) => `${f.file}:${f.line}`)).toEqual([
      'src/config.ts:10',
      'src/caller.ts:3',
    ]);
    expect(brief.inputs.find((i: { source: string }) => i.source === 'findings')).toMatchObject({ status: 'missing', reason: 'no_review' });

    const calls = briefCalls(openai);
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as { model: string; maxRetries: number; schemaName: string; messages: unknown };
    expect(req.model).toBe('gpt-4.1');
    expect(req.maxRetries).toBe(1);
    expect(req.schemaName).toBe('PrBriefAnswer');
    const sent = JSON.stringify(req.messages);
    expect(sent).not.toContain('SECRET_DIFF_LINE');
    expect(sent).not.toContain('secretHeading');
    expect(sent).toContain('src/config.ts +1 -0 core 10-13');

    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(got.brief.summary).toBe(ANSWER.summary);
    expect(briefCalls(openai)).toHaveLength(1);
    await app.close();
  });

  it('records attempts from the provider (one repair → 2)', async () => {
    const llm = new RepairingLLM('openai', { structuredBySchema: { PrBriefAnswer: ANSWER } });
    const { app: appP } = appWith({ llm });
    const app = await appP;
    const pr = await setupPr();
    const { brief } = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json();
    expect(brief.attempts).toBe(2);
    expect(briefCalls(llm)).toHaveLength(1);
    await app.close();
  });

  it('stores the review id; a newer review or a moved head marks it stale', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const pr = await setupPr();
    const first = await addReview(pr.id);
    const { brief } = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json();
    expect(brief.review_id).toBe(first.id);
    expect(brief.inputs.find((i: { source: string }) => i.source === 'findings').status).toBe('used');

    await addReview(pr.id);
    const afterReview = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(afterReview.stale_reasons).toEqual(['new_review']);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'ffffffff0000' }).where(eq(t.pullRequests.id, pr.id));
    const afterPush = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(afterPush.stale).toBe(true);
    expect(afterPush.stale_reasons).toEqual(['new_commit', 'new_review']);
    await app.close();
  });

  it('no API key → config_error naming the provider', async () => {
    const { app: appP } = appWith({ noKey: true });
    const app = await appP;
    const pr = await setupPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatchObject({ code: 'config_error', details: { provider: 'openai' } });
    await app.close();
  });

  it('a throwing model → 502 brief_generation_failed, nothing stored', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrBriefAnswer: { nope: true } } });
    const { app: appP } = appWith({ llm });
    const app = await appP;
    const pr = await setupPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_generation_failed');
    const got = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json();
    expect(got.brief).toBeNull();
    await app.close();
  });

  it('a second POST while one runs → 409 brief_in_progress, and the lock is freed after', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow: BlastFacade = { get: async () => (await gate, BLAST) };
    const { app: appP } = appWith({ blast: slow });
    const app = await appP;
    const pr = await setupPr();
    const first = app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await new Promise((r) => setTimeout(r, 200));
    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('brief_in_progress');
    release();
    expect((await first).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(200);
    await app.close();
  });

  it('no stored files and a failing git diff → 502 before any model call, nothing stored', async () => {
    class FailingGit extends MockGitClient {
      override async diff(): Promise<never> {
        throw new Error('clone missing');
      }
    }
    const { app: appP, openai } = appWith({ git: new FailingGit() });
    const app = await appP;
    const pr = await setupPr('Closes #9', false);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_generation_failed');
    expect(briefCalls(openai)).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json().brief).toBeNull();
    await app.close();
  });

  it('a stalled model → 502 at the deadline; the lock holds until it settles (409), a late answer is not stored', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    class StalledLLM extends MockLLMProvider {
      override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
        await gate;
        return super.completeStructured(req) as Promise<StructuredResult<T>>;
      }
    }
    const llm = new StalledLLM('openai', { structuredBySchema: { PrBriefAnswer: ANSWER } });
    const { app: appP } = appWith({ llm });
    const app = await appP;
    // Long enough that the collect phase ends before it, so the stall is in the model call.
    const service = new BriefService(app.container, { deadlineMs: 1500 });
    const pr = await setupPr();
    const t0 = Date.now();
    await expect(service.generate(workspaceId, pr.id)).rejects.toMatchObject({ statusCode: 502 });
    expect(Date.now() - t0).toBeLessThan(4000);
    await expect(service.generate(workspaceId, pr.id)).rejects.toMatchObject({ statusCode: 409 });
    release();
    await new Promise((r) => setTimeout(r, 200));
    expect((await service.get(workspaceId, pr.id)).brief).toBeNull();
    // the lock is free again
    expect((await service.generate(workspaceId, pr.id)).brief).not.toBeNull();
    await app.close();
  });

  it('a stalled blast and GitHub read are recorded missing; the generation ends inside the deadline', async () => {
    const never = new Promise<never>(() => undefined);
    class StalledGitHub extends MockGitHubClient {
      override async getIssue(): Promise<never> {
        return never;
      }
    }
    const { app: appP } = appWith({ blast: { get: () => never }, github: new StalledGitHub() });
    const app = await appP;
    const service = new BriefService(app.container, { deadlineMs: 3000, collectTimeoutMs: 100 });
    const pr = await setupPr();
    const t0 = Date.now();
    const { brief } = await service.generate(workspaceId, pr.id);
    expect(Date.now() - t0).toBeLessThan(3000);
    const by = (s: string) => brief!.inputs.find((i) => i.source === s);
    expect(by('blast')).toMatchObject({ status: 'missing', reason: 'index_incomplete' });
    expect(by('linked_issue')).toMatchObject({ status: 'missing', reason: 'github_unavailable' });
    await app.close();
  });

  it('writes exactly one call=brief record per generation: on success and on a 502 after the model call', async () => {
    const SECRET = 'sk-test-SECRET-1234567890abcdef'; // pr-self-review-ignore: INV-SECRET — fake token shape the call log must never contain, not a credential
    const okApp = await appWith().app;
    const lines: { kind: string; msg: string }[] = [];
    const log = (kind: string, msg: string) => void lines.push({ kind, msg });
    const okService = new BriefService(okApp.container);
    await okService.generate(workspaceId, (await setupPr()).id, { log });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg).toContain('call=brief');
    expect(lines[0]!.msg).not.toContain('SECRET_DIFF_LINE');
    await okApp.close();

    lines.length = 0;
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrBriefAnswer: { nope: SECRET } } });
    const badApp = await appWith({ llm }).app;
    const badService = new BriefService(badApp.container);
    await expect(badService.generate(workspaceId, (await setupPr()).id, { log })).rejects.toMatchObject({ statusCode: 502 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'error' });
    expect(lines[0]!.msg).toContain('call=brief');
    expect(lines[0]!.msg).not.toContain('SECRET_DIFF_LINE');
    expect(lines[0]!.msg).not.toContain(SECRET);
    await badApp.close();
  });

  it('a deadline that fires while collecting → 502, no model call, no record; the lock is freed once the collect settles', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow: BlastFacade = { get: async () => (await gate, BLAST) };
    const { app: appP, openai } = appWith({ blast: slow });
    const app = await appP;
    const service = new BriefService(app.container, { deadlineMs: 200, collectTimeoutMs: 5000 });
    const pr = await setupPr();
    const lines: string[] = [];
    const log = (_k: string, msg: string) => void lines.push(msg);
    await expect(service.generate(workspaceId, pr.id, { log })).rejects.toMatchObject({ statusCode: 502 });
    await expect(service.generate(workspaceId, pr.id)).rejects.toMatchObject({ statusCode: 409 });
    release();
    await new Promise((r) => setTimeout(r, 200));
    expect(briefCalls(openai)).toHaveLength(0);
    expect(lines).toHaveLength(0);
    expect((await service.get(workspaceId, pr.id)).brief).toBeNull();
    expect((await service.generate(workspaceId, pr.id)).brief).not.toBeNull();
    await app.close();
  });

  it('a deadline that fires during the brief write does not abandon the run: the caller gets the stored brief', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const service = new BriefService(app.container, { deadlineMs: 1500 });
    const repo = (service as unknown as { repo: { upsertBrief: (...a: unknown[]) => Promise<unknown> } }).repo;
    const real = repo.upsertBrief.bind(repo);
    repo.upsertBrief = async (...a: unknown[]) => {
      await new Promise((r) => setTimeout(r, 2200));
      return real(...a);
    };
    const pr = await setupPr();
    const res = await service.generate(workspaceId, pr.id);
    expect(res.brief).not.toBeNull();
    expect((await service.get(workspaceId, pr.id)).brief).not.toBeNull();
    await app.close();
  });

  it('a ConfigError from the model call reaches the client and leaves exactly one call=brief failure record', async () => {
    class ConfigFailingLLM extends MockLLMProvider {
      override async completeStructured(): Promise<never> {
        throw new ConfigError('bad model setup');
      }
    }
    const llm = new ConfigFailingLLM('openai', { structuredBySchema: { PrBriefAnswer: ANSWER } });
    const app = await appWith({ llm }).app;
    const service = new BriefService(app.container);
    const lines: { kind: string; msg: string }[] = [];
    const log = (kind: string, msg: string) => void lines.push({ kind, msg });
    await expect(service.generate(workspaceId, (await setupPr()).id, { log })).rejects.toBeInstanceOf(ConfigError);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'error' });
    expect(lines[0]!.msg).toContain('call=brief');
    await app.close();
  });

  it('a late answer discarded at the deadline still logs its tokens and cost in the one failure record', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    class LateLLM extends MockLLMProvider {
      override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
        await gate;
        return super.completeStructured(req) as Promise<StructuredResult<T>>;
      }
    }
    const llm = new LateLLM('openai', { structuredBySchema: { PrBriefAnswer: ANSWER } });
    const app = await appWith({ llm }).app;
    const service = new BriefService(app.container, { deadlineMs: 1500 });
    const lines: { kind: string; msg: string; data?: Record<string, unknown> }[] = [];
    const log = (kind: string, msg: string, data?: Record<string, unknown>) => void lines.push({ kind, msg, data });
    const pr = await setupPr();
    await expect(service.generate(workspaceId, pr.id, { log })).rejects.toMatchObject({ statusCode: 502 });
    release();
    await new Promise((r) => setTimeout(r, 200));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'error' });
    expect(lines[0]!.data).toMatchObject({ tokens_in: 100, tokens_out: 50, cost_usd: 0.001, attempts: 1 });
    expect((await service.get(workspaceId, pr.id)).brief).toBeNull();
    await app.close();
  });

  it('the model attempts fit into what is left of the deadline', async () => {
    const slow: BlastFacade = { get: async () => (await new Promise((r) => setTimeout(r, 300)), BLAST) };
    const { app: appP, openai } = appWith({ blast: slow });
    const app = await appP;
    const service = new BriefService(app.container, { deadlineMs: 20_000, collectTimeoutMs: 5000 });
    await service.generate(workspaceId, (await setupPr()).id);
    const req = briefCalls(openai)[0]!.req as { timeoutMs: number };
    expect(req.timeoutMs).toBeLessThan(10_000);
    expect(req.timeoutMs).toBeGreaterThan(0);
    // The budget left at call time is the deadline minus the blast stub's 300 ms (dividing the full
    // deadline would give 20 000 here and fail).
    expect(req.timeoutMs * (MAX_RETRIES + 1) * TRANSPORT_ATTEMPTS).toBeLessThanOrEqual(20_000 - 300);
    await app.close();
  });

  it('a #N that GitHub says is a pull request is "none_linked", not a linked issue', async () => {
    class PullAsIssueGitHub extends MockGitHubClient {
      override async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
        return { number: n, title: 'Another PR', body: 'pr body', state: 'open', is_pull_request: true };
      }
    }
    const app = await appWith({ github: new PullAsIssueGitHub() }).app;
    const service = new BriefService(app.container);
    const { brief } = await service.generate(workspaceId, (await setupPr()).id);
    expect(brief!.inputs.find((i) => i.source === 'linked_issue')).toMatchObject({
      status: 'missing',
      reason: 'none_linked',
    });
    await app.close();
  });

  it('an empty diff (no stored files, git diff with no files) → 502 before any model call', async () => {
    const { app: appP, openai } = appWith();
    const app = await appP;
    const pr = await setupPr('Closes #9', false);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_generation_failed');
    expect(briefCalls(openai)).toHaveLength(0);
    await app.close();
  });

  it('a linked issue that GitHub answers 404 is "none_linked"; other failures stay "github_unavailable"', async () => {
    class MissingIssueGitHub extends MockGitHubClient {
      override async getIssue(): Promise<never> {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      }
    }
    const app = await appWith({ github: new MissingIssueGitHub() }).app;
    const service = new BriefService(app.container);
    const { brief } = await service.generate(workspaceId, (await setupPr()).id);
    expect(brief!.inputs.find((i) => i.source === 'linked_issue')).toMatchObject({
      status: 'missing',
      reason: 'none_linked',
    });
    await app.close();
  });

  it('unknown PR → 404 on both verbs; bad id → 422', async () => {
    const { app: appP } = appWith();
    const app = await appP;
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pulls/nope/brief' })).statusCode).toBe(422);
    await app.close();
  });

  it('the 11th POST within a minute → 429', async () => {
    // the rate-limit plugin is off under NODE_ENV=test, so this one app runs as development
    const { app: appP } = appWith({ nodeEnv: 'development' });
    const app = await appP;
    const pr = await setupPr();
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode;
    }
    expect(last).toBe(429);
    await app.close();
  });
});
