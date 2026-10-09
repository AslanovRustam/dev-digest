/**
 * Intent layer tunables. Every source the classifier sees is budgeted here so
 * one derivation is one cheap structured call with a predictable prompt size.
 */

// ---- Prompt budgets (chars) -------------------------------------------------
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_ISSUE_CHARS = 4000;
export const MAX_DOC_CHARS = 12000;
export const MAX_DOCS_TOTAL_CHARS = 24000;

/** References actually fetched; the rest are recorded as `skipped`. */
export const MAX_REFERENCES = 5;
/** File-list section caps (paths + hunk headers only — never diff bodies). */
export const MAX_FILES = 200;
export const MAX_HUNKS_PER_FILE = 20;
/** A linked doc larger than this is refused by the GitHub adapter (`too_large`). */
export const MAX_DOC_BYTES = 1_000_000;

/** Only files with these extensions are read as linked plans / specs. */
export const DOC_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'] as const;

// ---- Output clamps ----------------------------------------------------------
export const MAX_SUMMARY_CHARS = 600;
export const MAX_SCOPE_ITEMS = 8;
export const MAX_SCOPE_ITEM_CHARS = 200;
export const MAX_RISK_AREAS = 5;
export const MAX_RISK_LABEL_CHARS = 80;
/** New package.json dependency names forwarded to the classifier / shown as risk areas. */
export const MAX_DEPENDENCIES = 20;

// ---- Classifier call --------------------------------------------------------
export const CLASSIFIER_TIMEOUT_MS = 60_000;
export const CLASSIFIER_MAX_RETRIES = 2;
export const CLASSIFY_SCHEMA_NAME = 'PrIntentClassification';
export const SYSTEM_PROMPT_FILE = 'intent.system.md';

/** Explicit (re-)derive spends a model call — rate-limit it per client. */
export const DERIVE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

// ---- Reference hosts --------------------------------------------------------
/** Ticket trackers: recorded as `no_credentials`, never fetched. */
export const TICKET_HOSTS = ['atlassian.net', 'linear.app'] as const;
/** Doc hosts we cannot read: recorded as `unsupported`, never fetched. */
export const DOC_HOSTS_UNSUPPORTED = ['docs.google.com', 'notion.so', 'confluence'] as const;

/** package.json blocks whose entries are dependencies. */
export const DEPENDENCY_BLOCKS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;
/** package.json keys that look like `"key": "1.0.0"` but are not dependencies. */
export const NON_DEPENDENCY_KEYS = ['name', 'version', 'main', 'types', 'module'] as const;
