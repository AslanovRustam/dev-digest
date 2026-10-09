import type { DiffHunk, Finding, UnifiedDiff } from '@devdigest/shared';
import { FULL_FILE_KINDS } from '../grounding.js';

/**
 * Deterministic-first out-of-scope filter (intent layer, R3).
 *
 * The model tags each finding `scope: 'in' | 'out'` against the derived intent.
 * That tag is advisory and comes from untrusted-derived text, so CODE decides:
 *
 *  1. full-file kinds (secret_leak, …) are exempt — never filtered;
 *  2. not tagged `out` → kept;
 *  3. a finding whose range touches an ADDED line of its file is the PR's own
 *     new code → always in scope (an injected intent cannot suppress it);
 *  4. the remaining `out` findings are candidates: exactly ONE CRITICAL
 *     candidate survives as a labelled "outside this PR's scope" signal, the
 *     rest are dropped. Intent can therefore never turn a real defect into
 *     zero findings.
 *
 * Pure: no I/O.
 */

export const OUT_OF_SCOPE_PREFIX = "**Outside this PR's stated scope** — ";

export interface ScopeResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
  /** The single out-of-scope finding kept as a signal (already in `kept`, rationale prefixed). */
  signal: Finding | null;
}

const serious = (f: Finding): boolean => f.severity === 'CRITICAL';

function intersects(f: Finding, lines: Iterable<number>): boolean {
  for (const n of lines) if (n >= f.start_line && n <= f.end_line) return true;
  return false;
}

function hunkCovers(f: Finding, h: DiffHunk): boolean {
  const lines =
    h.newLineNumbers && h.newLineNumbers.length > 0
      ? h.newLineNumbers
      : Array.from({ length: Math.max(h.newLines, 1) }, (_, i) => h.newStart + i);
  return intersects(f, lines);
}

/**
 * Does the finding touch an added line? Conservative: a hunk without
 * `addedLineNumbers` (hand-built diffs) counts as touching when the range
 * intersects the hunk at all, so the filter can only ever under-drop.
 */
function touchesAddedLine(f: Finding, diff: UnifiedDiff): boolean {
  const file = diff.files.find((x) => x.path === f.file);
  if (!file) return true; // not in the diff — grounding owns that decision
  for (const h of file.hunks) {
    if (h.addedLineNumbers) {
      if (intersects(f, h.addedLineNumbers)) return true;
    } else if (hunkCovers(f, h)) {
      return true;
    }
  }
  return false;
}

export function applyIntentScope(findings: Finding[], diff: UnifiedDiff): ScopeResult {
  const decided = new Map<Finding, Finding>();
  const candidates: Finding[] = [];

  for (const f of findings) {
    if (f.kind && FULL_FILE_KINDS.has(f.kind)) continue;
    if (f.scope !== 'out') continue;
    if (touchesAddedLine(f, diff)) {
      decided.set(f, { ...f, scope: 'in' });
      continue;
    }
    candidates.push(f);
  }

  // Exactly one serious candidate: highest confidence, then first.
  let signalSrc: Finding | null = null;
  for (const c of candidates) {
    if (!serious(c)) continue;
    if (!signalSrc || c.confidence > signalSrc.confidence) signalSrc = c;
  }
  const signal = signalSrc
    ? { ...signalSrc, rationale: `${OUT_OF_SCOPE_PREFIX}${signalSrc.rationale}` }
    : null;

  const dropped: ScopeResult['dropped'] = [];
  const dropSet = new Set<Finding>();
  for (const c of candidates) {
    if (c === signalSrc) continue;
    dropSet.add(c);
    dropped.push({
      finding: c,
      reason: serious(c)
        ? 'out of scope; only one out-of-scope signal is kept'
        : 'out of scope (intent)',
    });
  }

  const kept: Finding[] = [];
  for (const f of findings) {
    if (dropSet.has(f)) continue;
    if (f === signalSrc && signal) kept.push(signal);
    else kept.push(decided.get(f) ?? f);
  }
  return { kept, dropped, signal };
}
