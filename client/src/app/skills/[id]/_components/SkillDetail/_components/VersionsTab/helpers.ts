import type { SkillVersion } from "@devdigest/shared";

/** ISO timestamp → "YYYY-MM-DD" (UTC); unparseable input is shown as-is. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/**
 * The version a given one was edited from — the highest version number below
 * it (versions are not guaranteed to be contiguous). Undefined for the first.
 */
export function previousVersion(versions: SkillVersion[], version: number): SkillVersion | undefined {
  return versions
    .filter((v) => v.version < version)
    .reduce<SkillVersion | undefined>((best, v) => (!best || v.version > best.version ? v : best), undefined);
}

/** Newest first, whatever order the API returned. */
export function newestFirst(versions: SkillVersion[]): SkillVersion[] {
  return [...versions].sort((a, b) => b.version - a.version);
}
