import type { FindingRecord, PrFile, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { SEVERITY_ORDER, liveFindings, sortForPreview } from "@/lib/findings";

export interface RoleFiles {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Group `files` by the server's smart-diff classification. Group order comes from
 * the route; inside a group files keep their order in `files` (GitHub order).
 * A path the route did not classify falls into `core`. Empty groups are dropped.
 */
export function orderFilesByRole(files: PrFile[], smartDiff: SmartDiff): RoleFiles[] {
  const roleOf = new Map<string, SmartDiffRole>();
  const order: SmartDiffRole[] = [];
  for (const g of smartDiff.groups) {
    order.push(g.role);
    for (const f of g.files) roleOf.set(f.path, g.role);
  }
  if (!order.includes("core")) order.unshift("core");

  const byRole = new Map<SmartDiffRole, PrFile[]>(order.map((r) => [r, []]));
  for (const f of files) {
    byRole.get(roleOf.get(f.path) ?? "core")?.push(f);
  }
  return order.map((role) => ({ role, files: byRole.get(role) ?? [] })).filter((g) => g.files.length > 0);
}

/** The newest review (the API returns reviews newest-first), or null before any run. */
export function latestReview<T>(reviews: T[] | undefined): T | null {
  return reviews?.[0] ?? null;
}

/** Open (not dismissed) findings grouped by file path. */
export function openFindingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const byPath = new Map<string, FindingRecord[]>();
  for (const f of liveFindings(findings)) {
    const list = byPath.get(f.file) ?? [];
    list.push(f);
    byPath.set(f.file, list);
  }
  return byPath;
}

/** How many of `files` have at least one open finding. */
export function countFilesWithFindings(files: Pick<PrFile, "path">[], byPath: Map<string, FindingRecord[]>): number {
  return files.filter((f) => byPath.has(f.path)).length;
}

/** The most severe severity among `findings`, or null when there are none. */
export function topSeverity(findings: Pick<FindingRecord, "severity">[]): string | null {
  let best: string | null = null;
  for (const f of findings) {
    if (best === null || (SEVERITY_ORDER[f.severity] ?? 9) < (SEVERITY_ORDER[best] ?? 9)) best = f.severity;
  }
  return best;
}

/** Findings to draw in the diff: severity order, open ones before dismissed ones. */
export function sortForDiff(findings: FindingRecord[]): FindingRecord[] {
  const sorted = sortForPreview(findings);
  return [...sorted.filter((f) => !f.dismissed_at), ...sorted.filter((f) => f.dismissed_at)];
}
