import { z } from 'zod';
import { BriefFocusItem, Risk } from '@devdigest/shared';

/**
 * PR Brief tunables. One generation is ONE structured call whose first request
 * holds at most `INPUT_BUDGET_TOKENS` tokens (system prompt included).
 */

export const INPUT_BUDGET_TOKENS = 8000;
/** Slack kept below the budget for message framing the tokenizer does not see. */
export const DOC_SAFETY_MARGIN = 64;

// ---- Per-section caps (tokens) ----------------------------------------------
export const CAP_DIFF = 1500;
export const CAP_BLAST = 1000;
export const CAP_INTENT = 800;
export const CAP_DESCRIPTION = 1200;
export const CAP_ISSUE = 800;
export const CAP_FINDINGS = 1000;

/** Appended where a section or document was cut. */
export const TRUNCATION_MARKER = '\n[… truncated]';

// ---- Output clamps ------------------------------------------------------------
export const MAX_RISKS = 6;
export const MAX_FOCUS = 8;
export const MAX_SUMMARY_CHARS = 600;

// ---- Missing-inputs block --------------------------------------------------------
/** Document paths listed one per line in the "Missing inputs" block; the rest is "+N more". */
export const MAX_MISSING_DOC_LINES = 10;
/** A path longer than this is cut (with `…`) before it enters the trusted block. */
export const MAX_MISSING_PATH_CHARS = 200;

// ---- Model call ---------------------------------------------------------------
export const ATTEMPT_TIMEOUT_MS = 50_000;
/** One repair retry — two attempts in total (D-3). */
export const MAX_RETRIES = 1;
/**
 * Transport attempts behind one structured attempt: the server `withRetry` retries only 429 / 5xx /
 * network codes (fast failures) and never a `TimeoutError`; reviewer-core's OpenRouter provider
 * retries a stalled or deadline-aborted request once → at most 2 full-length tries.
 */
export const TRANSPORT_ATTEMPTS = 2;
/** 2 × ATTEMPT_TIMEOUT_MS + slack, below the client's 120 s. */
export const GENERATION_DEADLINE_MS = 115_000;
/** An optional input (blast, GitHub, documents) that takes longer is recorded as missing. */
export const COLLECT_TIMEOUT_MS = 30_000;
export const SCHEMA_NAME = 'PrBriefAnswer';
export const SYSTEM_PROMPT_FILE = 'brief.system.md';

/** Generate spends a model call — rate-limit it per client. */
export const GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/**
 * What the model must return; paths and lines are checked by code afterwards.
 * `Risk` and `BriefFocusItem` are the shared contract schemas as they are: both have only required
 * fields (valid for strict structured output). Only `summary` is declared here — the persisted
 * `PrBrief` carries many fields the model must not produce, so the answer cannot be a `.pick`.
 */
export const PrBriefAnswer = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(BriefFocusItem),
});
export type PrBriefAnswer = z.infer<typeof PrBriefAnswer>;
