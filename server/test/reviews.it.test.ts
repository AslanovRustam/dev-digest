import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { insertReviewWithFindings } from '../src/modules/reviews/repository/review.repo.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

/**
 * Intent classifier fixture. EVERY test that runs a review must inject an
 * `openrouter` mock: the review path derives intent first with the cheap
 * `review_intent` model (openrouter), and without an override the container would
 * resolve the developer's REAL key from ~/.devdigest/secrets.json and spend money.
 */
const INTENT_FIXTURE = {
  summary: 'Adds rate limiting to the public API.',
  in_scope: ['rate limiting'],
  out_of_scope: [],
  confidence: 'medium',
  risk_areas: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
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

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        // PR-list reads must never reach real GitHub from a test.
        github: new MockGitHubClient(),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { PrIntentClassification: INTENT_FIXTURE },
          }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    // GET /runs/:id/findings — the poll target for external clients (MCP)
    const rf = await app.inject({ method: 'GET', url: `/runs/${runId}/findings` });
    expect(rf.statusCode).toBe(200);
    const runFindings = rf.json();
    expect(runFindings.status).toBe('done');
    expect(runFindings.verdict).toBe('request_changes');
    expect(runFindings.agent_name).toBe('Sec');
    expect(runFindings.findings).toHaveLength(1);
    expect(runFindings.findings[0].start_line).toBe(11);

    // unknown run id → 404 envelope
    const missing = await app.inject({
      method: 'GET',
      url: '/runs/00000000-0000-4000-8000-000000000000/findings',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');

    await app.close();
  });

  it('run cost (L01): persisted per run, exposed on runs/trace, PR list shows the total of all runs', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const mkAgent = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
        })
      ).json();
    const review = async (agentId: string) =>
      (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } })).json();

    // Batch 1 — one agent. MockLLMProvider bills $0.001 per structured call.
    const first = await review((await mkAgent('Cost A')).id);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const [runA] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, first.runs[0].run_id));
    expect(runA!.status).toBe('done');
    expect(runA!.costUsd).toBeGreaterThan(0);
    expect(runA!.batchId).not.toBeNull();

    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].cost_usd).toBeCloseTo(runA!.costUsd!);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runA!.id}/trace` })).json();
    expect(trace.stats.cost_usd).toBeCloseTo(runA!.costUsd!);

    const listCost = async () => {
      const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return pulls.find((p: { id: string }) => p.id === pr.id).cost_usd;
    };
    expect(await listCost()).toBeCloseTo(runA!.costUsd!);

    // Batch 2 — a newer review ADDS to the list total (lifetime, not latest).
    const second = await review((await mkAgent('Cost B')).id);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    const [runB] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, second.runs[0].run_id));
    expect(runB!.batchId).not.toBe(runA!.batchId);
    expect(await listCost()).toBeCloseTo(runA!.costUsd! + runB!.costUsd!);

    await app.close();
  });

  it('findings by severity (L01): PR list counts open findings across all reviews', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const listRow = async () => {
      const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return pulls.find((p: { id: string }) => p.id === pr.id);
    };

    // Never reviewed → no counts.
    expect((await listRow()).findings).toBeNull();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SevAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();

    // Grounding keeps the one CRITICAL finding (see the map-reduce test).
    expect((await listRow()).findings).toEqual({ critical: 1, warning: 0, suggestion: 0 });

    // A second review adds its findings — earlier ones stay counted.
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    expect((await listRow()).findings).toEqual({ critical: 2, warning: 0, suggestion: 0 });

    // Dismissing one drops it from the open count.
    await app.inject({ method: 'POST', url: `/findings/${reviews[0].findings[0].id}/dismiss` });
    expect((await listRow()).findings).toEqual({ critical: 1, warning: 0, suggestion: 0 });

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it('skills (L02): only link-enabled AND globally-enabled skills reach the prompt, log and trace', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const db = pg.handle.db;
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    const mkSkill = async (name: string, enabled: boolean) =>
      (
        await db
          .insert(t.skills)
          .values({
            workspaceId,
            name,
            description: `When ${name} applies, flag it.`,
            type: 'convention',
            source: 'manual',
            body: `- Rule body of ${name}.`,
            enabled,
          })
          .returning()
      )[0]!;
    const on = await mkSkill('skill-on', true);
    const linkOff = await mkSkill('skill-link-off', true);
    const globalOff = await mkSkill('skill-global-off', false);

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: {
        items: [
          { skill_id: linkOff.id, enabled: false },
          { skill_id: on.id, enabled: true },
          { skill_id: globalOff.id, enabled: true },
        ],
      },
    });
    expect(put.statusCode).toBe(200);

    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(db, pr.id, { expected: 1 });
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

    const blocks = trace.prompt_assembly.skill_blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      skill_id: on.id,
      name: 'skill-on',
      type: 'convention',
      version: 1,
      text: '### Skill: skill-on\n_When skill-on applies, flag it._\n- Rule body of skill-on.',
    });
    expect(blocks[0].tokens).toBeGreaterThan(0);

    const user: string = trace.prompt_assembly.user;
    expect(user).toContain('## Skills / rules');
    expect(user).toContain('### Skill: skill-on');
    expect(user).not.toContain('### Skill: skill-link-off');
    expect(user).not.toContain('### Skill: skill-global-off');

    const msgs: string[] = trace.log.map((l: { msg: string }) => l.msg);
    expect(msgs.some((m) => m.startsWith('skill "skill-on" v1 attached (~'))).toBe(true);
    expect(msgs.some((m) => m.includes('skill "skill-link-off"'))).toBe(false);
    expect(msgs.some((m) => m.includes('skill "skill-global-off"'))).toBe(false);

    await app.close();
  });

  it('skills (L02): an agent with no skills gets no skills section and null skill_blocks', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skill-less', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace = (
      await app.inject({ method: 'GET', url: `/runs/${body.runs[0].run_id}/trace` })
    ).json();
    expect(trace.prompt_assembly.skill_blocks ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('attached (~'))).toBe(false);
    await app.close();
  });

  // ---- L05 — project context ------------------------------------------------

  const CONTEXT_FILES = {
    'docs/architecture.md': '# Architecture\nModule api/ does not import db/ directly.',
    'specs/public-api.md': '# Public API\nAll public endpoints MUST be rate-limited.',
    'insights/incident.md': '# Incident\nCheckout outage.',
    'docs/link.md': 'symlink to secrets',
  };

  async function contextRun(opts: { attach?: string[]; skillAttach?: string[]; git?: Record<string, unknown> } = {}) {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF, files: CONTEXT_FILES, symlinks: ['docs/link.md'], ...opts.git }),
        github: new MockGitHubClient(),
        llm: {
          openai: llm,
          openrouter: new MockLLMProvider('openai', { structuredBySchema: { PrIntentClassification: INTENT_FIXTURE } }),
        },
      },
    });
    const db = pg.handle.db;
    const { repo, pr } = await setupRepoAndPr(db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Ctx ${repoSeq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // repo-intel off for this agent: project context must not depend on it (AC-18).
    await db.update(t.agents).set({ repoIntel: false }).where(eq(t.agents.id, agent.id));
    if (opts.skillAttach) {
      const [skill] = await db
        .insert(t.skills)
        .values({ workspaceId, name: 'pr-quality-rubric', description: 'd', type: 'rubric', source: 'manual', body: 'b' })
        .returning();
      await db.insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: 0, enabled: true });
      await app.inject({ method: 'PUT', url: `/skills/${skill!.id}/context`, payload: { paths: opts.skillAttach } });
    }
    if (opts.attach) {
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths: opts.attach } });
    }
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await waitForPrRuns(db, pr.id, { expected: 1 });
    // The executor marks the run done BEFORE it saves the trace — poll until it lands.
    const runId = body.runs[0].run_id;
    for (let i = 0; i < 200; i++) {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (res.statusCode === 200) return { app, llm, repo, agent, trace: res.json() };
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`trace of run ${runId} was never saved`);
  }

  it('project context (L05): own docs then skill docs, deduped, fenced by path; skips traced; repo-intel off', async () => {
    const { app, repo, agent, trace } = await contextRun({
      attach: ['docs/architecture.md', 'specs/gone.md', 'docs/link.md'],
      skillAttach: ['docs/architecture.md', 'specs/public-api.md'],
    });

    expect(trace.specs_read).toEqual(['docs/architecture.md', 'specs/public-api.md']);
    expect(
      trace.context_documents.map((d: { path: string; status: string; reason?: string; via: string | null }) => [
        d.path,
        d.status,
        d.reason ?? null,
        d.via,
      ]),
    ).toEqual([
      ['docs/architecture.md', 'injected', null, null],
      ['specs/gone.md', 'skipped', 'not_found', null],
      ['docs/link.md', 'skipped', 'symlink', null],
      ['specs/public-api.md', 'injected', null, 'pr-quality-rubric'],
    ]);

    const user: string = trace.prompt_assembly.user;
    expect(user.match(/## Project context/g)).toHaveLength(1);
    const arch = user.indexOf('<untrusted source="project-context:docs/architecture.md">');
    const api = user.indexOf('<untrusted source="project-context:specs/public-api.md">');
    expect(arch).toBeGreaterThan(-1);
    expect(api).toBeGreaterThan(arch);
    expect(user).not.toContain('symlink to secrets');
    expect(trace.prompt_assembly.specs).toMatch(/^## Project context\n/);
    expect(user).toContain(trace.prompt_assembly.specs);

    const msgs: string[] = trace.log.map((l: { msg: string }) => l.msg);
    expect(msgs.some((m) => m.startsWith('project context "docs/architecture.md" attached (~'))).toBe(true);
    expect(msgs).toContain('project context "specs/gone.md" skipped: not_found');
    expect(msgs).toContain('project context "docs/link.md" skipped: symlink');

    // NFR-4 — the tab's total equals the tokens the run injected.
    const tab = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json();
    const injected = trace.context_documents
      .filter((d: { status: string }) => d.status === 'injected' || d.status === 'truncated')
      .reduce((s: number, d: { tokens: number }) => s + d.tokens, 0);
    expect(tab.total_tokens).toBe(injected);
    await app.close();
  });

  it('project context (L05): nothing attached → identical prompt, no specs, one LLM call either way (AC-23, NFR-2)', async () => {
    const none = await contextRun();
    expect(none.trace.prompt_assembly.specs ?? null).toBeNull();
    expect(none.trace.prompt_assembly.user).not.toContain('## Project context');
    expect(none.trace.specs_read).toEqual([]);
    expect(none.trace.context_documents).toEqual([]);
    const withDocs = await contextRun({ attach: ['docs/architecture.md'] });
    const reviewCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured').length;
    expect(reviewCalls(withDocs.llm)).toBe(reviewCalls(none.llm));
    await none.app.close();
    await withDocs.app.close();
  });

  it('project context (L05): a repo without a clone skips every document and the run still completes (AC-22)', async () => {
    const { app, trace } = await contextRun({ attach: ['docs/architecture.md'], git: { notCloned: true } });
    expect(trace.context_documents).toEqual([
      { path: 'docs/architecture.md', tokens: null, status: 'skipped', reason: 'not_cloned', via: null },
    ]);
    expect(trace.specs_read).toEqual([]);
    expect(trace.stats.findings).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('project context (L05): reading and counting 24,000 tokens of documents takes under 1 s (NFR-3)', async () => {
    const doc = (n: number) => `# Doc ${n}\n` + 'Module api/ must not import db/ directly. '.repeat(880);
    const files = { 'docs/a.md': doc(1), 'docs/b.md': doc(2), 'docs/c.md': doc(3) };
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ files }), github: new MockGitHubClient() },
    });
    const { repo } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: 'Budget', provider: 'openai', model: 'gpt-4.1', systemPrompt: 's' })
      .returning();
    await app.inject({ method: 'PUT', url: `/agents/${agent!.id}/context`, payload: { paths: Object.keys(files) } });
    const start = performance.now();
    const ctx = await app.container.projectContext.forReview(agent!.id, repo);
    const ms = performance.now() - start;
    const injected = ctx.reads.reduce((s, d) => s + (d.tokens ?? 0), 0);
    expect(injected).toBeGreaterThan(20000);
    expect(injected).toBeLessThanOrEqual(24000);
    expect(ms).toBeLessThan(1000);
    await app.close();
  });

  it('review + findings are atomic: a rejected finding rolls the review back', async () => {
    const db = pg.handle.db;
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const before = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));

    // `title` is NOT NULL, so the findings insert fails. Before the transaction
    // the review row from the first statement survived, and the UI rendered it
    // as a completed run that found nothing.
    const broken = { ...REVIEW_FIXTURE.findings[0]!, title: undefined as unknown as string };

    await expect(
      insertReviewWithFindings(
        db,
        {
          workspaceId,
          prId: pr.id,
          agentId: null,
          runId: null,
          kind: 'review',
          verdict: 'comment',
          summary: 'must not survive the rollback',
          score: null,
          model: null,
        },
        [broken],
      ),
    ).rejects.toThrow();

    const after = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    expect(after).toHaveLength(before.length);
    expect(after.some((r) => r.summary === 'must not survive the rollback')).toBe(false);
  });

  it('review + findings are atomic: the happy path still persists both', async () => {
    const db = pg.handle.db;
    const { pr } = await setupRepoAndPr(db, workspaceId);

    const { review, findings } = await insertReviewWithFindings(
      db,
      {
        workspaceId,
        prId: pr.id,
        agentId: null,
        runId: null,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'committed together',
        score: 10,
        model: null,
      },
      REVIEW_FIXTURE.findings,
    );

    expect(findings).toHaveLength(REVIEW_FIXTURE.findings.length);
    const persisted = await db.select().from(t.findings).where(eq(t.findings.reviewId, review.id));
    expect(persisted).toHaveLength(REVIEW_FIXTURE.findings.length);
  });
});
