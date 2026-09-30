import type { SkillVersion } from "@devdigest/shared";

/** ISO timestamp → "YYYY-MM-DD" (UTC); unparseable input is shown as-is. */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/** Newest first, whatever order the API returned. */
export function newestFirst(versions: SkillVersion[]): SkillVersion[] {
  return [...versions].sort((a, b) => b.version - a.version);
}
