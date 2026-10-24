import type { ChangedSymbol } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { FUNCTION_KINDS } from "./constants";

/** symbol name → kind (first declaration wins when two files declare the same name). */
export function kindByName(changed: readonly ChangedSymbol[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of changed) if (!out.has(c.name)) out.set(c.name, c.kind);
  return out;
}

/** `name()` for callable kinds, plain `name` otherwise. */
export function symbolLabel(name: string, kind: string | undefined): string {
  return kind && FUNCTION_KINDS.has(kind) ? `${name}()` : name;
}

/** `a/b/c.ts:3` → `["a/", "b/", "c.ts:3"]`, so a long path can wrap after a `/`. */
export function pathSegments(path: string): string[] {
  return path.split(/(?<=\/)/);
}

/** Caller line numbers are valid at the indexed commit; fall back to the PR head. */
export function linkSha(indexedSha: string | null, headSha: string): string {
  return indexedSha ?? headSha;
}

/** GitHub deep-link to `file:line`, or null when the repo's full name is unknown. */
export function callerHref(
  repoFullName: string | null,
  sha: string,
  file: string,
  line: number,
): string | null {
  return repoFullName ? githubBlobUrl(repoFullName, sha, file, line) : null;
}
