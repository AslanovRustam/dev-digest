/**
 * Allowlisted log record for ONE LLM call (the intent classifier or an agent's
 * review). R6: the log shows what went into the call — section names and sizes,
 * which sources were used — without leaking secrets or any prompt text.
 *
 * Safety is structural: the record is BUILT field by field from an allowlist, so
 * a new field on the caller's object can never reach a log by accident, and every
 * string passes through `redactSecrets` + URL-query stripping. Message bodies,
 * descriptions, issue/doc text and diff bodies have no field here at all — only
 * sizes. `RunLogger` mirrors `data` to pino AND the SSE stream, so only a value
 * built here may be passed as `data` for an LLM call.
 */

export interface LlmCallSection {
  name: string;
  chars: number;
  tokens: number;
  truncated: boolean;
  original_chars: number;
}

export interface LlmCallSource {
  kind: string;
  ref: string;
  status: string;
  chars: number | null;
  truncated: boolean;
}

export interface LlmCallLogInput {
  call: 'intent' | 'review';
  prId: string;
  runId?: string;
  provider: string;
  model: string;
  sections: LlmCallSection[];
  sources?: LlmCallSource[];
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number | null;
  attempts?: number;
  /** Short, code-generated summary (e.g. `confidence=high`, `findings=3 dropped=1`). */
  outcome?: string;
}

export interface LlmCallLog {
  call: 'intent' | 'review';
  prId: string;
  runId?: string;
  provider: string;
  model: string;
  sections: LlmCallSection[];
  total_tokens_est: number;
  sources?: LlmCallSource[];
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number | null;
  attempts?: number;
  outcome?: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-or-v1-[a-f0-9]{20,}/g,
  /sk-ant-[\w-]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /Bearer\s+\S+/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abpr]-[\w-]+/g,
];

/** Replace anything that looks like a credential with `[REDACTED]`. */
export function redactSecrets(s: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), s);
}

/** Drop `?query` / `#fragment` from every URL in a string (they can carry tokens). */
export function stripUrlQuery(s: string): string {
  return s.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1');
}

const clean = (s: string): string => redactSecrets(stripUrlQuery(s));
const num = (n: number | undefined): number | undefined =>
  n === undefined ? undefined : Number.isFinite(n) ? n : 0;

export function buildLlmCallLog(input: LlmCallLogInput): LlmCallLog {
  const sections = input.sections.map((s) => ({
    name: clean(s.name),
    chars: num(s.chars) ?? 0,
    tokens: num(s.tokens) ?? 0,
    truncated: Boolean(s.truncated),
    original_chars: num(s.original_chars) ?? 0,
  }));
  const log: LlmCallLog = {
    call: input.call,
    prId: clean(input.prId),
    provider: clean(input.provider),
    model: clean(input.model),
    sections,
    total_tokens_est: sections.reduce((n, s) => n + s.tokens, 0),
  };
  if (input.runId !== undefined) log.runId = clean(input.runId);
  if (input.sources) {
    log.sources = input.sources.map((s) => ({
      kind: clean(s.kind),
      ref: clean(s.ref),
      status: clean(s.status),
      chars: s.chars === null ? null : (num(s.chars) ?? 0),
      truncated: Boolean(s.truncated),
    }));
  }
  if (input.latency_ms !== undefined) log.latency_ms = num(input.latency_ms);
  if (input.tokens_in !== undefined) log.tokens_in = num(input.tokens_in);
  if (input.tokens_out !== undefined) log.tokens_out = num(input.tokens_out);
  if (input.cost_usd !== undefined) log.cost_usd = input.cost_usd === null ? null : num(input.cost_usd);
  if (input.attempts !== undefined) log.attempts = num(input.attempts);
  if (input.outcome !== undefined) log.outcome = clean(input.outcome);
  return log;
}

/** Compact one-line rendering of a call log for the human-facing run log. */
export function formatCallLine(log: LlmCallLog): string {
  const parts = [`call=${log.call}`, `model=${log.model}`, `provider=${log.provider}`];
  parts.push(`~${log.total_tokens_est} prompt tokens`);
  parts.push(
    `sections=${log.sections
      .map((s) => `${s.name}:${s.chars}c/${s.tokens}t${s.truncated ? '(truncated)' : ''}`)
      .join(',')}`,
  );
  if (log.sources) {
    parts.push(`sources=${log.sources.map((s) => `${s.kind}:${s.ref}=${s.status}`).join(',')}`);
  }
  if (log.tokens_in !== undefined) parts.push(`in=${log.tokens_in}`);
  if (log.tokens_out !== undefined) parts.push(`out=${log.tokens_out}`);
  if (log.cost_usd !== undefined) {
    parts.push(log.cost_usd === null ? 'cost=unknown' : `cost=$${log.cost_usd.toFixed(5)}`);
  }
  if (log.latency_ms !== undefined) parts.push(`latency=${log.latency_ms}ms`);
  if (log.attempts !== undefined && log.attempts > 1) parts.push(`attempts=${log.attempts}`);
  if (log.outcome) parts.push(log.outcome);
  return parts.join(' ');
}
