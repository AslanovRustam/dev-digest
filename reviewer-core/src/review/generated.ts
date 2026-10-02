import type { UnifiedDiff } from '@devdigest/shared';

/**
 * Machine-written files a reviewer should never read: lockfiles, migration
 * tool snapshots, minified bundles and source maps. They carry no reviewable
 * intent, yet they can dominate a diff — on PR #6, 18.7k of 23.5k changed lines
 * were drizzle-kit `migrations/meta/*_snapshot.json`, which a `git diff` would
 * put into the prompt in full (GitHub's per-file patches happen to omit them).
 */
const GENERATED_PATTERNS: readonly RegExp[] = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/,
  // drizzle-kit `meta/_journal.json` + `meta/NNNN_snapshot.json` (the .sql stays reviewable).
  /(^|\/)migrations\/meta\/[^/]+\.json$/,
  /\.min\.(js|css)$/,
  /\.map$/,
];

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
 * Drop generated files from a diff — both from `files` (so grounding and the
 * file count agree) and from `raw` (so the prompt never carries them). Text
 * before the first `diff --git` header is kept as is.
 */
export function excludeGeneratedFiles(diff: UnifiedDiff): { diff: UnifiedDiff; excluded: string[] } {
  const excluded = diff.files.filter((f) => isGeneratedPath(f.path)).map((f) => f.path);
  if (excluded.length === 0) return { diff, excluded };

  const parts = diff.raw.split(/^(?=diff --git )/m);
  const kept = parts.filter((part) => {
    if (!part.startsWith('diff --git ')) return true;
    const path = blockPath(part);
    return !(path && isGeneratedPath(path));
  });
  return {
    diff: { raw: kept.join(''), files: diff.files.filter((f) => !isGeneratedPath(f.path)) },
    excluded,
  };
}
