/** Ring 3: the only reader of process.env. Fails fast on bad values. */
import { z } from 'zod';
import {
  DEFAULT_API_URL,
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_RUN_WAIT_MS,
  MAX_HTTP_TIMEOUT_MS,
  MAX_POLL_INTERVAL_MS,
  MAX_RUN_WAIT_MS,
  MIN_HTTP_TIMEOUT_MS,
  MIN_POLL_INTERVAL_MS,
} from './constants.js';
import type { Config } from './ports.js';

/** Empty string counts as unset (an unexpanded `${VAR:-}` in .mcp.json arrives as ''). */
const unsetIfEmpty = (v: unknown) => (v === '' ? undefined : v);

const intMs = (min: number, max: number, def: number) =>
  z.preprocess(unsetIfEmpty, z.coerce.number().int().min(min).max(max).default(def));

const EnvSchema = z.object({
  DEVDIGEST_API_URL: z.preprocess(
    unsetIfEmpty,
    z
      .url()
      .refine((u) => /^https?:\/\//i.test(u), 'must be an http(s) URL')
      .default(DEFAULT_API_URL),
  ),
  DEVDIGEST_RUN_WAIT_MS: intMs(0, MAX_RUN_WAIT_MS, DEFAULT_RUN_WAIT_MS),
  DEVDIGEST_POLL_INTERVAL_MS: intMs(MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
  DEVDIGEST_HTTP_TIMEOUT_MS: intMs(MIN_HTTP_TIMEOUT_MS, MAX_HTTP_TIMEOUT_MS, DEFAULT_HTTP_TIMEOUT_MS),
});

export class ConfigError extends Error {}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
      .join('; ');
    throw new ConfigError(`Invalid devdigest-mcp configuration — ${detail}`);
  }
  const e = parsed.data;
  return {
    apiUrl: e.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    runWaitMs: e.DEVDIGEST_RUN_WAIT_MS,
    pollIntervalMs: e.DEVDIGEST_POLL_INTERVAL_MS,
    httpTimeoutMs: e.DEVDIGEST_HTTP_TIMEOUT_MS,
  };
}
