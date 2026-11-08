import type {
  ContextAttachmentStatus,
  ContextAttachments,
  ContextDocList,
  ContextDocRead,
  ContextDocType,
  WorkingFile,
  WorkingFileErrorCode,
} from '@devdigest/shared';
import {
  BRANCH_PREFIX,
  CONTEXT_EXTENSION,
  DOC_TOKEN_LIMIT,
  MAX_ATTACHMENTS,
  MAX_LISTED_DOCUMENTS,
  MAX_READ_BYTES,
  RUN_TOKEN_BUDGET,
  TRUNCATION_MARKER,
} from './constants.js';

/**
 * Project Context — pure rules: path checks, document typing, the agent ⊕ skill
 * merge, the per-document / per-run token budget, and the DTO builders. The
 * run and the Context tab both budget through `budgetDocuments`, so the tab's
 * total equals the trace's (NFR-4).
 */

const DOC_TYPES: readonly ContextDocType[] = ['specs', 'docs', 'insights'];

/**
 * Type of a document = the nearest folder on its path named after a search
 * root (`.devdigest/specs/x.md` → specs). A configured root outside the three
 * types maps to `docs`. Null when no folder matches — not a project document.
 */
export function docTypeFor(path: string, roots: readonly string[]): ContextDocType | null {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const dir = dirs[i]!;
    if (roots.includes(dir)) {
      return (DOC_TYPES as readonly string[]).includes(dir) ? (dir as ContextDocType) : 'docs';
    }
  }
  return null;
}

export type PathProblem =
  | 'empty'
  | 'invalid'
  | 'backslash'
  | 'absolute'
  | 'traversal'
  | 'not_md'
  | 'outside_roots'
  | 'duplicate'
  | 'too_many';

const PATH_PROBLEM_TEXT: Record<PathProblem, string> = {
  empty: 'The path is empty',
  invalid: 'The path holds a control character',
  backslash: 'Use "/" in paths, not "\\"',
  absolute: 'The path must be relative to the repository root',
  traversal: 'The path must not contain ".", ".." or empty segments',
  not_md: 'Only .md files are allowed',
  outside_roots: 'The file must sit under one of the project-context folders',
  duplicate: 'The path is listed twice',
  too_many: `At most ${MAX_ATTACHMENTS} documents can be attached`,
};

export function pathProblemText(problem: PathProblem): string {
  return PATH_PROBLEM_TEXT[problem];
}

/** First problem of an untrusted repo-relative document path, or null. */
export function pathProblem(path: string): PathProblem | null {
  if (path.length === 0) return 'empty';
  if (path.includes('\0')) return 'invalid';
  if (path.includes('\\')) return 'backslash';
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return 'absolute';
  if (path.split('/').some((s) => s === '' || s === '.' || s === '..')) return 'traversal';
  if (!path.toLowerCase().endsWith(CONTEXT_EXTENSION)) return 'not_md';
  return null;
}

/** A save target: a valid path that also sits under a search root. */
export function docPathProblem(path: string, roots: readonly string[]): PathProblem | null {
  return pathProblem(path) ?? (docTypeFor(path, roots) ? null : 'outside_roots');
}

/** The whole set-attachments list is rejected on its first problem (AC-38). */
export function attachmentPathsProblem(
  paths: readonly string[],
): { path: string | null; problem: PathProblem } | null {
  if (paths.length > MAX_ATTACHMENTS) return { path: null, problem: 'too_many' };
  const seen = new Set<string>();
  for (const path of paths) {
    const problem = pathProblem(path);
    if (problem) return { path, problem };
    if (seen.has(path)) return { path, problem: 'duplicate' };
    seen.add(path);
  }
  return null;
}

export interface MergedAttachment {
  path: string;
  /** Skill name it is inherited from; null = own. */
  via: string | null;
}

/** Own paths in order, then each skill's in skill order; a path's first occurrence wins (AC-18). */
export function mergeAttachments(
  own: readonly string[],
  skills: readonly { name: string; paths: readonly string[] }[],
): MergedAttachment[] {
  const seen = new Set<string>();
  const out: MergedAttachment[] = [];
  const add = (path: string, via: string | null) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, via });
  };
  for (const p of own) add(p, null);
  for (const s of skills) for (const p of s.paths) add(p, s.name);
  return out;
}

/** Paths across several agents, in agent order then each agent's own order; a path's first occurrence wins. */
export function mergeAgentDocuments(
  perAgent: readonly { name: string; items: readonly MergedAttachment[] }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const agent of perAgent) {
    for (const item of agent.items) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      out.push(item.path);
    }
  }
  return out;
}

/** Group ordered `(skill, path)` rows into ordered per-skill lists. */
export function groupSkillLists(
  rows: readonly { skillId: string; skillName: string; path: string }[],
): { name: string; paths: string[] }[] {
  const lists = new Map<string, { name: string; paths: string[] }>();
  for (const r of rows) {
    const list = lists.get(r.skillId) ?? { name: r.skillName, paths: [] };
    list.paths.push(r.path);
    lists.set(r.skillId, list);
  }
  return [...lists.values()];
}

/** A document read for a run or a tab: its text (and cached full-text tokens) or why not. */
export type DocRead =
  | { ok: true; text: string; tokens?: number }
  | { ok: false; reason: WorkingFileErrorCode };

export interface TokenOps {
  count(text: string): number;
  truncate(text: string, max: number): string;
}

export interface BudgetResult {
  /** What the prompt gets, in order. */
  injected: { path: string; text: string }[];
  /** One entry per merged attachment, in order. */
  trace: ContextDocRead[];
  /** Tokens injected (≤ RUN_TOKEN_BUDGET). */
  totalTokens: number;
  /** Tokens of every readable document after the per-document cap, before drops. */
  requestedTokens: number;
}

/**
 * Per-document cap (AC-20: the first tokens + a marker, ≤ DOC_TOKEN_LIMIT in
 * all), then the run budget (AC-21: whole documents dropped from the end until
 * the rest fit). Unreadable documents are skipped with their reason (AC-22).
 */
export function budgetDocuments(
  items: readonly MergedAttachment[],
  reads: ReadonlyMap<string, DocRead>,
  tok: TokenOps,
): BudgetResult {
  const markerTokens = tok.count(TRUNCATION_MARKER);
  const docs = items.map((item) => {
    const read = reads.get(item.path) ?? { ok: false as const, reason: 'not_found' as const };
    if (!read.ok) {
      return { ...item, status: 'skipped' as ContextDocRead['status'], reason: read.reason, tokens: null as number | null, text: '' };
    }
    const full = read.tokens ?? tok.count(read.text);
    if (full <= DOC_TOKEN_LIMIT) {
      return { ...item, status: 'injected' as ContextDocRead['status'], reason: null as string | null, tokens: full, text: read.text };
    }
    const text = tok.truncate(read.text, DOC_TOKEN_LIMIT - markerTokens) + TRUNCATION_MARKER;
    return { ...item, status: 'truncated' as ContextDocRead['status'], reason: null as string | null, tokens: tok.count(text), text };
  });

  const requestedTokens = docs.reduce((sum, d) => sum + (d.tokens ?? 0), 0);
  let totalTokens = requestedTokens;
  for (let i = docs.length - 1; i >= 0 && totalTokens > RUN_TOKEN_BUDGET; i--) {
    const d = docs[i]!;
    if (d.status === 'skipped') continue;
    totalTokens -= d.tokens ?? 0;
    d.status = 'dropped';
    d.reason = 'budget';
  }

  return {
    injected: docs
      .filter((d) => d.status === 'injected' || d.status === 'truncated')
      .map((d) => ({ path: d.path, text: d.text })),
    trace: docs.map((d) => ({
      path: d.path,
      tokens: d.tokens,
      status: d.status,
      ...(d.reason ? { reason: d.reason } : {}),
      via: d.via,
    })),
    totalTokens,
    requestedTokens,
  };
}

/** How a Context tab labels an attached path that could not be read. */
export function attachmentStatusFor(reason: string): ContextAttachmentStatus {
  if (reason === 'too_large') return 'too_large';
  if (reason === 'not_found' || reason === 'symlink' || reason === 'outside_clone') return 'not_in_repo';
  return 'unknown';
}

/**
 * The Context tab DTO. `budget` null = no active repo / no clone (AC-14): rows
 * are listed but cannot be counted.
 */
export function toAttachmentsView(
  merged: readonly MergedAttachment[],
  budget: BudgetResult | null,
): ContextAttachments {
  if (!budget) {
    return {
      items: merged.map((m) => ({
        path: m.path,
        via_skill: m.via,
        status: 'unknown',
        tokens: null,
        truncated: false,
        dropped: false,
      })),
      total_tokens: 0,
      requested_tokens: 0,
      budget: RUN_TOKEN_BUDGET,
    };
  }
  return {
    items: budget.trace.map((d) => ({
      path: d.path,
      via_skill: d.via,
      status: d.status === 'skipped' ? attachmentStatusFor(d.reason ?? '') : 'present',
      tokens: d.tokens,
      truncated: d.status === 'truncated',
      dropped: d.status === 'dropped',
    })),
    total_tokens: budget.totalTokens,
    requested_tokens: budget.requestedTokens,
    budget: RUN_TOKEN_BUDGET,
  };
}

/** Distinct agents per path (direct or via an enabled skill link). */
export function usedByCounts(pairs: readonly { agentId: string; path: string }[]): Map<string, number> {
  const agents = new Map<string, Set<string>>();
  for (const { agentId, path } of pairs) {
    const set = agents.get(path) ?? new Set<string>();
    set.add(agentId);
    agents.set(path, set);
  }
  return new Map([...agents].map(([path, set]) => [path, set.size]));
}

export interface SelectedDocument {
  file: WorkingFile;
  type: ContextDocType;
}

/** Working files under a search root; `listed` is capped at MAX_LISTED_DOCUMENTS. */
export function selectDocuments(
  files: readonly WorkingFile[],
  roots: readonly string[],
): { total: number; listed: SelectedDocument[] } {
  const all: SelectedDocument[] = [];
  for (const file of files) {
    const type = docTypeFor(file.path, roots);
    if (type) all.push({ file, type });
  }
  return { total: all.length, listed: all.slice(0, MAX_LISTED_DOCUMENTS) };
}

export function isTooLarge(file: WorkingFile): boolean {
  return file.size > MAX_READ_BYTES;
}

export function buildDocList(
  selected: { total: number; listed: readonly SelectedDocument[] },
  roots: readonly string[],
  tokens: ReadonlyMap<string, number | null>,
  usedBy: ReadonlyMap<string, number>,
  scannedAt: string,
): ContextDocList {
  return {
    state: 'ok',
    scanned_at: scannedAt,
    total: selected.total,
    roots: [...roots],
    documents: selected.listed.map(({ file, type }) => ({
      path: file.path,
      type,
      tokens: isTooLarge(file) ? null : (tokens.get(file.path) ?? null),
      too_large: isTooLarge(file),
      used_by_agents: usedBy.get(file.path) ?? 0,
    })),
  };
}

export function notClonedList(roots: readonly string[]): ContextDocList {
  return { state: 'not_cloned', scanned_at: null, total: 0, roots: [...roots], documents: [] };
}

/** `devdigest/context/<file-slug>-<yyyyMMddHHmmss>` (UTC) — a new branch per save. */
export function branchName(path: string, now: Date): string {
  const base = (path.split('/').pop() ?? '').replace(/\.md$/i, '');
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'document';
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${BRANCH_PREFIX}${slug}-${stamp}`;
}

/** Default commit message (and PR title) of a save. */
export function commitMessage(mode: 'create' | 'update', path: string): string {
  return `docs: ${mode === 'create' ? 'add' : 'update'} ${path}`;
}
