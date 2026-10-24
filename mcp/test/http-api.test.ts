import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHttpApi } from '../src/adapters/http-api.js';

const Thing = z.object({ id: z.string() });
const cfg = { apiUrl: 'http://api.test', httpTimeoutMs: 5_000 };

const json = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

const apiWith = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  const fetchFn = vi.fn(impl) as unknown as typeof fetch;
  return { api: createHttpApi(cfg, fetchFn), fetchFn: fetchFn as unknown as ReturnType<typeof vi.fn> };
};

describe('createHttpApi', () => {
  it('returns parsed data on 200 and calls the base URL + path', async () => {
    const { api, fetchFn } = apiWith(async () => json(200, { id: 'a', extra: 1 }));
    const res = await api.get('/things', Thing);
    expect(res).toEqual({ ok: true, value: { id: 'a' } });
    expect(fetchFn.mock.calls[0]?.[0]).toBe('http://api.test/things');
  });

  it('POST sends a JSON body', async () => {
    const { api, fetchFn } = apiWith(async () => json(200, { id: 'a' }));
    await api.post('/things', { x: 1 }, Thing);
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"x":1}');
  });

  it('maps a 404 error envelope', async () => {
    const { api } = apiWith(async () =>
      json(404, { error: { code: 'not_found', message: 'Run not found' } }),
    );
    expect(await api.get('/x', Thing)).toEqual({
      ok: false,
      error: { kind: 'http', status: 404, code: 'not_found', message: 'Run not found' },
    });
  });

  it('maps 429 by status, ignoring the body code', async () => {
    const { api } = apiWith(async () =>
      json(429, { error: { code: 'internal_error', message: 'Rate limit exceeded' } }),
    );
    const res = await api.get('/x', Thing);
    expect(res.ok === false && res.error.kind === 'http' && res.error.code).toBe('rate_limited');
  });

  it('never exposes a 5xx body', async () => {
    const { api } = apiWith(async () =>
      json(500, { error: { code: 'internal_error', message: 'select * from secrets /srv/app.ts' } }),
    );
    const res = await api.get('/x', Thing);
    expect(JSON.stringify(res)).not.toContain('secrets');
    expect(res.ok === false && res.error.kind === 'http' && res.error.status).toBe(500);
  });

  it('reports unreachable when fetch throws a TypeError', async () => {
    const { api } = apiWith(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await api.get('/x', Thing)).toEqual({ ok: false, error: { kind: 'unreachable' } });
  });

  it('reports timeout when the request is aborted', async () => {
    const { api } = apiWith(async () => {
      throw new DOMException('aborted', 'TimeoutError');
    });
    expect(await api.get('/x', Thing)).toEqual({ ok: false, error: { kind: 'timeout' } });
  });

  it('reports bad_shape on a schema mismatch and on non-JSON', async () => {
    const mismatch = apiWith(async () => json(200, { nope: true }));
    expect(await mismatch.api.get('/x', Thing)).toEqual({ ok: false, error: { kind: 'bad_shape' } });
    const html = apiWith(async () => json(200, '<html>'));
    expect(await html.api.get('/x', Thing)).toEqual({ ok: false, error: { kind: 'bad_shape' } });
  });
});
