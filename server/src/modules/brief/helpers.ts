import type {
  BlastCaller,
  BlastRadiusResponse,
  ChangedSymbol,
  DownstreamImpact,
  PrIntentRecord,
  BriefFocusItem,
  BriefInput,
  BriefStaleReason,
  ChatMessage,
  Risk,
  SmartDiffRole,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { SMART_DIFF_DEFAULT_ROLE, SMART_DIFF_RULES } from '../reviews/constants.js';
import {
  CAP_BLAST,
  CAP_DESCRIPTION,
  CAP_DIFF,
  CAP_FINDINGS,
  CAP_INTENT,
  CAP_ISSUE,
  DOC_SAFETY_MARGIN,
  INPUT_BUDGET_TOKENS,
  MAX_FOCUS,
  MAX_MISSING_DOC_LINES,
  MAX_MISSING_PATH_CHARS,
  MAX_RISKS,
  MAX_SUMMARY_CHARS,
  TRUNCATION_MARKER,
  type PrBriefAnswer,
} from './constants.js';

/**
 * PR Brief pure logic (ring 0): role + hunk-range extraction, the budgeted model
 * input, the check of the model's answer and the staleness rule. No I/O.
 * The model sees numbers, roles and fenced text — never a diff line (AC-23).
 */

/** Token counter, structurally typed so this file imports no adapter. */
export interface TokenOps {
  count(text: string): number;
  truncate(text: string, max: number): string;
}

export interface LineRange {
  start: number;
  end: number;
}

// ---- Facts (structural inputs) ----------------------------------------------

export interface BriefFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
  /** Precomputed new-side ranges (when the file came from hunks, not a stored patch). */
  ranges?: LineRange[];
}

/** The slice of `BlastRadiusResponse` the brief reads. */
export type BriefBlastFact = Pick<BlastRadiusResponse, 'degraded' | 'reason' | 'summary'> & {
  changed_symbols: Pick<ChangedSymbol, 'name' | 'file'>[];
  downstream: (Pick<DownstreamImpact, 'symbol'> & { callers: BlastCaller[] })[];
};

/** The slice of `PrIntentRecord` the brief reads, plus the staleness the service computed. */
export type BriefIntentFact = Pick<
  PrIntentRecord,
  'intent' | 'in_scope' | 'out_of_scope' | 'confidence' | 'head_sha'
> & {
  risk_areas: Pick<PrIntentRecord['risk_areas'][number], 'kind' | 'label'>[];
  stale: boolean;
};

export type BriefIssueFact =
  | { status: 'ok'; number: number; title: string; body: string }
  | { status: 'missing'; reason: 'none_linked' | 'github_unavailable' };

export interface BriefFindingFact {
  severity: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
}

export interface BriefFacts {
  files: BriefFile[];
  /** null = the blast read failed. */
  blast: BriefBlastFact | null;
  intent: BriefIntentFact | null;
  title: string;
  description: string;
  issue: BriefIssueFact;
  /** null = the PR has no review yet. */
  findings: BriefFindingFact[] | null;
  /** `tokens` (when known) saves a second count in `fitDocuments`. */
  documents: { path: string; text: string; tokens?: number }[];
  documentsMissing: 'none_attached' | 'not_cloned' | 'unreadable' | null;
  /** Attached documents that could not be read, while others were; one record each. */
  documentsUnreadable?: string[];
}

export interface BriefSection {
  name: string;
  chars: number;
  tokens: number;
  truncated: boolean;
  originalChars: number;
}

// ---- Small extractors ---------------------------------------------------------

/** Role of a path: first matching smart-diff rule wins, otherwise the default. */
export function roleOf(path: string): SmartDiffRole {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const rule of SMART_DIFF_RULES) {
    if (rule.patterns.some((p) => p.re.test(normalised))) return rule.role;
  }
  return SMART_DIFF_DEFAULT_ROLE;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** New-side line ranges from the `@@ … +c,d @@` headers only; the lines themselves are never read. */
export function newSideRanges(patch: string | null): LineRange[] {
  if (!patch) return [];
  const out: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0 && start >= 1) out.push({ start, end: start + len - 1 });
  }
  return out;
}

const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)(?!\w)/gi;
/** CSS-like words right before a `#N` (same line): only then is a 3/6/8-digit `#N` a colour. */
const COLOUR_CONTEXT =
  /(?:colou?r|background|border|outline|fill|stroke|hex|rgba?|hsla?|var\([^)]*,|--[\w-]+)\s*[:=,(]?\s*$/i;

const toIssueNumber = (digits: string): number | null => {
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * The same-repo issue a PR description links, or null. `closes|fixes|resolves #N` wins;
 * otherwise the first `#N` that is not another repo's (`owner/repo#N`), an HTML entity
 * (`&#39;`) or a hex colour (`color: #112233`).
 */
export function firstIssueNumber(body: string): number | null {
  for (const m of body.matchAll(CLOSING_REF)) {
    const n = toIssueNumber(m[1]!);
    if (n !== null) return n;
  }
  for (const m of body.matchAll(/(?<![\w/&])#(\d+)(?!\w)/g)) {
    const digits = m[1]!;
    const before = body.slice(Math.max(0, m.index - 32), m.index).split('\n').pop()!;
    const colourLength = digits.length === 3 || digits.length === 6 || digits.length === 8;
    // `#fff` never matches `\d+`; a pure-decimal `#N` is a colour only after CSS-like context.
    if (colourLength && COLOUR_CONTEXT.test(before)) continue;
    const n = toIssueNumber(digits);
    if (n !== null) return n;
  }
  return null;
}

/** Cut `text` to `capTokens` (marker included); untouched when it fits. */
export function capSection(
  text: string,
  capTokens: number,
  tok: TokenOps,
): { text: string; truncated: boolean } {
  if (tok.count(text) <= capTokens) return { text, truncated: false };
  const room = Math.max(0, capTokens - tok.count(TRUNCATION_MARKER));
  return { text: tok.truncate(text, room) + TRUNCATION_MARKER, truncated: true };
}

// ---- Documents ----------------------------------------------------------------

export interface FittedDocument {
  path: string;
  text: string;
  tokens: number;
  truncated: boolean;
}

export interface FitResult {
  kept: FittedDocument[];
  /** Paths dropped whole because the share ran out. */
  dropped: string[];
}

const MIN_DOC_CUT_TOKENS = 40;

/**
 * Whole documents while they fit `share` tokens, in order; the next one is cut
 * with a marker; the rest are dropped (AC-26). `overhead` is the wrapper cost per kept document.
 */
export function fitDocuments(
  docs: { path: string; text: string; tokens?: number }[],
  share: number,
  tok: TokenOps,
  overhead = 0,
): FitResult {
  const kept: FittedDocument[] = [];
  const dropped: string[] = [];
  let left = share;
  let full = false;
  for (const doc of docs) {
    if (full) {
      dropped.push(doc.path);
      continue;
    }
    const tokens = doc.tokens ?? tok.count(doc.text);
    if (tokens + overhead <= left) {
      kept.push({ path: doc.path, text: doc.text, tokens, truncated: false });
      left -= tokens + overhead;
      continue;
    }
    full = true;
    const room = left - overhead - tok.count(TRUNCATION_MARKER);
    if (room >= MIN_DOC_CUT_TOKENS) {
      const cut = tok.truncate(doc.text, room) + TRUNCATION_MARKER;
      kept.push({ path: doc.path, text: cut, tokens: tok.count(cut), truncated: true });
      left = 0;
    } else {
      dropped.push(doc.path);
    }
  }
  return { kept, dropped };
}

// ---- Model input --------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
const MAX_RANGES_PER_FILE = 12;
const TITLE_CAP_TOKENS = 100;

const shortSha = (sha: string): string => sha.slice(0, 7);

function diffLine(f: BriefFile): string {
  const ranges = f.ranges ?? newSideRanges(f.patch);
  const shown = ranges
    .slice(0, MAX_RANGES_PER_FILE)
    .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))
    .join(',');
  const more = ranges.length > MAX_RANGES_PER_FILE ? ',…' : '';
  return `${f.path} +${f.additions} -${f.deletions} ${roleOf(f.path)}${shown ? ` ${shown}${more}` : ''}`;
}

function diffSection(
  files: BriefFile[],
  tok: TokenOps,
  cap = CAP_DIFF,
): { text: string; truncated: boolean; originalChars: number } {
  const lines = files.map(diffLine);
  const all = lines.join('\n');
  if (tok.count(all) <= cap) return { text: all, truncated: false, originalChars: all.length };
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = tok.count(line) + 1;
    // reserve room for the "… +N files" tail
    if (used + cost + 12 > cap) break;
    kept.push(line);
    used += cost;
  }
  const rest = lines.length - kept.length;
  return { text: [...kept, `… +${rest} files`].join('\n'), truncated: true, originalChars: all.length };
}

/** A repo path made safe for the trusted "Missing inputs" block: one line, bounded length. */
function inertPath(path: string): string {
  // Control characters (C0, DEL, C1) and the Unicode line / paragraph separators become a space.
  const flat = Array.from(path, (ch) => {
    const c = ch.charCodeAt(0);
    return c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ? ' ' : ch;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > MAX_MISSING_PATH_CHARS ? `${flat.slice(0, MAX_MISSING_PATH_CHARS)}…` : flat;
}

/**
 * At most `limit` listed paths, then one "+N more" line per reason (D-2). The code-written
 * "+N more" lines are trusted; the listed paths (repo-controlled text) go in an untrusted fence.
 */
function documentMissingLines(
  entries: { path: string; reason: 'unreadable' | 'over_budget' }[],
  limit: number,
): string[] {
  const lines: string[] = [];
  const rest = entries.slice(limit);
  for (const reason of ['unreadable', 'over_budget'] as const) {
    const n = rest.filter((e) => e.reason === reason).length;
    if (n > 0) lines.push(`- documents: +${n} more (${reason})`);
  }
  const listed = entries.slice(0, limit).map((e) => `${inertPath(e.path)} (${e.reason})`);
  if (listed.length > 0) {
    lines.push(`- documents (listed paths):\n${wrapUntrusted('missing-document-paths', listed.join('\n'))}`);
  }
  return lines;
}

function blastSection(b: BriefBlastFact): string {
  const parts: string[] = [];
  if (b.summary.trim()) parts.push(b.summary.trim());
  for (const d of b.downstream) {
    for (const c of d.callers) parts.push(`${d.symbol} <- ${c.file}:${c.line}`);
  }
  return parts.join('\n');
}

function blastCallerCount(b: BriefBlastFact): number {
  return b.downstream.reduce((n, d) => n + d.callers.length, 0);
}

function intentSection(i: BriefIntentFact): string {
  const lines = [`Summary: ${i.intent}`, `Confidence: ${i.confidence}`];
  if (i.in_scope.length > 0) lines.push(`In scope: ${i.in_scope.join('; ')}`);
  if (i.out_of_scope.length > 0) lines.push(`Out of scope: ${i.out_of_scope.join('; ')}`);
  if (i.risk_areas.length > 0) {
    lines.push(`Risk areas: ${i.risk_areas.map((r) => `${r.kind}: ${r.label}`).join('; ')}`);
  }
  return lines.join('\n');
}

function findingsSection(findings: BriefFindingFact[]): string {
  if (findings.length === 0) return 'No open findings.';
  return [...findings]
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3))
    .map((f) => `[${f.severity}] ${f.title} (${f.file}:${f.startLine}-${f.endLine})`)
    .join('\n');
}

export interface BriefInputResult {
  messages: ChatMessage[];
  sections: BriefSection[];
  inputs: BriefInput[];
}

/**
 * Assemble the one request: system prompt, then the sections in spec order, every
 * PR / repo / model text in a fenced `wrapUntrusted` block with a fixed label.
 * Documents take what is left of the budget.
 */
export function buildBriefInput(
  facts: BriefFacts,
  system: string,
  tok: TokenOps,
): BriefInputResult {
  const sections: BriefSection[] = [];
  const inputs: BriefInput[] = [];
  const blocks: string[] = [];
  /** A capped, fenced block the final budget guard may cut further (D-2). */
  interface Shrinkable {
    index: number;
    head: string;
    label: string;
    /** The section's own cap function: re-cuts the full text to `cap` tokens. */
    recut: (cap: number) => string;
    empty: string;
    section: string;
    source: BriefInput['source'] | null;
    cutTokens: number;
  }
  const shrinkable: Shrinkable[] = [];
  const addBlock = (
    head: string,
    label: string,
    cut: string,
    raw: string,
    section: string,
    source: BriefInput['source'] | null,
    empty = '',
    recut: (cap: number) => string = (cap) => capSection(raw, cap, tok).text,
  ): void => {
    blocks.push(`${head}\n${wrapUntrusted(label, cut || empty)}`);
    shrinkable.push({ index: blocks.length - 1, head, label, recut, empty, section, source, cutTokens: tok.count(cut) });
  };

  /** Records the section and returns its token count, so callers never count the same text twice. */
  const record = (name: string, text: string, truncated: boolean, originalChars = text.length): number => {
    const tokens = tok.count(text);
    sections.push({ name, chars: text.length, tokens, truncated, originalChars });
    return tokens;
  };

  // 1. diff stats + roles
  const diff = diffSection(facts.files, tok);
  addBlock(
    '## Diff stats (path +added -deleted role new-side line ranges)',
    'diff-stats',
    diff.text,
    facts.files.map(diffLine).join('\n'),
    'diff-stats',
    'diff',
    '',
    (cap) => diffSection(facts.files, tok, cap).text,
  );
  const diffTokens = record('diff-stats', diff.text, diff.truncated, diff.originalChars);
  inputs.push({ source: 'diff', status: diff.truncated ? 'truncated' : 'used', tokens: diffTokens });

  // 2. blast radius
  if (facts.blast === null || facts.blast.degraded) {
    inputs.push({
      source: 'blast',
      ref: facts.blast?.reason ?? 'unavailable',
      status: 'missing',
      tokens: 0,
      reason: 'index_incomplete',
    });
  } else {
    const raw = blastSection(facts.blast);
    const cut = capSection(raw, CAP_BLAST, tok);
    const callers = blastCallerCount(facts.blast);
    addBlock('## Blast radius (callers outside the changed code)', 'blast', cut.text, raw, 'blast', 'blast', 'No callers found.');
    const blastTokens = record('blast', cut.text, cut.truncated, raw.length);
    inputs.push({
      source: 'blast',
      status: cut.truncated ? 'truncated' : 'used',
      tokens: blastTokens,
      ...(callers === 0 ? { reason: 'no_callers' as const } : {}),
    });
  }

  // 3. intent
  if (facts.intent === null) {
    inputs.push({ source: 'intent', status: 'missing', tokens: 0, reason: 'not_derived' });
  } else {
    const raw = intentSection(facts.intent);
    const cut = capSection(raw, CAP_INTENT, tok);
    const label = facts.intent.stale
      ? `## Intent (older: derived for commit ${shortSha(facts.intent.head_sha)}, the PR has moved on)`
      : '## Intent';
    addBlock(label, 'intent', cut.text, raw, 'intent', 'intent');
    const intentTokens = record('intent', cut.text, cut.truncated, raw.length);
    inputs.push({
      source: 'intent',
      status: cut.truncated ? 'truncated' : 'used',
      tokens: intentTokens,
      ...(facts.intent.stale ? { reason: 'stale' as const } : {}),
    });
  }

  // 4. title + description
  const title = capSection(facts.title, TITLE_CAP_TOKENS, tok);
  addBlock('## PR title', 'pr-title', title.text, facts.title, 'pr-title', null);
  const titleTokens = record('pr-title', title.text, title.truncated, facts.title.length);
  const descriptionEmpty = facts.description.trim().length === 0;
  if (descriptionEmpty) {
    inputs.push({ source: 'description', status: 'missing', tokens: 0, reason: 'description_empty' });
  } else {
    const cut = capSection(facts.description, Math.max(0, CAP_DESCRIPTION - titleTokens), tok);
    addBlock('## PR description', 'pr-description', cut.text, facts.description, 'pr-description', 'description');
    const descriptionTokens = record('pr-description', cut.text, cut.truncated, facts.description.length);
    inputs.push({
      source: 'description',
      status: cut.truncated ? 'truncated' : 'used',
      tokens: descriptionTokens,
    });
  }

  // 5. linked issue
  if (facts.issue.status === 'missing') {
    inputs.push({ source: 'linked_issue', status: 'missing', tokens: 0, reason: facts.issue.reason });
  } else {
    const raw = `#${facts.issue.number} ${facts.issue.title}\n${facts.issue.body}`;
    const cut = capSection(raw, CAP_ISSUE, tok);
    addBlock('## Linked issue', 'linked-issue', cut.text, raw, 'linked-issue', 'linked_issue');
    const issueTokens = record('linked-issue', cut.text, cut.truncated, raw.length);
    inputs.push({
      source: 'linked_issue',
      ref: `#${facts.issue.number}`,
      status: cut.truncated ? 'truncated' : 'used',
      tokens: issueTokens,
    });
  }

  // 6. review findings
  if (facts.findings === null) {
    inputs.push({ source: 'findings', status: 'missing', tokens: 0, reason: 'no_review' });
  } else {
    const raw = findingsSection(facts.findings);
    const cut = capSection(raw, CAP_FINDINGS, tok);
    addBlock('## Open findings of the newest review (most severe first)', 'findings', cut.text, raw, 'findings', 'findings');
    const findingsTokens = record('findings', cut.text, cut.truncated, raw.length);
    inputs.push({
      source: 'findings',
      status: cut.truncated ? 'truncated' : 'used',
      tokens: findingsTokens,
    });
  }

  // Trusted, code-written list of what the model does not have.
  const missingLines = inputs
    .filter((i) => i.status === 'missing' || i.reason === 'no_callers')
    .map((i) => `- ${i.source}: ${i.reason ?? 'missing'}`);
  if (facts.documentsMissing) missingLines.push(`- documents: ${facts.documentsMissing}`);
  // Built after the document fit: it also names the documents dropped for budget.
  let listLimit = MAX_MISSING_DOC_LINES;
  const missingBlockFor = (dropped: string[]): string => {
    const lines = [
      ...missingLines,
      ...documentMissingLines(
        [
          ...(facts.documentsUnreadable ?? []).map((path) => ({ path, reason: 'unreadable' as const })),
          ...dropped.map((path) => ({ path, reason: 'over_budget' as const })),
        ],
        listLimit,
      ),
    ];
    return lines.length > 0
      ? `## Missing inputs (unknown — never guess their content)\n${lines.join('\n')}`
      : '';
  };

  const render = (docBlocks: string[], dropped: string[]): ChatMessage[] => {
    const missingBlock = missingBlockFor(dropped);
    return [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [...(missingBlock ? [missingBlock] : []), ...blocks, ...docBlocks].join('\n\n'),
      },
    ];
  };
  const total = (msgs: ChatMessage[]) => msgs.reduce((n, m) => n + tok.count(m.content), 0);
  const docBlock = (d: { path: string; text: string }, i: number) =>
    `## Attached document ${i + 1}\n${wrapUntrusted(`document-${i + 1}`, `Path: ${d.path}\n${d.text}`)}`;

  // 7. documents take the rest
  // Base is measured with every document listed as dropped (the widest Missing-inputs block).
  const allPaths = facts.documents.map((d) => d.path);
  const baseTokens = total(render([], allPaths));
  // Overhead is measured with the widest label (the last index). Each pass counts only the
  // document blocks; the rendered request is measured once per accepted pass, dropping / cutting
  // from the end until it fits.
  const overhead = tok.count(docBlock({ path: '', text: '' }, Math.max(0, facts.documents.length - 1))) + 2;
  const attempt = (share: number): FitResult => fitDocuments(facts.documents, share, tok, overhead);
  let share = INPUT_BUDGET_TOKENS - baseTokens - DOC_SAFETY_MARGIN;
  let fit: FitResult = { kept: [], dropped: allPaths };
  let messages = render([], allPaths);
  let blockTokens: number[] = [];
  for (let i = 0; i < 20; i++) {
    const candidate = attempt(Math.max(0, share));
    const counts = candidate.kept.map((d, idx) => tok.count(docBlock(d, idx)));
    const estimate = baseTokens + counts.reduce((n, c) => n + c, 0);
    if (candidate.kept.length > 0 && estimate > INPUT_BUDGET_TOKENS) {
      share -= estimate - INPUT_BUDGET_TOKENS;
      continue;
    }
    const rendered = render(candidate.kept.map(docBlock), candidate.dropped);
    const over = total(rendered) - INPUT_BUDGET_TOKENS;
    if (over > 0 && candidate.kept.length > 0) {
      share -= over;
      continue;
    }
    fit = candidate;
    messages = rendered;
    blockTokens = counts;
    break;
  }

  // Final guard (D-2): never send an over-budget request. Fixed shrink order when still over:
  // 1. the listed missing-document paths (10 → none, "+N more" stays), 2. the largest capped
  // section, re-cut from its full text to a smaller cap (its marker and `sections` / `inputs` follow).
  const refit = (): ChatMessage[] => render(fit.kept.map(docBlock), fit.dropped);
  if (total(messages) > INPUT_BUDGET_TOKENS) {
    listLimit = 0;
    messages = refit();
  }
  for (let guard = 0; guard < 60 && total(messages) > INPUT_BUDGET_TOKENS; guard++) {
    const over = total(messages) - INPUT_BUDGET_TOKENS;
    const target = shrinkable
      .filter((s) => s.cutTokens > tok.count(TRUNCATION_MARKER))
      .sort((a, b) => b.cutTokens - a.cutTokens)[0];
    if (!target) break;
    const cutText = target.recut(Math.max(0, target.cutTokens - over));
    blocks[target.index] = `${target.head}\n${wrapUntrusted(target.label, cutText || target.empty)}`;
    const newTokens = tok.count(cutText);
    // No progress (already at its floor): take it out of the candidates so the next one is cut.
    const shrunk = newTokens < target.cutTokens;
    target.cutTokens = shrunk ? newTokens : 0;
    const sec = sections.find((s) => s.name === target.section);
    if (sec) {
      sec.chars = cutText.length;
      sec.tokens = newTokens;
      sec.truncated = true;
    }
    const input = target.source ? inputs.find((i) => i.source === target.source) : undefined;
    if (input) {
      input.status = 'truncated';
      input.tokens = newTokens;
    }
    messages = refit();
  }

  fit.kept.forEach((d, i) => {
    const block = docBlock(d, i);
    const original = facts.documents.find((x) => x.path === d.path);
    sections.push({
      name: `document-${i + 1}`,
      chars: block.length,
      tokens: blockTokens[i] ?? tok.count(block),
      truncated: d.truncated,
      originalChars: d.truncated && original ? docBlock(original, i).length : block.length,
    });
    inputs.push({
      source: 'documents',
      ref: d.path,
      status: d.truncated ? 'truncated' : 'used',
      tokens: d.tokens,
    });
  });
  for (const path of fit.dropped) {
    inputs.push({ source: 'documents', ref: path, status: 'missing', tokens: 0, reason: 'over_budget' });
  }
  for (const path of facts.documentsUnreadable ?? []) {
    inputs.push({ source: 'documents', ref: path, status: 'missing', tokens: 0, reason: 'unreadable' });
  }
  if (facts.documentsMissing) {
    inputs.push({
      source: 'documents',
      status: 'missing',
      tokens: 0,
      reason: facts.documentsMissing,
    });
  }
  sections.unshift({
    name: 'system',
    chars: system.length,
    tokens: tok.count(system),
    truncated: false,
    originalChars: system.length,
  });
  return { messages, sections, inputs };
}

// ---- Answer check -------------------------------------------------------------

export interface AnswerContext {
  /** PR file → new-side hunk ranges (empty = patch-less / binary). */
  prRanges: Map<string, LineRange[]>;
  /** Blast-map caller file → caller lines. */
  callerLines: Map<string, number[]>;
}

export interface CheckedAnswer {
  summary: string;
  risks: Risk[];
  review_focus: BriefFocusItem[];
  dropped: { risks: number; focus: number };
}

/** Within the cap unchanged; otherwise cut at the last whitespace and end with `…` (≤ cap, no partial word). */
export function capSummary(summary: string): string {
  if (summary.length <= MAX_SUMMARY_CHARS) return summary;
  const room = summary.slice(0, MAX_SUMMARY_CHARS - 1);
  const cut = room.search(/\s\S*$/);
  return `${(cut > 0 ? room.slice(0, cut) : room).trimEnd()}…`;
}

const REF = /^(.+?):(\d+)(?:-(\d+))?$/;

/** An absolute path or one with a `..` segment is never a repo file. */
const isUnsafePath = (path: string): boolean => path.startsWith('/') || path.split(/[\\/]/).includes('..');

const overlaps = (r: LineRange, s: number, e: number) => s <= r.end && e >= r.start;

function checkRef(ref: string, ctx: AnswerContext): string | null {
  const m = REF.exec(ref);
  // A suffix that is not `:N` / `:N-M` (`:12–18`, `:L12`) is dropped; the bare path may still be valid.
  const path = m ? m[1]! : ref.replace(/:[^:/\\]*$/, '');
  if (isUnsafePath(path)) return null;
  const inPr = ctx.prRanges.has(path);
  const callers = ctx.callerLines.get(path);
  if (!inPr && !callers) return null;
  if (!m) return path;
  const start = Number(m[2]);
  const end = m[3] === undefined ? start : Number(m[3]);
  if (!(start >= 1) || end < start) return path;
  const range = m[3] === undefined ? `${start}` : `${start}-${end}`;
  if (inPr) {
    const ranges = ctx.prRanges.get(path)!;
    return ranges.some((r) => overlaps(r, start, end)) ? `${path}:${range}` : path;
  }
  return callers!.some((l) => l >= start && l <= end) ? `${path}:${range}` : path;
}

function nearestStart(line: number, ranges: LineRange[]): number {
  let best = ranges[0]!;
  let bestDist = Infinity;
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const dist = line < r.start ? r.start - line : line > r.end ? line - r.end : 0;
    if (dist < bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  return best.start;
}

/**
 * Keep only what the PR (or the blast map) can back: invented, `../` and absolute
 * paths go, lines move into new-side hunks, caps apply (AC-29 – AC-33, RQ-1).
 */
export function checkAnswer(answer: PrBriefAnswer, ctx: AnswerContext): CheckedAnswer {
  let droppedRisks = 0;
  const risks: Risk[] = [];
  for (const r of answer.risks) {
    const refs = [...new Set(r.file_refs.map((f) => checkRef(f, ctx)).filter((f): f is string => f !== null))];
    if (refs.length === 0) {
      droppedRisks++;
      continue;
    }
    risks.push({ ...r, file_refs: refs });
  }

  let droppedFocus = 0;
  const seen = new Set<string>();
  const focus: BriefFocusItem[] = [];
  for (const item of answer.review_focus) {
    let line: number | null = null;
    const prRanges = ctx.prRanges.get(item.file);
    const callers = ctx.callerLines.get(item.file);
    if (isUnsafePath(item.file)) line = null;
    else if (prRanges) {
      if (prRanges.length === 0) line = item.line;
      else if (prRanges.some((r) => item.line >= r.start && item.line <= r.end)) line = item.line;
      else line = nearestStart(item.line, prRanges);
    } else if (callers && callers.length > 0) {
      line = callers.includes(item.line) ? item.line : Math.min(...callers);
    }
    if (line === null || line < 1) {
      droppedFocus++;
      continue;
    }
    const key = `${item.file}:${line}`;
    if (seen.has(key)) {
      droppedFocus++;
      continue;
    }
    seen.add(key);
    focus.push({ file: item.file, line, reason: item.reason });
  }

  return {
    summary: capSummary(answer.summary),
    risks: risks.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_FOCUS),
    dropped: {
      risks: droppedRisks + Math.max(0, risks.length - MAX_RISKS),
      focus: droppedFocus + Math.max(0, focus.length - MAX_FOCUS),
    },
  };
}

// ---- Staleness ------------------------------------------------------------------

export function staleReasons(
  stored: { head_sha: string; review_id?: string | null },
  current: { headSha: string; newestReviewId: string | null },
): BriefStaleReason[] {
  const reasons: BriefStaleReason[] = [];
  if (stored.head_sha !== current.headSha) reasons.push('new_commit');
  if (current.newestReviewId !== null && current.newestReviewId !== (stored.review_id ?? null)) {
    reasons.push('new_review');
  }
  return reasons;
}
