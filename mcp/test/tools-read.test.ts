import { describe, expect, it } from 'vitest';
import type { Config } from '../src/ports.js';
import { getBlastRadius } from '../src/tools/get-blast-radius.js';
import { getConventions } from '../src/tools/get-conventions.js';
import { getFindings } from '../src/tools/get-findings.js';
import { listAgents } from '../src/tools/list-agents.js';
import type { ToolCtx } from '../src/tools/types.js';
import { err, fakeApi, fakeClock, ok } from './fakes.js';

const config: Config = {
  apiUrl: 'http://localhost:3001',
  runWaitMs: 30_000,
  pollIntervalMs: 5_000,
  httpTimeoutMs: 30_000,
};
const ctxFor = (api: ToolCtx['api']): ToolCtx => ({ api, clock: fakeClock(), config });

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const finding = (id: string, over: object = {}) => ({
  id, severity: 'WARNING', category: 'bug', title: `T ${id}`, file: 'a.ts',
  start_line: 4, end_line: 4, rationale: 'why', suggestion: null, confidence: 0.7, dismissed_at: null, ...over,
});
const runBody = (over: object = {}) => ({
  run_id: RUN_ID, agent_name: 'Sec', status: 'done', error: null, verdict: 'request_changes',
  summary: 'sum', score: 60, findings: [finding('f1'), finding('f2', { dismissed_at: 'x' })], ...over,
});

describe('list_agents', () => {
  it('returns id/name/model/enabled and a description capped at 120', async () => {
    const api = fakeApi(() => ok([{ id: 'a1', name: 'Sec', model: 'm', enabled: true, description: 'd'.repeat(300), extra: 1 }]));
    const out = await listAgents.run({}, ctxFor(api));
    const body = JSON.parse(out.text);
    expect(api.calls).toEqual(['GET /agents']);
    expect(body.agents[0]).toEqual({ id: 'a1', name: 'Sec', model: 'm', enabled: true, description: `${'d'.repeat(119)}…` });
  });
  it('unreachable API gives the start-the-server message', async () => {
    const out = await listAgents.run({}, ctxFor(fakeApi(() => err({ kind: 'unreachable' }))));
    expect(out.isError).toBe(true);
    expect(out.text).toContain('not reachable at http://localhost:3001');
  });
  it('a bad shape is reported without echoing anything', async () => {
    const out = await listAgents.run({}, ctxFor(fakeApi(() => ok({ nope: 1 }))));
    expect(out).toEqual({ text: 'Unexpected API response — is the DevDigest server up to date?', isError: true });
  });
});

describe('get_findings', () => {
  const args = { run_id: RUN_ID, limit: 20, response_format: 'concise' as const };
  it('done: verdict, counts, dismissed counted but not listed', async () => {
    const api = fakeApi(() => ok(runBody()));
    const out = await getFindings.run(args, ctxFor(api));
    expect(api.calls).toEqual([`GET /runs/${RUN_ID}/findings`]);
    const body = JSON.parse(out.text);
    expect(body).toMatchObject({ run_id: RUN_ID, status: 'done', verdict: 'request_changes', dismissed: 1 });
    expect(body.findings).toHaveLength(1);
    expect(out.isError).toBeUndefined();
  });
  it('running is a normal result with next', async () => {
    const out = await getFindings.run(args, ctxFor(fakeApi(() => ok(runBody({ status: 'running', verdict: null, findings: [] })))));
    expect(out.isError).toBeUndefined();
    expect(JSON.parse(out.text).next).toBe(`call get_findings(${RUN_ID}) in ~30s`);
  });
  it('failed and cancelled are errors', async () => {
    const failed = await getFindings.run(args, ctxFor(fakeApi(() => ok(runBody({ status: 'failed', error: 'no key' })))));
    expect(failed).toMatchObject({ isError: true });
    expect(failed.text).toContain('Run ' + RUN_ID + ' failed: no key');
    const cancelled = await getFindings.run(args, ctxFor(fakeApi(() => ok(runBody({ status: 'cancelled' })))));
    expect(cancelled.text).toBe(`Run ${RUN_ID} was cancelled — start a new one with run_agent_on_pr`);
  });
  it('404 -> run not found; 429 -> rate limit; 500 -> no body echoed', async () => {
    const http = (status: number) => ctxFor(fakeApi(() => err({ kind: 'http', status, code: 'x', message: 'SECRET INTERNALS' })));
    expect((await getFindings.run(args, http(404))).text).toBe('Run not found — run ids come from run_agent_on_pr');
    expect((await getFindings.run(args, http(429))).text).toContain('rate limit');
    const e500 = await getFindings.run(args, http(500));
    expect(e500.isError).toBe(true);
    expect(e500.text).not.toContain('SECRET');
  });
  it('pagination: next_cursor round-trips; detailed adds rationale', async () => {
    const many = Array.from({ length: 5 }, (_, i) => finding(`f${i}`));
    const api = fakeApi(() => ok(runBody({ findings: many })));
    const p1 = JSON.parse((await getFindings.run({ ...args, limit: 2 }, ctxFor(api))).text);
    expect(p1.findings.map((f: { id: string }) => f.id)).toEqual(['f0', 'f1']);
    const p2 = JSON.parse(
      (await getFindings.run({ ...args, limit: 2, cursor: p1.next_cursor, response_format: 'detailed' }, ctxFor(api))).text,
    );
    expect(p2.findings.map((f: { id: string }) => f.id)).toEqual(['f2', 'f3']);
    expect(p2.findings[0].rationale).toBe('why');
  });
  it('a bad cursor is an error', async () => {
    const out = await getFindings.run({ ...args, cursor: 'garbage' }, ctxFor(fakeApi(() => ok(runBody()))));
    expect(out.isError).toBe(true);
    expect(out.text).toContain('Invalid cursor');
  });
});

describe('get_conventions', () => {
  const REPO = '55555555-5555-4555-8555-555555555555';
  const cand = (id: string, status: string) => ({
    id, category: 'naming', rule: `rule ${id}`, evidence_path: 'src/a.ts', evidence_start_line: 1,
    evidence_end_line: 2, evidence_snippet: 'code', confidence: 0.9, status,
  });
  const handler = (conventions: object) => (path: string) =>
    path === '/repos' ? ok([{ id: REPO, full_name: 'Acme/Payments' }]) : ok(conventions);
  const args = { repo: 'acme/payments', status: 'accepted' as const, limit: 30, response_format: 'concise' as const };

  it('defaults to accepted only and resolves the repo case-insensitively', async () => {
    const api = fakeApi(handler({ scan: { created_at: 'T' }, candidates: [cand('a', 'accepted'), cand('p', 'pending'), cand('r', 'rejected')] }));
    const body = JSON.parse((await getConventions.run({ ...args, repo: 'acme/Payments' }, ctxFor(api))).text);
    expect(api.calls).toEqual(['GET /repos', `GET /repos/${REPO}/conventions`]);
    expect(body).toMatchObject({ repo: 'acme/Payments', scanned_at: 'T', total: 1 });
    expect(body.conventions).toEqual([{ category: 'naming', rule: 'rule a', evidence: 'src/a.ts:1-2' }]);
  });
  it('status all returns every candidate; pending filters', async () => {
    const api = fakeApi(handler({ scan: null, candidates: [cand('a', 'accepted'), cand('p', 'pending')] }));
    expect(JSON.parse((await getConventions.run({ ...args, status: 'all' }, ctxFor(api))).text).total).toBe(2);
    expect(JSON.parse((await getConventions.run({ ...args, status: 'pending' }, ctxFor(api))).text).total).toBe(1);
  });
  it('pending-only list under the default filter is empty and carries next', async () => {
    const api = fakeApi(handler({ scan: null, candidates: [cand('p', 'pending')] }));
    const body = JSON.parse((await getConventions.run(args, ctxFor(api))).text);
    expect(body.total).toBe(0);
    expect(body.next).toContain('Conventions tab');
  });
  it('next is present whenever no accepted convention exists, whatever the status filter', async () => {
    const api = fakeApi(handler({ scan: null, candidates: [cand('p', 'pending')] }));
    for (const status of ['all', 'pending'] as const) {
      const body = JSON.parse((await getConventions.run({ ...args, status }, ctxFor(api))).text);
      expect(body.total).toBe(1);
      expect(body.next).toContain('Conventions tab');
    }
  });
  it('no next when at least one accepted convention exists', async () => {
    const api = fakeApi(handler({ scan: null, candidates: [cand('a', 'accepted'), cand('p', 'pending')] }));
    const body = JSON.parse((await getConventions.run({ ...args, status: 'all' }, ctxFor(api))).text);
    expect(body.next).toBeUndefined();
  });
  it('bad repo format and unknown repo are actionable errors', async () => {
    const api = fakeApi(handler({ scan: null, candidates: [] }));
    expect((await getConventions.run({ ...args, repo: 'nope' }, ctxFor(api))).text).toBe("repo must be 'owner/name'");
    const missing = await getConventions.run({ ...args, repo: 'x/y' }, ctxFor(api));
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Known: Acme/Payments');
  });
  it('an API failure on the conventions call is an error', async () => {
    const api = fakeApi((p) => (p === '/repos' ? ok([{ id: REPO, full_name: 'a/b' }]) : err({ kind: 'timeout' })));
    const out = await getConventions.run({ ...args, repo: 'a/b' }, ctxFor(api));
    expect(out.isError).toBe(true);
  });
});

describe('get_blast_radius', () => {
  it('always returns the NOT IMPLEMENTED error without any API call', async () => {
    const api = fakeApi(() => ok({}));
    const out = await getBlastRadius.run({ repo: 'a/b', pr: 1 }, ctxFor(api));
    expect(out).toEqual({
      text: 'NOT IMPLEMENTED (L04): blast radius is not available yet. Use run_agent_on_pr / get_findings for review results.',
      isError: true,
    });
    expect(api.calls).toEqual([]);
  });
});
