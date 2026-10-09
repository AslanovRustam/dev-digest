import { z } from 'zod';
import {
  IntentConfidence,
  IntentRiskKind,
  type ChatMessage,
  type IntentRiskArea,
  type IntentSource,
  type PrIntentRecord,
  type UnifiedDiff,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { PrIntentRow } from '../../db/rows.js';
import {
  DEPENDENCY_BLOCKS,
  DOC_EXTENSIONS,
  DOC_HOSTS_UNSUPPORTED,
  MAX_DEPENDENCIES,
  MAX_DESCRIPTION_CHARS,
  MAX_DOCS_TOTAL_CHARS,
  MAX_DOC_CHARS,
  MAX_FILES,
  MAX_HUNKS_PER_FILE,
  MAX_ISSUE_CHARS,
  MAX_RISK_AREAS,
  MAX_RISK_LABEL_CHARS,
  MAX_SCOPE_ITEMS,
  MAX_SCOPE_ITEM_CHARS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
  NON_DEPENDENCY_KEYS,
  TICKET_HOSTS,
} from './constants.js';

/**
 * Pure domain logic for the intent layer: what the classifier is asked for, how
 * references are found in the PR text, how the prompt is bounded, and how
 * confidence is capped by CODE. No I/O — the service feeds data in.
 */

// ---- LLM contract -----------------------------------------------------------

/**
 * What the classifier returns. No length constraints here (strict structured
 * output rejects them) — `clampClassification` enforces the caps in code.
 */
export const IntentClassification = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence,
  risk_areas: z.array(z.object({ kind: IntentRiskKind, label: z.string() })),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

const UNCLEAR_SUMMARY = 'Unclear from the available sources.';

function clampText(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function clampList(items: string[], max: number, maxChars: number): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const t = clampText(raw, maxChars);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Enforce the output caps in code; risk areas from the model are tagged `origin: 'model'`. */
export function clampClassification(data: IntentClassification): {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: IntentClassification['confidence'];
  risk_areas: IntentRiskArea[];
} {
  const risk: IntentRiskArea[] = [];
  for (const r of data.risk_areas) {
    const label = clampText(r.label, MAX_RISK_LABEL_CHARS);
    if (!label || risk.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue;
    risk.push({ kind: r.kind, label, origin: 'model' });
    if (risk.length >= MAX_RISK_AREAS) break;
  }
  return {
    summary: clampText(data.summary, MAX_SUMMARY_CHARS) || UNCLEAR_SUMMARY,
    in_scope: clampList(data.in_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    out_of_scope: clampList(data.out_of_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    confidence: data.confidence,
    risk_areas: risk,
  };
}

/** Code-derived dependency risks first, then the model's; deduped by lower-cased label. */
export function mergeRiskAreas(dependencies: string[], modelAreas: IntentRiskArea[]): IntentRiskArea[] {
  const out: IntentRiskArea[] = [];
  const seen = new Set<string>();
  const push = (a: IntentRiskArea) => {
    const key = a.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  for (const name of dependencies) {
    push({ kind: 'dependency', label: `New dependency: ${name}`, origin: 'code' });
  }
  for (const a of modelAreas) push(a);
  return out;
}

// ---- Confidence (computed by code) -------------------------------------------

const CONFIDENCE_RANK: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * The model only reports a confidence; CODE caps it. An empty description caps
 * at `low`; any issue / plan / ticket that could not be used caps at `medium`.
 * The result is min(model, cap) — the model can lower it, never raise it.
 */
export function computeConfidence(input: {
  model: IntentConfidence;
  descriptionEmpty: boolean;
  refFailures: number;
}): IntentConfidence {
  const cap: IntentConfidence = input.descriptionEmpty
    ? 'low'
    : input.refFailures > 0
      ? 'medium'
      : 'high';
  return CONFIDENCE_RANK[input.model] <= CONFIDENCE_RANK[cap] ? input.model : cap;
}

/** Human-readable notes for everything the classifier could not see. Code-created. */
export function missingContextLines(sources: IntentSource[], descriptionEmpty: boolean): string[] {
  const lines: string[] = [];
  if (descriptionEmpty) lines.push('PR description is empty');
  for (const s of sources) {
    if (s.kind !== 'issue' && s.kind !== 'plan' && s.kind !== 'ticket') continue;
    if (s.status === 'used') continue;
    lines.push(`${s.ref}: ${s.reason ?? s.status}`);
  }
  return lines;
}

/** Linked issues / plans / tickets that could not be used — the input to the `medium` confidence cap. */
export function countRefFailures(sources: IntentSource[]): number {
  return sources.filter(
    (s) => (s.kind === 'issue' || s.kind === 'plan' || s.kind === 'ticket') && s.status !== 'used',
  ).length;
}

export interface RefFailure {
  status: 'unreachable' | 'unsupported';
  reason: string;
}

/** Why a reference could not be read — derived from the error's status / code ONLY, never its message. */
export function describeFailure(err: unknown): RefFailure {
  const e = err as { status?: number; code?: string; name?: string } | null | undefined;
  if (e?.code === 'not_a_file') return { status: 'unsupported', reason: 'not a regular file' };
  if (e?.code === 'too_large') return { status: 'unsupported', reason: 'file too large to read' };
  if (e?.status === 404 || e?.status === 410) {
    return { status: 'unreachable', reason: `GitHub returned ${e.status} (not found)` };
  }
  if (e?.status === 403 || e?.status === 429) {
    return { status: 'unreachable', reason: `GitHub returned ${e.status} (rate limited / forbidden)` };
  }
  if (e?.name === 'TimeoutError') return { status: 'unreachable', reason: 'request timed out' };
  return { status: 'unreachable', reason: 'GitHub request failed' };
}

/** A plan doc that 404s was not found at the PR head — say so instead of the generic GitHub reason. */
export function planFailureReason(failure: RefFailure, headSha: string): string {
  return failure.reason === 'GitHub returned 404 (not found)' ? `not found at head ${shortSha(headSha)}` : failure.reason;
}

// ---- Truncation --------------------------------------------------------------

export interface Truncated {
  text: string;
  truncated: boolean;
  originalChars: number;
}

/** Head-only truncation with an explicit marker, so the model knows text was cut. */
export function truncate(text: string, max: number): Truncated {
  if (text.length <= max) return { text, truncated: false, originalChars: text.length };
  const cut = text.length - max;
  return {
    text: `${text.slice(0, max)}\n[… truncated ${cut} chars]`,
    truncated: true,
    originalChars: text.length,
  };
}

// ---- Reference extraction -----------------------------------------------------

/**
 * Normalise a repo-relative path from PR text. Returns null for anything that
 * could escape the repo (absolute paths, drive letters, `..` segments).
 * Copy of `conventions/helpers.ts#normaliseRepoPath` — sibling modules must not
 * import each other's helpers.
 */
export function normaliseRepoPath(path: string): string | null {
  const p = path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const segments = p.split('/');
  if (segments.some((s) => s === '..' || s === '')) return null;
  return p;
}

export type RefKind = 'issue' | 'plan' | 'ticket';

export interface ParsedRef {
  kind: RefKind;
  /** Display / dedupe key (`#12`, `docs/x.md`, `PROJ-7`, a URL without its query). */
  ref: string;
  /** Issue / PR number (same-repo issues only). */
  number?: number;
  /** Repo-relative doc path (plans only). */
  path?: string;
  /** Set when the reference must NOT be fetched; the service records it as-is. */
  fixed?: { status: 'unsupported' | 'no_credentials'; reason: string };
}

const CROSS_REPO = 'cross-repository reference';
const NO_TRACKER = 'no Jira/Linear integration configured';
const UNSUPPORTED_HOST = 'document host is not supported';

const CLOSING_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*(?:([\w.-]+)\/([\w.-]+))?#(\d{1,7})\b/gi;
const ISSUE_URL_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d{1,7})\b/gi;
const BARE_RE = /(?<![\w/&])(?:([\w.-]+)\/([\w.-]+))?#(\d{1,7})\b/g;
const BLOB_URL_RE = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/\s)]+\/([^\s)#?"'<>]+)/gi;
const MD_LINK_RE = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
const URL_RE = /https?:\/\/[^\s)>\]"'<]+/gi;
const TICKET_KEY = '[A-Z][A-Z0-9]{1,9}-\\d+';

const extOf = (p: string): string => {
  const m = p.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
};
const isDocPath = (p: string): boolean => (DOC_EXTENSIONS as readonly string[]).includes(extOf(p));
const stripQuery = (u: string): string => u.replace(/[?#].*$/, '').replace(/[.,;:]+$/, '');
const hostOf = (u: string): string => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};

/**
 * Find everything in the PR text the intent may rest on, in priority order:
 * closing-keyword issues, issue URLs, bare `#N`, same-repo blob / relative doc
 * paths, tracker URLs and ticket keys (title start / branch only), unsupported
 * doc hosts. Deterministic and deduplicated; nothing here touches the network.
 */
export function extractReferences(
  body: string | null | undefined,
  title: string,
  branch: string,
  repo: { owner: string; name: string },
): ParsedRef[] {
  const text = body ?? '';
  const out: ParsedRef[] = [];
  const seen = new Set<string>();
  const me = `${repo.owner}/${repo.name}`.toLowerCase();

  const add = (r: ParsedRef): void => {
    const key = `${r.kind}:${r.ref.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };
  const issue = (owner: string | undefined, name: string | undefined, n: number): void => {
    if (owner && name && `${owner}/${name}`.toLowerCase() !== me) {
      add({ kind: 'issue', ref: `${owner}/${name}#${n}`, fixed: { status: 'unsupported', reason: CROSS_REPO } });
    } else {
      add({ kind: 'issue', ref: `#${n}`, number: n });
    }
  };
  const doc = (owner: string | undefined, name: string | undefined, raw: string): void => {
    if (owner && name && `${owner}/${name}`.toLowerCase() !== me) {
      add({ kind: 'plan', ref: `${owner}/${name}:${raw}`, fixed: { status: 'unsupported', reason: CROSS_REPO } });
      return;
    }
    const path = normaliseRepoPath(raw);
    if (path && isDocPath(path)) add({ kind: 'plan', ref: path, path });
  };

  for (const m of text.matchAll(CLOSING_RE)) issue(m[1], m[2], Number(m[3]));
  for (const m of text.matchAll(ISSUE_URL_RE)) issue(m[1], m[2], Number(m[3]));
  for (const m of text.matchAll(BARE_RE)) issue(m[1], m[2], Number(m[3]));

  for (const m of text.matchAll(BLOB_URL_RE)) {
    const path = stripQuery(decodeURIComponentSafe(m[3] ?? ''));
    if (isDocPath(path)) doc(m[1], m[2], path);
  }
  for (const m of text.matchAll(MD_LINK_RE)) {
    const target = m[1] ?? '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const path = stripQuery(decodeURIComponentSafe(target)).replace(/^\//, '');
    if (isDocPath(path)) doc(undefined, undefined, path);
  }
  // Bare relative paths: not preceded by a path/URL character, so URLs never match.
  for (const m of text.matchAll(/(?<![\w/:.@-])((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]+)(?![\w/])/g)) {
    if (isDocPath(m[1] ?? '')) doc(undefined, undefined, m[1] ?? '');
  }

  // Trackers + unsupported doc hosts, by URL.
  for (const m of text.matchAll(URL_RE)) {
    const url = stripQuery(m[0]);
    const host = hostOf(url);
    if (!host) continue;
    if (TICKET_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      add({ kind: 'ticket', ref: url, fixed: { status: 'no_credentials', reason: NO_TRACKER } });
    } else if (DOC_HOSTS_UNSUPPORTED.some((h) => host.includes(h))) {
      add({ kind: 'plan', ref: url, fixed: { status: 'unsupported', reason: UNSUPPORTED_HOST } });
    }
  }
  // Ticket keys: title start or branch start / after "/" only — never free body text
  // (UTF-8, SHA-256 … would all look like keys).
  const titleKey = title.match(new RegExp(`^\\s*(?:\\[(${TICKET_KEY})\\]|(${TICKET_KEY})(?=:))`));
  const titleRef = titleKey?.[1] ?? titleKey?.[2];
  if (titleRef) {
    add({ kind: 'ticket', ref: titleRef, fixed: { status: 'no_credentials', reason: NO_TRACKER } });
  }
  const branchKey = branch.match(new RegExp(`(?:^|/)(${TICKET_KEY})(?!\\d)`));
  if (branchKey?.[1]) {
    add({ kind: 'ticket', ref: branchKey[1], fixed: { status: 'no_credentials', reason: NO_TRACKER } });
  }
  return out;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---- Diff-derived inputs (paths, hunk headers, new dependencies) --------------

/**
 * `path (+a/−d)` per file followed by its hunk headers rebuilt from the parsed
 * hunks. NEVER reads `diff.raw` — the classifier sees where the change is, not
 * what it says.
 */
export function fileListSection(diff: UnifiedDiff): string {
  const lines: string[] = [];
  const files = diff.files.slice(0, MAX_FILES);
  for (const f of files) {
    lines.push(`${f.path} (+${f.additions}/−${f.deletions})`);
    for (const h of f.hunks.slice(0, MAX_HUNKS_PER_FILE)) {
      const heading = h.heading ? ` ${h.heading}` : '';
      lines.push(`  @@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@${heading}`);
    }
    if (f.hunks.length > MAX_HUNKS_PER_FILE) {
      lines.push(`  … ${f.hunks.length - MAX_HUNKS_PER_FILE} more hunk(s)`);
    }
  }
  if (diff.files.length > files.length) {
    lines.push(`… ${diff.files.length - files.length} more file(s)`);
  }
  return lines.join('\n');
}

/**
 * A diff rebuilt by `rawFromPatches` keeps only `@@` lines for non-manifest files, so the parser
 * counts `+0/−0` for them. Restore the per-file counts GitHub reported (pr_files / PR detail).
 */
export function applyStoredCounts(
  diff: UnifiedDiff,
  files: { path: string; additions?: number | null; deletions?: number | null }[],
): UnifiedDiff {
  const counts = new Map(files.map((f) => [f.path, f]));
  return {
    ...diff,
    files: diff.files.map((f) => {
      const c = counts.get(f.path);
      return c ? { ...f, additions: c.additions ?? f.additions, deletions: c.deletions ?? f.deletions } : f;
    }),
  };
}

/** Build a raw diff from stored per-file patches: `package.json` keeps its body, others only `@@` lines. */
export function rawFromPatches(files: { path: string; patch?: string | null }[]): string {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    const isPkg = /(^|\/)package\.json$/.test(f.path);
    parts.push(`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`);
    parts.push(isPkg ? f.patch : f.patch.split('\n').filter((l) => l.startsWith('@@')).join('\n'));
  }
  return parts.join('\n');
}

const DEP_ENTRY_RE = /^\s*"(@?[\w.\-/]+)"\s*:\s*"([^"]*)"\s*,?\s*$/;
const VERSION_LIKE_RE = /^(?:[~^><=]*\d[\w.\-+*]*|\*|latest|workspace:.+|npm:.+)$/;
const BLOCK_OPEN_RE = /"([\w@/.-]+)"\s*:\s*\{\s*,?\s*$/;

/**
 * Names of dependencies a PR ADDS, read from `package.json` sections of the raw
 * diff only (the one place raw diff text is inspected, by code, never forwarded).
 *
 * A same-name `+`/`-` pair is a version bump, not a new dependency. Entries are
 * only counted inside a `dependencies`-style block; when the hunk hides the
 * block header the version-shaped value check and the non-dependency key list
 * (`name`, `version`, …) are the heuristic — a `scripts` entry never has a
 * version-shaped value.
 */
export function addedDependencies(diff: UnifiedDiff): string[] {
  const added: string[] = [];
  const removed = new Set<string>();
  let inPackage = false;
  // undefined = block header not visible in this hunk; null = top level; string = key of the open block
  let block: string | null | undefined;

  for (const line of diff.raw.split('\n')) {
    if (line.startsWith('diff --git')) {
      inPackage = /\sb\/(?:.*\/)?package\.json\s*$/.test(line);
      block = undefined;
      continue;
    }
    if (!inPackage) continue;
    if (line.startsWith('@@')) {
      block = line.replace(/^@@[^@]*@@/, '').match(BLOCK_OPEN_RE)?.[1] ?? undefined;
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const sign = line[0];
    if (sign !== '+' && sign !== '-' && sign !== ' ') continue;
    const text = line.slice(1);

    const open = text.match(BLOCK_OPEN_RE);
    if (open) {
      block = open[1];
      continue;
    }
    if (/^\s*\}/.test(text)) {
      block = null;
      continue;
    }
    if (sign === ' ') continue;
    const entry = text.match(DEP_ENTRY_RE);
    if (!entry) continue;
    const [, name, version] = entry;
    if (!name || !version || !VERSION_LIKE_RE.test(version)) continue;
    if ((NON_DEPENDENCY_KEYS as readonly string[]).includes(name)) continue;
    if (block === null) continue;
    if (block !== undefined && !(DEPENDENCY_BLOCKS as readonly string[]).includes(block)) continue;
    if (sign === '+') added.push(name);
    else removed.add(name);
  }
  return [...new Set(added)].filter((n) => !removed.has(n)).slice(0, MAX_DEPENDENCIES);
}

// ---- Classifier prompt ----------------------------------------------------------

export interface ClassifierIssue {
  ref: string;
  title: string;
  state: string;
  body: string | null | undefined;
}
export interface ClassifierDoc {
  path: string;
  content: string;
}
export interface ClassifierInput {
  /** Rendered system prompt (trusted). */
  system: string;
  title: string;
  description: string;
  issues: ClassifierIssue[];
  docs: ClassifierDoc[];
  /** From `fileListSection` — paths and hunk headers only. */
  fileList: string;
  /** Names from `addedDependencies` (code-generated, trusted). */
  dependencies: string[];
  /** From `missingContextLines` (code-generated, trusted). */
  missingNotes: string[];
}
export interface ClassifierSection {
  name: string;
  chars: number;
  originalChars: number;
  truncated: boolean;
  /** Text as sent (used for token counts); never logged. */
  text: string;
}

/**
 * Build the classifier messages. Every PR-derived string sits in a
 * `wrapUntrusted` block with a FIXED code label (never a user path); the
 * trusted, code-generated lists (new dependencies, missing context) are outside.
 */
export function buildClassifierMessages(input: ClassifierInput): {
  messages: ChatMessage[];
  sections: ClassifierSection[];
} {
  const sections: ClassifierSection[] = [];
  const parts: string[] = [];
  const record = (name: string, t: Truncated, text = t.text): void => {
    sections.push({ name, chars: text.length, originalChars: t.originalChars, truncated: t.truncated, text });
  };
  const sizeOnly = (text: string): Truncated => ({ text, truncated: false, originalChars: text.length });

  const title = truncate(input.title, MAX_TITLE_CHARS);
  record('pr-title', title);
  parts.push(`## PR title\n${wrapUntrusted('pr-title', title.text)}`);

  if (input.description.trim()) {
    const d = truncate(input.description, MAX_DESCRIPTION_CHARS);
    record('pr-description', d);
    parts.push(`## PR description\n${wrapUntrusted('pr-description', d.text)}`);
  } else {
    parts.push('## PR description\n(empty)');
  }

  const issueBlocks: string[] = [];
  input.issues.forEach((iss, i) => {
    const t = truncate(`${iss.ref} (${iss.state}): ${iss.title}\n\n${iss.body ?? ''}`.trim(), MAX_ISSUE_CHARS);
    record(`issue-${i + 1}`, t);
    issueBlocks.push(wrapUntrusted(`issue-${i + 1}`, t.text));
  });
  if (issueBlocks.length > 0) parts.push(`## Linked issues\n${issueBlocks.join('\n\n')}`);

  const docBlocks: string[] = [];
  let docBudget = MAX_DOCS_TOTAL_CHARS;
  input.docs.forEach((d, i) => {
    const t = truncate(d.content, Math.max(0, Math.min(MAX_DOC_CHARS, docBudget)));
    docBudget -= t.text.length;
    const text = `Path: ${d.path}\n\n${t.text}`;
    record(`doc-${i + 1}`, t, text);
    docBlocks.push(wrapUntrusted(`doc-${i + 1}`, text));
  });
  if (docBlocks.length > 0) parts.push(`## Linked plans / specs\n${docBlocks.join('\n\n')}`);

  record('file-list', sizeOnly(input.fileList));
  parts.push(`## Changed files (paths and hunk headers only)\n${wrapUntrusted('file-list', input.fileList)}`);

  if (input.dependencies.length > 0) {
    const text = input.dependencies.map((n) => `- ${n}`).join('\n');
    record('new-dependencies', sizeOnly(text));
    parts.push(`## New dependencies (from package.json diff)\n${text}`);
  }
  if (input.missingNotes.length > 0) {
    const text = input.missingNotes.map((n) => `- ${n}`).join('\n');
    record('missing-context', sizeOnly(text));
    parts.push(`## Missing context\n${text}`);
  }

  return {
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: parts.join('\n\n') },
    ],
    sections,
  };
}

// ---- Mapping -------------------------------------------------------------------

export function toRecord(row: PrIntentRow): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    sources: row.sources,
    missing_context: row.missingContext,
    risk_areas: row.riskAreas,
    head_sha: row.headSha,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    derived_at: row.derivedAt.toISOString(),
  };
}

/** The stored intent was derived from another head than the PR's current one. */
export function isStale(storedHeadSha: string, currentHeadSha: string): boolean {
  return storedHeadSha !== currentHeadSha;
}

export const shortSha = (sha: string): string => sha.slice(0, 7);
