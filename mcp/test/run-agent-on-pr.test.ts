import { describe, expect, it } from 'vitest';
import type { ApiError, Config } from '../src/ports.js';
import { runAgentOnPr } from '../src/tools/run-agent-on-pr.js';
import type { ToolCtx } from '../src/tools/types.js';
import { err, fakeApi, fakeClock, ok } from './fakes.js';

const config: Config = {
  apiUrl: 'http://localhost:3001',
  runWaitMs: 30_000,
  pollIntervalMs: 5_000,
  httpTimeoutMs: 30_000,
};
const AGENT = '22222222-2222-4222-8222-222222222222';
const PR_UUID = '33333333-3333-4333-8333-333333333333';
const RUN = '44444444-4444-4444-8444-444444444444';
const REPO = '66666666-6666-4666-8666-666666666666';
const args = { repo: 'acme/pay', pr: 482, agent: AGENT };

const finding = (id: string) => ({
  id, severity: 'CRITICAL', category: 'sec', title: 'SQLi', file: 'a.ts', start_line: 11, end_line: 11,
  rationale: 'r', suggestion: null, confidence: 0.9, dismissed_at: null,
});
const runBody = (status: string, over: object = {}) => ({
  run_id: RUN, agent_name: 'Sec', status, error: null, verdict: status === 'done' ? 'request_changes' : null,
  summary: 's', score: 50, findings: status === 'done' ? [finding('f1')] : [], ...over,
});

interface Scenario {
  repos?: unknown;
  pulls?: unknown;
  post?: ReturnType<typeof ok> | ReturnType<typeof err>;
  poll: () => ReturnType<typeof ok> | ReturnType<typeof err>;
}
function setup(s: Scenario) {
  const posts: unknown[] = [];
  const api = fakeApi((path, body) => {
    if (path === '/repos') return ok(s.repos ?? [{ id: REPO, full_name: 'acme/pay' }]);
    if (path === `/repos/${REPO}/pulls`) return ok(s.pulls ?? [{ id: PR_UUID, number: 482, title: 't' }]);
    if (path === `/pulls/${PR_UUID}/review`) {
      posts.push(body);
      return s.post ?? ok({ runs: [{ run_id: RUN, agent_id: AGENT }] });
    }
    if (path === `/runs/${RUN}/findings`) return s.poll();
    return err({ kind: 'http', status: 404, code: 'not_found', message: path });
  });
  const clock = fakeClock();
  const progress: Array<[number, number, string]> = [];
  const ctx = (extra: Partial<ToolCtx> = {}): ToolCtx => ({ api, clock, config, ...extra });
  return { api, posts, clock, progress, ctx };
}

describe('run_agent_on_pr', () => {
  it('happy path: resolves repo + PR, POSTs the agent, polls, returns verdict + compact findings', async () => {
    let n = 0;
    const t = setup({ poll: () => ok(runBody(++n < 3 ? 'running' : 'done')) });
    const out = await runAgentOnPr.run(args, t.ctx());
    expect(t.api.calls.slice(0, 3)).toEqual(['GET /repos', `GET /repos/${REPO}/pulls`, `POST /pulls/${PR_UUID}/review`]);
    expect(t.posts).toEqual([{ agentId: AGENT }]);
    const body = JSON.parse(out.text);
    expect(body).toMatchObject({ run_id: RUN, status: 'done', verdict: 'request_changes', dismissed: 0 });
    expect(body.findings[0]).toEqual({ id: 'f1', severity: 'CRITICAL', file: 'a.ts', lines: '11', title: 'SQLi' });
    expect(out.isError).toBeUndefined();
  });

  it('progress is forwarded on every poll only when a sink is provided', async () => {
    let n = 0;
    const t = setup({ poll: () => ok(runBody(++n < 3 ? 'running' : 'done')) });
    await runAgentOnPr.run(args, t.ctx({ progress: (...a) => t.progress.push(a) }));
    expect(t.progress).toHaveLength(3);
    expect(t.progress.map((p) => p[0])).toEqual([0, 5, 10]);
    // no sink: the same flow runs without error
    n = 0;
    const quiet = setup({ poll: () => ok(runBody(++n < 2 ? 'running' : 'done')) });
    expect((await runAgentOnPr.run(args, quiet.ctx())).isError).toBeUndefined();
  });

  it('cap fallback: a run that outlasts the wait returns run_id + status running + next', async () => {
    const t = setup({ poll: () => ok(runBody('running')) });
    const out = await runAgentOnPr.run(args, t.ctx());
    expect(out.isError).toBeUndefined();
    expect(JSON.parse(out.text)).toEqual({
      run_id: RUN, status: 'running', next: `call get_findings(${RUN}) in ~30s`,
    });
  });

  it('a non-uuid agent fails before any network call', async () => {
    const t = setup({ poll: () => ok(runBody('done')) });
    const out = await runAgentOnPr.run({ ...args, agent: 'Sec' }, t.ctx());
    expect(out).toEqual({ text: "Agent 'Sec' not found — call list_agents for valid ids", isError: true });
    expect(t.api.calls).toEqual([]);
  });

  it('bad repo format, unknown repo and unknown PR are actionable', async () => {
    const t = setup({ poll: () => ok(runBody('done')) });
    expect((await runAgentOnPr.run({ ...args, repo: 'nope' }, t.ctx())).text).toBe("repo must be 'owner/name'");
    const noRepo = await runAgentOnPr.run({ ...args, repo: 'x/y' }, t.ctx());
    expect(noRepo.text).toContain('Repo x/y is not in DevDigest');
    const noPr = await runAgentOnPr.run({ ...args, pr: 9999 }, t.ctx());
    expect(noPr.isError).toBe(true);
    expect(noPr.text).toBe('PR #9999 not found in acme/pay — open/import it in DevDigest first. Known: #482');
  });

  it('a PR without an id counts as not found', async () => {
    const t = setup({ pulls: [{ id: null, number: 482, title: 't' }], poll: () => ok(runBody('done')) });
    expect((await runAgentOnPr.run(args, t.ctx())).text).toContain('PR #482 not found');
  });

  it('POST 404 -> agent not found; POST 429 -> rate limit; unreachable -> start the server', async () => {
    const post = (e: ApiError) => setup({ post: err(e), poll: () => ok(runBody('done')) });
    const nf = await runAgentOnPr.run(args, post({ kind: 'http', status: 404, code: 'not_found', message: 'x' }).ctx());
    expect(nf.text).toBe(`Agent '${AGENT}' not found — call list_agents for valid ids`);
    const rl = await runAgentOnPr.run(args, post({ kind: 'http', status: 429, code: 'rate_limited', message: 'x' }).ctx());
    expect(rl.text).toBe('Review rate limit (10/min) hit — wait ~60s, then retry');
    const un = await runAgentOnPr.run(args, post({ kind: 'unreachable' }).ctx());
    expect(un.text).toContain('not reachable at http://localhost:3001');
  });

  it('POST that returns runs.length !== 1 is an error', async () => {
    for (const runs of [[], [{ run_id: RUN, agent_id: AGENT }, { run_id: PR_UUID, agent_id: AGENT }]]) {
      const t = setup({ post: ok({ runs }), poll: () => ok(runBody('done')) });
      const out = await runAgentOnPr.run(args, t.ctx());
      expect(out).toEqual({ text: 'Unexpected API response — is the DevDigest server up to date?', isError: true });
      expect(t.api.calls.some((c) => c.includes('/findings'))).toBe(false);
    }
  });

  it('a non-uuid repo id fails parsing: bad-shape error and no pulls request', async () => {
    const t = setup({ repos: [{ id: 'repo-1', full_name: 'acme/pay' }], poll: () => ok(runBody('done')) });
    const out = await runAgentOnPr.run(args, t.ctx());
    expect(out.isError).toBe(true);
    expect(t.api.calls).toEqual(['GET /repos']);
  });

  it('a non-uuid run_id in the POST response is rejected: no poll', async () => {
    const t = setup({ post: ok({ runs: [{ run_id: 'run-1', agent_id: AGENT }] }), poll: () => ok(runBody('done')) });
    const out = await runAgentOnPr.run(args, t.ctx());
    expect(out.isError).toBe(true);
    expect(t.api.calls.some((c) => c.includes('/findings'))).toBe(false);
  });

  it('failed and cancelled runs are errors with the next step', async () => {
    const failed = setup({ poll: () => ok(runBody('failed', { error: 'no provider key' })) });
    const f = await runAgentOnPr.run(args, failed.ctx());
    expect(f.isError).toBe(true);
    expect(f.text).toContain('failed: no provider key. Check the agent\'s provider key in DevDigest Settings');
    const cancelled = setup({ poll: () => ok(runBody('cancelled')) });
    expect((await runAgentOnPr.run(args, cancelled.ctx())).text).toContain('was cancelled');
  });

  it('a poll error after the run started says the run continues and names get_findings', async () => {
    const t = setup({ poll: () => err({ kind: 'timeout' }) });
    const out = await runAgentOnPr.run(args, t.ctx());
    expect(out.isError).toBe(true);
    expect(out.text).toContain(`The run continues server-side — call get_findings(${RUN}) later`);
  });

  it('an aborted request returns an error that names get_findings', async () => {
    const ac = new AbortController();
    const t = setup({ poll: () => { ac.abort(); return ok(runBody('running')); } });
    const out = await runAgentOnPr.run(args, t.ctx({ signal: ac.signal }));
    expect(out.isError).toBe(true);
    expect(out.text).toContain(`get_findings(${RUN})`);
  });
});
