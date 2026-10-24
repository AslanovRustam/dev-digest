import type { ZodType } from 'zod';
import type { ApiClient, ApiError, Clock, Result } from '../src/ports.js';

type Handler = (path: string, body?: unknown) => Result<unknown, ApiError>;

/** Fake ApiClient: responses are looked up by a handler; schemas are applied like the real adapter. */
export function fakeApi(handler: Handler): ApiClient & { calls: string[] } {
  const calls: string[] = [];
  const run = <T>(method: string, path: string, schema: ZodType<T>, body?: unknown): Result<T, ApiError> => {
    calls.push(`${method} ${path}`);
    const res = handler(path, body);
    if (!res.ok) return res;
    const parsed = schema.safeParse(res.value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: { kind: 'bad_shape' } };
  };
  return {
    calls,
    get: async (path, schema) => run('GET', path, schema),
    post: async (path, body, schema) => run('POST', path, schema, body),
  };
}

/** Fake Clock: sleep advances virtual time instantly. */
export function fakeClock(): Clock & { slept: number[] } {
  let t = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
  };
}

export const ok = <T>(value: T): Result<T, ApiError> => ({ ok: true, value });
export const err = (error: ApiError): Result<never, ApiError> => ({ ok: false, error });
