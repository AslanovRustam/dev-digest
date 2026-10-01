import { z } from 'zod';
import {
  ConventionCategory,
  type ChatMessage,
  type ConventionCandidate,
  type ConventionScan,
  type ConventionSkillDraft,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import {
  CONFIG_FILE_NAMES,
  FENCE_LANG,
  MAX_SAMPLES_PER_DIR,
  MAX_SNIPPET_LINES,
  MIN_SAMPLE_LINES,
  MIN_SNIPPET_CHARS,
  NON_PROJECT_SEGMENTS,
} from './constants.js';

/**
 * Pure domain logic for the Conventions Extractor: what the model is asked
 * for, the evidence gate that decides which proposals are real, and the skill
 * draft built from accepted candidates. No I/O — the service feeds file
 * contents in and persists what comes out.
 */

// ---- LLM contract ----------------------------------------------------------

/**
 * What the model returns. Narrower than the DB/DTO shape on purpose: the model
 * never assigns ids, status or line ranges — the server computes those from
 * the verified snippet. `evidence_line` is only a hint for picking between
 * several matches. Nullable rather than optional (OpenAI strict mode).
 */
export const ConventionExtraction = z.object({
  candidates: z.array(
    z.object({
      category: ConventionCategory,
      rule: z.string(),
      evidence_path: z.string(),
      evidence_snippet: z.string(),
      evidence_line: z.number().int().nullable(),
      confidence: z.number(),
    }),
  ),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
export type RawCandidate = ConventionExtraction['candidates'][number];

/** A file handed to the model. `truncated` is stated in the prompt so it does not cite past the cut. */
export interface SampleFile {
  path: string;
  content: string;
  truncated: boolean;
}

// ---- Sampling --------------------------------------------------------------

/**
 * Config files worth reading for a sample: every known config name at the repo
 * root, then under each distinct top-level directory of the sampled files.
 * Order = priority (root first); the service reads them and keeps the first
 * few that exist.
 */
export function configCandidatesFor(samplePaths: string[]): string[] {
  const dirs = [''];
  for (const p of samplePaths) {
    const slash = p.indexOf('/');
    if (slash > 0) {
      const top = p.slice(0, slash);
      if (!dirs.includes(top)) dirs.push(top);
    }
  }
  return dirs.flatMap((d) => CONFIG_FILE_NAMES.map((n) => (d ? `${d}/${n}` : n)));
}

function topDir(path: string): string {
  const slash = path.indexOf('/');
  return slash > 0 ? path.slice(0, slash) : '';
}

function parentDir(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : '';
}

/**
 * Reorder a rank-ordered pool so the sample spans the repo: round-robin over
 * top-level directories (`client/`, `server/`, …), at most `perDir` files per
 * directory in the first pass, then everything left in rank order. The caller
 * reads files in this order until it has enough non-trivial ones.
 */
export function diversifySample(ranked: string[], perDir = MAX_SAMPLES_PER_DIR): string[] {
  const groups = new Map<string, string[]>();
  for (const p of ranked) {
    const key = topDir(p);
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const queues = [...groups.values()];
  const perDirCount = new Map<string, number>();
  const picked: string[] = [];
  const taken = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const q of queues) {
      const i = q.findIndex((p) => (perDirCount.get(parentDir(p)) ?? 0) < perDir);
      if (i < 0) continue;
      const [p] = q.splice(i, 1);
      perDirCount.set(parentDir(p!), (perDirCount.get(parentDir(p!)) ?? 0) + 1);
      picked.push(p!);
      taken.add(p!);
      progress = true;
    }
  }
  return [...picked, ...ranked.filter((p) => !taken.has(p))];
}

/** False for vendored, generated, fixture or hidden-directory files — not the team's own code. */
export function isProjectSource(path: string): boolean {
  const segments = path.split('/').slice(0, -1);
  return !segments.some(
    (seg) => seg.startsWith('.') || (NON_PROJECT_SEGMENTS as readonly string[]).includes(seg),
  );
}

/** True when a file has too little code to show a convention (barrels, stubs). */
export function isTrivialSample(content: string): boolean {
  let n = 0;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim()) n += 1;
    if (n >= MIN_SAMPLE_LINES) return false;
  }
  return true;
}

/** Cap a file for the prompt by lines, then by characters. */
export function truncateForPrompt(
  content: string,
  maxLines: number,
  maxChars: number,
): { text: string; truncated: boolean } {
  const lines = content.split(/\r?\n/);
  let text = lines.length > maxLines ? lines.slice(0, maxLines).join('\n') : lines.join('\n');
  let truncated = lines.length > maxLines;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    const lastNl = text.lastIndexOf('\n');
    if (lastNl > 0) text = text.slice(0, lastNl);
    truncated = true;
  }
  return { text, truncated };
}

// ---- Prompt ----------------------------------------------------------------

/**
 * System prompt (trusted, from `src/prompts`) + one user message carrying the
 * repo's files as untrusted data and the maintainer's earlier decisions.
 * Rejected rules are fed back so a re-scan does not propose them again.
 */
export function buildExtractionMessages(input: {
  system: string;
  repoFullName: string;
  configs: SampleFile[];
  sources: SampleFile[];
  rejectedRules: string[];
  acceptedRules: string[];
}): ChatMessage[] {
  const sections: string[] = [`Repository: ${input.repoFullName}`];
  if (input.acceptedRules.length > 0) {
    sections.push(
      `## Already accepted — do not propose these again\n${bullets(input.acceptedRules)}`,
    );
  }
  if (input.rejectedRules.length > 0) {
    sections.push(
      `## Dismissed by the maintainer — do not propose these or close variants\n${bullets(input.rejectedRules)}`,
    );
  }
  if (input.configs.length > 0) {
    sections.push(`## Config files\n${input.configs.map(fileBlock).join('\n\n')}`);
  }
  sections.push(`## Source files\n${input.sources.map(fileBlock).join('\n\n')}`);
  return [
    { role: 'system', content: input.system },
    { role: 'user', content: sections.join('\n\n') },
  ];
}

function bullets(items: string[]): string {
  return items.map((r) => `- ${r}`).join('\n');
}

function fileBlock(f: SampleFile): string {
  const note = f.truncated ? ' (truncated — cite only what is shown)' : '';
  return `### ${f.path}${note}\n${wrapUntrusted(f.path, f.content)}`;
}

// ---- Evidence gate ---------------------------------------------------------

/**
 * Normalise a model-supplied repo-relative path. Returns null for anything
 * that could escape the clone (absolute paths, drive letters, `..` segments) —
 * the git port reads `join(clonePath, path)` without a guard of its own.
 */
export function normaliseRepoPath(path: string): string | null {
  const p = path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const segments = p.split('/');
  if (segments.some((s) => s === '..' || s === '')) return null;
  return p;
}

/** Collapse runs of whitespace — indentation and line wrapping are not evidence. */
function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export interface SnippetLocation {
  start: number;
  end: number;
  /** The file's own lines for [start, end] — what the UI shows, never the model's text. */
  snippet: string;
}

/**
 * Find `snippet` in `content`, whitespace-insensitive and line by line: every
 * non-blank snippet line must appear, in order, inside consecutive non-blank
 * file lines (blank file lines in between are skipped). The first and last
 * lines may be partial. When the snippet occurs more than once, the match
 * nearest the model's `hintLine` wins. Returns null when it is not there.
 */
export function locateSnippet(
  content: string,
  snippet: string,
  hintLine: number | null,
): SnippetLocation | null {
  const want = snippet.split(/\r?\n/).map(squash).filter((l) => l.length > 0);
  if (want.length === 0 || want.length > MAX_SNIPPET_LINES) return null;
  if (want.join(' ').length < MIN_SNIPPET_CHARS) return null;

  const raw = content.split(/\r?\n/);
  const have = raw.map(squash);
  const matches: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < have.length; i += 1) {
    if (!have[i] || !have[i]!.includes(want[0]!)) continue;
    let j = i;
    let k = 0;
    let ok = true;
    while (k < want.length) {
      while (j < have.length && have[j] === '') j += 1;
      if (j >= have.length || !have[j]!.includes(want[k]!)) {
        ok = false;
        break;
      }
      k += 1;
      j += 1;
    }
    if (ok) matches.push({ start: i, end: j - 1 });
  }
  if (matches.length === 0) return null;

  const hint = hintLine !== null && hintLine > 0 ? hintLine - 1 : null;
  const best =
    hint === null
      ? matches[0]!
      : matches.reduce((a, b) => (Math.abs(b.start - hint) < Math.abs(a.start - hint) ? b : a));
  return {
    start: best.start + 1,
    end: best.end + 1,
    snippet: raw.slice(best.start, best.end + 1).join('\n'),
  };
}

/** Dedupe key for a rule: case, punctuation and spacing do not make a new convention. */
export function ruleKey(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Dedupe key for evidence: the same category proven by the same lines is the
 * same convention even when the maintainer has since reworded the rule.
 */
export function evidenceKey(category: string, path: string, startLine: number): string {
  return `${category}|${path}|${startLine}`;
}

/** What a scan must not propose again: triaged rules, by wording and by evidence. */
export interface KnownConventions {
  ruleKeys: Set<string>;
  evidenceKeys: Set<string>;
}

export function knownConventions(
  rows: Array<{ rule: string; category: string; evidencePath: string | null; evidenceStartLine: number | null }>,
): KnownConventions {
  return {
    ruleKeys: new Set(rows.map((r) => ruleKey(r.rule))),
    evidenceKeys: new Set(
      rows
        .filter((r) => r.evidencePath && r.evidenceStartLine)
        .map((r) => evidenceKey(r.category, r.evidencePath!, r.evidenceStartLine!)),
    ),
  };
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  // Some models answer in percent.
  const v = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, v));
}

export interface GroundedCandidate {
  category: RawCandidate['category'];
  rule: string;
  evidencePath: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface GroundingOutcome {
  kept: GroundedCandidate[];
  droppedUngrounded: number;
  droppedDuplicate: number;
}

/**
 * The evidence gate. A proposal survives only if its file exists in the clone
 * (`files` maps a normalised path to its content, or null when unreadable) and
 * its snippet is really in that file. Line numbers come from the match, and a
 * rule already known — earlier in this scan or already triaged, by wording or
 * by evidence location — is a duplicate. Nothing here trusts the model's text beyond using it as a search key.
 */
export function groundCandidates(
  raw: RawCandidate[],
  files: Map<string, string | null>,
  known: KnownConventions,
): GroundingOutcome {
  const kept: GroundedCandidate[] = [];
  const seen = new Set(known.ruleKeys);
  const seenEvidence = new Set(known.evidenceKeys);
  let droppedUngrounded = 0;
  let droppedDuplicate = 0;
  for (const c of raw) {
    const rule = c.rule.trim();
    const path = normaliseRepoPath(c.evidence_path);
    const content = path ? files.get(path) : null;
    const loc = content ? locateSnippet(content, c.evidence_snippet, c.evidence_line) : null;
    if (!rule || !path || !loc) {
      droppedUngrounded += 1;
      continue;
    }
    const key = ruleKey(rule);
    const evKey = evidenceKey(c.category, path, loc.start);
    if (seen.has(key) || seenEvidence.has(evKey)) {
      droppedDuplicate += 1;
      continue;
    }
    seen.add(key);
    seenEvidence.add(evKey);
    kept.push({
      category: c.category,
      rule,
      evidencePath: path,
      evidenceStartLine: loc.start,
      evidenceEndLine: loc.end,
      evidenceSnippet: loc.snippet,
      confidence: clampConfidence(c.confidence),
    });
  }
  return { kept, droppedUngrounded, droppedDuplicate };
}

// ---- Skill draft -----------------------------------------------------------

export function slugify(s: string, maxWords = 6): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .slice(0, maxWords)
      .join('-') || 'convention'
  );
}

/** `path:start-end` (or `path:line`) — the citation format used across the UI and skills. */
export function evidenceRef(path: string, start: number, end: number): string {
  return start === end ? `${path}:${start}` : `${path}:${start}-${end}`;
}

function fenceLang(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return FENCE_LANG[ext] ?? '';
}

/** Longest backtick run in `text` + 1, min 3 — so a snippet containing ``` cannot close the fence. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

export type DraftInput = Pick<
  ConventionRow,
  'category' | 'rule' | 'evidencePath' | 'evidenceStartLine' | 'evidenceEndLine' | 'evidenceSnippet'
>;

/**
 * Merge accepted candidates into one editable skill draft. The body follows
 * `docs/skills/README.md`: no leading `#` heading (the prompt block adds
 * `### Skill: <name>`), directive wording, one section per rule with its real
 * evidence, and an instruction to cite `file:line`.
 */
export function buildSkillDraft(repoName: string, rows: DraftInput[]): ConventionSkillDraft {
  const repo = slugify(repoName, 8);
  const categories = [...new Set(rows.map((r) => r.category))];
  const single = categories.length === 1 && categories[0] !== 'other' ? categories[0]! : null;
  const name = single ? `${repo}-${single}-conventions` : `${repo}-conventions`;
  const n = rows.length;
  const description =
    `Use when reviewing changes in ${repoName}. Flag code that breaks ` +
    `${n === 1 ? 'its house convention' : `one of its ${n} house conventions`} ` +
    `(${categories.join(', ')}) and cite the offending file:line.`;

  const usedSlugs = new Set<string>();
  const sections = rows.map((r) => {
    let slug = slugify(r.rule);
    for (let i = 2; usedSlugs.has(slug); i += 1) slug = `${slugify(r.rule)}-${i}`;
    usedSlugs.add(slug);
    const ref = evidenceRef(r.evidencePath ?? '', r.evidenceStartLine ?? 1, r.evidenceEndLine ?? 1);
    const code = r.evidenceSnippet ?? '';
    const fence = fenceFor(code);
    return [
      `## ${slug}`,
      r.rule,
      '',
      `Detected in \`${ref}\`:`,
      `${fence}${fenceLang(r.evidencePath ?? '')}`,
      code,
      fence,
    ].join('\n');
  });

  const body = [
    `House conventions for \`${repoName}\`, extracted from its code and approved by a maintainer. ` +
      'Flag changes in the diff that violate any rule below and cite the offending `file:line`. ' +
      'Report only code the diff adds or changes; a convention break is a WARNING unless it also ' +
      'causes a bug.',
    ...sections,
  ].join('\n\n');

  return {
    name,
    description,
    type: 'convention',
    body,
    evidence_files: rows.map((r) =>
      evidenceRef(r.evidencePath ?? '', r.evidenceStartLine ?? 1, r.evidenceEndLine ?? 1),
    ),
  };
}

// ---- DTOs ------------------------------------------------------------------

export function toConventionDto(
  row: ConventionRow,
  skillName: string | null,
  sourceSha: string | null,
): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    scan_id: row.scanId,
    source_sha: sourceSha,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_start_line: row.evidenceStartLine ?? 1,
    evidence_end_line: row.evidenceEndLine ?? row.evidenceStartLine ?? 1,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
    skill_id: row.skillId,
    skill_name: skillName,
    created_at: row.createdAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    source_sha: row.sourceSha,
    sample_files: row.sampleFiles,
    model: row.model,
    proposed: row.proposed,
    dropped_ungrounded: row.droppedUngrounded,
    dropped_duplicate: row.droppedDuplicate,
    cost_usd: row.costUsd,
    created_at: row.createdAt.toISOString(),
  };
}
