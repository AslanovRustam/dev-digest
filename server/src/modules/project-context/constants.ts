/**
 * Project Context (L05) — literals. Search roots live in `AppConfig`
 * (`PROJECT_CONTEXT_ROOTS`), not here.
 */

/** Extension of every project document (matched case-insensitively). */
export const CONTEXT_EXTENSION = '.md';

/** Directory names never walked, at any depth. Hidden dirs such as `.devdigest` ARE walked. */
export const CONTEXT_EXCLUDED_DIRS = ['.git', 'node_modules'] as const;

/** Documents listed per repo; the rest only count in `total` ("+N more not listed"). */
export const MAX_LISTED_DOCUMENTS = 1000;

/** Files over 1 MB are "too large": listed, never read, never injected. */
export const MAX_READ_BYTES = 1024 * 1024;

/** Cap on a saved / uploaded document, in UTF-8 bytes. */
export const MAX_SAVE_BYTES = 256 * 1024;

/** Paths per agent or skill. */
export const MAX_ATTACHMENTS = 100;

/** Per-document token cap, truncation marker included. */
export const DOC_TOKEN_LIMIT = 8000;

/** Token budget for all project documents of one run. */
export const RUN_TOKEN_BUDGET = 24000;

/** Appended to a cut document so the model knows the text is partial. */
export const TRUNCATION_MARKER =
  '\n\n[… truncated by DevDigest: this document exceeds the 8,000-token limit]';

/** `POST /repos/:id/context/documents` — each save writes to GitHub. */
export const SAVE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** `POST /repos/:id/context/rescan` — each rescan fetches from GitHub. */
export const RESCAN_RATE_LIMIT = { max: 6, timeWindow: '1 minute' } as const;

/** Every save goes to a NEW branch under this prefix, then a PR. */
export const BRANCH_PREFIX = 'devdigest/context/';

/** Body of the PR a save opens. */
export const SAVE_PR_BODY = 'Opened from DevDigest → Project Context.';
