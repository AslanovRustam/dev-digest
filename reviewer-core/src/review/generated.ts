import type { UnifiedDiff } from '@devdigest/shared';

/**
 * Machine-written files a reviewer should not read in bulk: lockfiles,
 * migration-tool snapshots, source maps. They carry no reviewable intent, yet
 * they can dominate a diff — on PR #6, 18.7k of 23.5k changed lines were
 * drizzle-kit `migrations/meta/*_snapshot.json`, which a `git diff` would put
 * into the prompt in full.
 *
 * Only paths — which the PR author controls — decide the match, so the filter
 * is deliberately narrow: no executable patterns (a `*.min.js` runs, so it is
 * reviewed), and a matching file is skipped only when its change is LARGE. A
 * small, targeted lockfile edit (a swapped `resolved` URL or `integrity`
 * hash) stays in the prompt, and every skip is named in the review summary.
 */
const GENERATED_PATTERNS: readonly RegExp[] = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/,
  // drizzle-kit `meta/_journal.json` + `meta/NNNN_snapshot.json` (the .sql stays reviewable).
  /(^|\/)migrations\/meta\/[^/]+\.json$/,
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
