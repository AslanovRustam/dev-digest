/** Ring 3: the only place that calls fetch. Redacts 5xx bodies; never throws. */
import type { ZodType } from 'zod';
import { MAX_API_MESSAGE_CHARS } from '../constants.js';
import type { ApiClient, ApiError, Config, Result } from '../ports.js';

type HttpConfig = Pick<Config, 'apiUrl' | 'httpTimeoutMs'>;

const fail = (error: ApiError): Result<never, ApiError> => ({ ok: false, error });

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

/** `{error:{code,message}}` envelope (server app.ts); anything else gets a generic code. */
async function readHttpError(res: Response): Promise<ApiError> {
  const status = res.status;
  // 5xx: never echo the body (could carry internals).
  if (status >= 500) return { kind: 'http', status, code: 'server_error', message: 'Server error' };
  let code = status === 429 ? 'rate_limited' : 'request_failed';
  let message = `HTTP ${status}`;
  try {
    const body: unknown = await res.json();
    const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    // The server maps 429 to internal_error: branch on the status, not the code.
    if (status !== 429 && typeof err?.code === 'string') code = err.code;
    if (typeof err?.message === 'string') message = err.message.slice(0, MAX_API_MESSAGE_CHARS);
  } catch {
    // non-JSON body: keep the generic text
  }
  return { kind: 'http', status, code, message };
}

export function createHttpApi(config: HttpConfig, fetchFn: typeof fetch = fetch): ApiClient {
  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    schema: ZodType<T>,
    signal?: AbortSignal,
  ): Promise<Result<T, ApiError>> {
    const timeout = AbortSignal.timeout(config.httpTimeoutMs);
    let res: Response;
    try {
      res = await fetchFn(`${config.apiUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (e) {
      return fail(isAbort(e) ? { kind: 'timeout' } : { kind: 'unreachable' });
    }
    if (!res.ok) return fail(await readHttpError(res));
    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      return fail(isAbort(e) ? { kind: 'timeout' } : { kind: 'bad_shape' });
    }
    const parsed = schema.safeParse(json);
    return parsed.success ? { ok: true, value: parsed.data } : fail({ kind: 'bad_shape' });
  }

  return {
    get: (path, schema, signal) => request('GET', path, undefined, schema, signal),
    post: (path, body, schema, signal) => request('POST', path, body ?? {}, schema, signal),
  };
}
