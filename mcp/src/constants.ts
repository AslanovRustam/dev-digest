/** Ring 0: limits and defaults. No logic, no imports. */

export const DEFAULT_API_URL = 'http://localhost:3001';

export const DEFAULT_RUN_WAIT_MS = 600_000;
export const MAX_RUN_WAIT_MS = 1_800_000;

export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const MIN_POLL_INTERVAL_MS = 1_000;
export const MAX_POLL_INTERVAL_MS = 60_000;

export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const MIN_HTTP_TIMEOUT_MS = 1_000;
export const MAX_HTTP_TIMEOUT_MS = 120_000;

/** How many known repos / PR numbers an actionable "not found" message lists. */
export const KNOWN_LIST_LIMIT = 10;

/** Longest error text from the API that is passed on to a tool message. */
export const MAX_API_MESSAGE_CHARS = 200;

/** Findings returned by run_agent_on_pr (get_findings takes `limit`). */
export const DEFAULT_FINDINGS_LIMIT = 20;

/** Truncation limits for text that can carry untrusted LLM / PR content. */
export const AGENT_DESCRIPTION_MAX = 120;
export const SUMMARY_MAX = 300;
export const FINDING_TEXT_MAX = 400;
export const SNIPPET_MAX = 300;
export const RUN_ERROR_MAX = 200;

/** get_blast_radius output caps: symbol groups listed, and endpoints / crons per group. */
export const BLAST_SYMBOLS_MAX = 10;
export const BLAST_FACTS_MAX = 20;
