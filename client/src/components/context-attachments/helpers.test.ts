import { describe, it, expect } from "vitest";
import type { ContextAttachmentItem, ContextDocSummary } from "@devdigest/shared";
import { buildRows, filterRows, ownPaths, rowLabelKeys, serializeAs, togglePath } from "./helpers";

const doc = (path: string, type: ContextDocSummary["type"] = "specs"): ContextDocSummary => ({
  path,
  type,
  tokens: 10,
  too_large: false,
  used_by_agents: 0,
});
const item = (path: string, extra: Partial<ContextAttachmentItem> = {}): ContextAttachmentItem => ({
  path,
  via_skill: null,
  status: "present",
  tokens: 10,
  truncated: false,
  dropped: false,
  ...extra,
});

describe("Context tab rows", () => {
  const items = [
    item("specs/public-api.md"),
    item("insights/perf.md", { via_skill: "rubric" }),
    item("specs/gone.md", { status: "not_in_repo", tokens: null }),
  ];
  const docs = [doc("specs/public-api.md"), doc("docs/z.md", "docs"), doc("docs/a.md", "docs"), doc("insights/perf.md", "insights")];

  it("orders own rows, then inherited, then the other documents A→Z", () => {
    const rows = buildRows(items, docs);
    expect(rows.map((r) => [r.path, r.attached, r.via])).toEqual([
      ["specs/public-api.md", true, null],
      ["specs/gone.md", true, null],
      ["insights/perf.md", true, "rubric"],
      ["docs/a.md", false, null],
      ["docs/z.md", false, null],
    ]);
    expect(rows[0]).toMatchObject({ name: "public-api.md", folder: "specs/", type: "specs" });
    expect(rows[1]!.type).toBeNull();
  });

  it("toggles own rows and appends new ones; inherited rows are read-only", () => {
    const rows = buildRows(items, docs);
    expect(ownPaths(rows)).toEqual(["specs/public-api.md", "specs/gone.md"]);
    expect(togglePath(rows, "docs/a.md")).toEqual(["specs/public-api.md", "specs/gone.md", "docs/a.md"]);
    expect(togglePath(rows, "specs/public-api.md")).toEqual(["specs/gone.md"]);
    expect(togglePath(rows, "insights/perf.md")).toEqual(["specs/public-api.md", "specs/gone.md"]);
  });

  it("filters on the path, labels row states and serializes a skill's list", () => {
    expect(filterRows(buildRows(items, docs), "DOCS/").map((r) => r.path)).toEqual(["docs/a.md", "docs/z.md"]);
    expect(rowLabelKeys(item("a.md", { status: "not_in_repo" }))).toEqual(["notInRepo"]);
    expect(rowLabelKeys(item("a.md", { truncated: true, dropped: true }))).toEqual(["truncated", "dropped"]);
    expect(rowLabelKeys(item("a.md", { status: "too_large" }))).toEqual(["tooLarge"]);
    expect(serializeAs(["specs/a.md", "docs/b.md"])).toBe("## Project context\n- specs/a.md\n- docs/b.md");
  });
});
