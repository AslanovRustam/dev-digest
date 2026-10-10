import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import {
  countFilesWithFindings,
  latestReview,
  openFindingsByPath,
  orderFilesByRole,
  sortForDiff,
  topSeverity,
} from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });

function smartDiff(groups: { role: SmartDiffRole; paths: string[] }[]): SmartDiff {
  return {
    groups: groups.map((g) => ({
      role: g.role,
      files: g.paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
    })),
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
  } as SmartDiff;
}

describe("orderFilesByRole", () => {
  it("follows the route's group order and keeps input order inside a group", () => {
    const files = [file("a.test.ts"), file("src/b.ts"), file("pnpm-lock.yaml"), file("src/a.ts")];
    const sd = smartDiff([
      { role: "core", paths: ["src/a.ts", "src/b.ts"] },
      { role: "tests", paths: ["a.test.ts"] },
      { role: "boilerplate", paths: ["pnpm-lock.yaml"] },
    ]);
    const out = orderFilesByRole(files, sd);
    expect(out.map((g) => g.role)).toEqual(["core", "tests", "boilerplate"]);
    expect(out[0]?.files.map((f) => f.path)).toEqual(["src/b.ts", "src/a.ts"]);
  });

  it("puts a path unknown to the route into core, creating the group first", () => {
    const out = orderFilesByRole(
      [file("README.md"), file("new.ts")],
      smartDiff([{ role: "docs", paths: ["README.md"] }]),
    );
    expect(out.map((g) => g.role)).toEqual(["core", "docs"]);
    expect(out[0]?.files.map((f) => f.path)).toEqual(["new.ts"]);
  });

  it("drops groups that end up with no files", () => {
    const out = orderFilesByRole([file("a.ts")], smartDiff([{ role: "core", paths: ["a.ts"] }, { role: "docs", paths: ["gone.md"] }]));
    expect(out.map((g) => g.role)).toEqual(["core"]);
  });
});

const finding = (id: string, file: string, severity: string, dismissed = false): FindingRecord =>
  ({
    id,
    file,
    severity,
    confidence: 0.5,
    start_line: 1,
    end_line: 1,
    dismissed_at: dismissed ? "2026-01-01T00:00:00Z" : null,
  }) as unknown as FindingRecord;

describe("findings helpers", () => {
  it("counts files, not findings, and ignores dismissed ones", () => {
    const byPath = openFindingsByPath([
      finding("1", "a.ts", "WARNING"),
      finding("2", "a.ts", "CRITICAL"),
      finding("3", "a.ts", "SUGGESTION"),
      finding("4", "b.ts", "WARNING"),
      finding("5", "b.ts", "WARNING"),
      finding("6", "c.ts", "WARNING", true),
    ]);
    expect(countFilesWithFindings([file("a.ts"), file("b.ts"), file("c.ts"), file("d.ts")], byPath)).toBe(2);
  });

  it("picks the top severity and the newest review", () => {
    expect(topSeverity([finding("1", "a", "SUGGESTION"), finding("2", "a", "CRITICAL")])).toBe("CRITICAL");
    expect(topSeverity([])).toBeNull();
    expect(latestReview(["new", "old"])).toBe("new");
    expect(latestReview([])).toBeNull();
    expect(latestReview(undefined)).toBeNull();
  });

  it("sorts open findings by severity, dismissed ones last", () => {
    const out = sortForDiff([
      finding("d", "a", "CRITICAL", true),
      finding("s", "a", "SUGGESTION"),
      finding("c", "a", "CRITICAL"),
    ]);
    expect(out.map((f) => f.id)).toEqual(["c", "s", "d"]);
  });
});
