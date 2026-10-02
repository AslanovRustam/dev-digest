import type { UnifiedDiff } from '@devdigest/shared';

/**
 * Machine-written files a reviewer should not read in bulk: migration-tool
 * snapshots and source maps. They carry no reviewable intent, yet they can
 * dominate a diff — on PR #6, 18.7k of 23.5k changed lines were drizzle-kit
 * `migrations/meta/*_snapshot.json`, which a `git diff` would put into the
 * prompt in full.
 *
 * Paths are author-controlled, so the list is deliberately narrow — nothing the
 * system reads at runtime or install time: no
 * lockfiles (a swapped `resolved` URL / `integrity` hash is a supply-chain
 * attack the reviewer must see, and line-count padding could hide it) and no
 * executables (`*.min.js` runs). Skips are named in the review summary.
 */
const GENERATED_PATTERNS: readonly RegExp[] = [
  // drizzle-kit `meta/NNNN_snapshot.json` — read only by `drizzle-kit generate`. NOT
  // `meta/_journal.json`: the migrator reads it at runtime to pick and order the .sql files.
  /(^|\/)migrations\/meta\/\d+_snapshot\.json$/,
  /\.map$/,
];

/** A generated file is skipped only when it changed more lines than this. */
export const GENERATED_SKIP_MIN_LINES = 50;

export function isGeneratedPath(path: string): boolean {
  return GENERATED_PATTERNS.some((re) => re.test(path));
}

/** The new-side path of one `diff --git a/X b/Y` block. */
function blockPath(block: string): string | null {
  const plus = /^\+\+\+ b\/(.+)$/m.exec(block);
  if (plus) return plus[1]!.trim();
  const header = /^diff --git a\/.+ b\/(.+)$/m.exec(block);
  return header ? header[1]!.trim() : null;
}

/**
 * Drop LARGE generated files from a diff — from `files` (so grounding and the
 * file count agree) and from `raw` (so the prompt never carries them). Text
 * before the first `diff --git` header is kept as is.
 */
export function excludeGeneratedFiles(
  diff: UnifiedDiff,
  minLines = GENERATED_SKIP_MIN_LINES,
): { diff: UnifiedDiff; excluded: string[] } {
  const skip = (f: UnifiedDiff['files'][number]) =>
    isGeneratedPath(f.path) && f.additions + f.deletions > minLines;
  const excluded = diff.files.filter(skip).map((f) => f.path);
  if (excluded.length === 0) return { diff, excluded };
  const excludedSet = new Set(excluded);

  const parts = diff.raw.split(/^(?=diff --git )/m);
  const kept = parts.filter((part) => {
    if (!part.startsWith('diff --git ')) return true;
    const path = blockPath(part);
    return !(path && excludedSet.has(path));
  });
  return {
    diff: { raw: kept.join(''), files: diff.files.filter((f) => !excludedSet.has(f.path)) },
    excluded,
  };
}
