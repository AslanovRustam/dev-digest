/** Ring 1: what the application ring needs from the outside world. Types only. */
import type { ZodType } from 'zod';

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type ApiError =
  | { kind: 'unreachable' }
  | { kind: 'timeout' }
  | { kind: 'http'; status: number; code: string; message: string }
  | { kind: 'bad_shape' };

export interface ApiClient {
  get<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<Result<T, ApiError>>;
  post<T>(
    path: string,
    body: unknown,
    schema: ZodType<T>,
    signal?: AbortSignal,
  ): Promise<Result<T, ApiError>>;
}

export interface Clock {
  now(): number;
  /** Resolves after `ms`, or early (without throwing) when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** (elapsedS, capS, message) — forwarded as notifications/progress by the transport ring. */
export type ProgressSink = (elapsedS: number, capS: number, message: string) => void;

export interface Config {
  apiUrl: string;
  runWaitMs: number;
  pollIntervalMs: number;
  httpTimeoutMs: number;
}
