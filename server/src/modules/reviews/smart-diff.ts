import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import type { FindingRow, PrFileRow } from '../../db/rows.js';
import {
  SMART_DIFF_DEFAULT_ROLE,
  SMART_DIFF_ROLE_ORDER,
  SMART_DIFF_RULES,
} from './constants.js';

/**
 * Smart Diff (pure, ring 0): classify a changed path by role and group the PR's
 * files for review. No I/O and no LLM — the route feeds it rows it already loaded.
 */

/** Role of one path: first matching rule wins, otherwise `core`. */
export function classifyFile(path: string): SmartDiffRole {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const rule of SMART_DIFF_RULES) {
    if (rule.patterns.some((p) => p.re.test(normalised))) return rule.role;
  }
  return SMART_DIFF_DEFAULT_ROLE;
}

/**
 * Group files by role (fixed role order, empty groups omitted, input order kept
 * inside a group). `finding_lines` are the unique ascending start lines of the
 * OPEN (not dismissed) findings for that path.
 */
export function buildSmartDiff(
  files: Pick<PrFileRow, 'path' | 'additions' | 'deletions'>[],
  findings: Pick<FindingRow, 'file' | 'startLine' | 'dismissedAt'>[],
): SmartDiff {
  const linesByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    if (f.dismissedAt) continue;
    const set = linesByPath.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    linesByPath.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;
  for (const file of files) {
    const role = classifyFile(file.path);
    const entry: SmartDiffFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByPath.get(file.path) ?? [])].sort((a, b) => a - b),
    };
    const bucket = byRole.get(role);
    if (bucket) bucket.push(entry);
    else byRole.set(role, [entry]);
    totalLines += file.additions + file.deletions;
  }

  return {
    groups: SMART_DIFF_ROLE_ORDER.flatMap((role) => {
      const groupFiles = byRole.get(role);
      return groupFiles ? [{ role, files: groupFiles }] : [];
    }),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
