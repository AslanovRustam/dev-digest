import { describe, expect, it } from 'vitest';
import { resolvePr, resolveRepo } from '../src/resolve.js';
import { err, fakeApi, ok } from './fakes.js';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const P3 = '44444444-4444-4444-8444-444444444444';
const repos = [
  { id: R1, full_name: 'Acme/Payments-API' },
  { id: R2, full_name: 'acme/web' },
];

describe('resolveRepo', () => {
  it('matches full_name case-insensitively', async () => {
    const api = fakeApi(() => ok(repos));
    expect(await resolveRepo(api, 'acme/payments-api')).toEqual({ ok: true, value: R1 });
  });

  it('rejects a bad format without calling the API', async () => {
    const api = fakeApi(() => ok(repos));
    const res = await resolveRepo(api, 'not-a-repo');
    expect(res).toEqual({ ok: false, failure: { kind: 'invalid', message: "repo must be 'owner/name'" } });
    expect(api.calls).toEqual([]);
  });

  it('lists at most 10 known repos when not found', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, full_name: `o/n${i}` }));
    const res = await resolveRepo(fakeApi(() => ok(many)), 'o/missing');
    expect(res.ok).toBe(false);
    if (!res.ok && res.failure.kind === 'not_found') {
      expect(res.failure.message).toContain('o/missing');
      expect(res.failure.message).toContain('o/n9');
      expect(res.failure.message).not.toContain('o/n10');
    }
  });

  it('passes API errors through', async () => {
    const res = await resolveRepo(fakeApi(() => err({ kind: 'unreachable' })), 'a/b');
    expect(res).toEqual({ ok: false, failure: { kind: 'api', error: { kind: 'unreachable' } } });
  });
});

describe('resolvePr', () => {
  const prs = [
    { id: P1, number: 1, title: 'one' },
    { id: null, number: 2, title: 'not synced' },
    { id: P3, number: 3, title: 'three' },
  ];

  it('returns the PR uuid and encodes the repo id in the path', async () => {
    const api = fakeApi(() => ok(prs));
    expect(await resolvePr(api, 'r/1', 'a/b', 3)).toEqual({ ok: true, value: P3 });
    expect(api.calls).toEqual(['GET /repos/r%2F1/pulls']);
  });

  it('requires a non-null id and lists known numbers', async () => {
    const res = await resolvePr(fakeApi(() => ok(prs)), 'r1', 'a/b', 2);
    expect(res.ok).toBe(false);
    if (!res.ok && res.failure.kind === 'not_found') {
      expect(res.failure.message).toBe(
        'PR #2 not found in a/b — open/import it in DevDigest first. Known: #1, #2, #3',
      );
    }
  });
});
