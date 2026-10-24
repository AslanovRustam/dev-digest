import { describe, expect, it } from 'vitest';
import { waitForRun } from '../src/wait.js';
import { err, fakeApi, fakeClock, ok } from './fakes.js';

const run = (status: string) => ({
  run_id: 'x',
  agent_name: 'Sec',
  status,
  error: null,
  verdict: status === 'done' ? 'approve' : null,
  summary: null,
  score: null,
  findings: [],
});

const opts = { capMs: 30_000, intervalMs: 5_000 };

describe('waitForRun', () => {
  it('finishes after N polls and reports progress on every poll', async () => {
    let n = 0;
    const api = fakeApi(() => ok(run(++n < 3 ? 'running' : 'done')));
    const clock = fakeClock();
    const progress: Array<[number, number, string]> = [];
    const out = await waitForRun(api, clock, 'x', {
      ...opts,
      onProgress: (...a) => progress.push(a),
    });
    expect(out.kind).toBe('finished');
    expect(api.calls).toHaveLength(3);
    expect(clock.slept).toEqual([5_000, 5_000]);
    expect(progress.map((p) => p[0])).toEqual([0, 5, 10]);
    expect(progress[0]?.[1]).toBe(30);
  });

  it('returns capped when the run outlasts the cap', async () => {
    const api = fakeApi(() => ok(run('running')));
    const out = await waitForRun(api, fakeClock(), 'x', opts);
    expect(out).toEqual({ kind: 'capped' });
    expect(api.calls).toHaveLength(7); // t = 0,5,...,30
  });

  it('polls once and caps immediately with a zero cap', async () => {
    const api = fakeApi(() => ok(run('running')));
    const out = await waitForRun(api, fakeClock(), 'x', { capMs: 0, intervalMs: 5_000 });
    expect(out).toEqual({ kind: 'capped' });
    expect(api.calls).toHaveLength(1);
  });

  it('stops when aborted', async () => {
    const ctrl = new AbortController();
    const api = fakeApi(() => {
      ctrl.abort();
      return ok(run('running'));
    });
    const out = await waitForRun(api, fakeClock(), 'x', { ...opts, signal: ctrl.signal });
    expect(out).toEqual({ kind: 'aborted' });
  });

  it('returns the API error when a poll fails', async () => {
    const api = fakeApi(() => err({ kind: 'timeout' }));
    const out = await waitForRun(api, fakeClock(), 'x', opts);
    expect(out).toEqual({ kind: 'error', error: { kind: 'timeout' } });
  });

  it('uses an encoded run id in the path', async () => {
    const api = fakeApi(() => ok(run('done')));
    await waitForRun(api, fakeClock(), 'a/b', opts);
    expect(api.calls).toEqual(['GET /runs/a%2Fb/findings']);
  });
});
