import { describe, it, expect } from "vitest";
import { foldUnchanged, hasChanges, lineDiff, type DiffRow } from "./helpers";

describe("lineDiff", () => {
  it("marks removed and added lines around the common subsequence", () => {
    expect(lineDiff("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });

  it("handles identical, emptied and filled bodies", () => {
    expect(hasChanges(lineDiff("a\nb", "a\nb"))).toBe(false);
    expect(lineDiff("a", "")).toEqual([{ kind: "del", text: "a" }]);
    expect(lineDiff("", "a\nb").map((l) => l.kind)).toEqual(["add", "add"]);
    expect(lineDiff("x\ny", "y").map((l) => l.kind)).toEqual(["del", "same"]);
  });

  it("reports a trailing newline as one added empty line", () => {
    expect(lineDiff("a\nb", "a\nb\n")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "add", text: "" },
    ]);
  });
});

const label = (r: DiffRow) => (r.kind === "gap" ? `gap:${r.count}` : `${r.line.kind}:${r.line.text}`);

describe("foldUnchanged", () => {
  const body = Array.from({ length: 20 }, (_, i) => `l${i}`);

  it("keeps context around a change and folds the rest into gaps", () => {
    const to = [...body];
    to[10] = "changed";
    const rows = foldUnchanged(lineDiff(body.join("\n"), to.join("\n")), 2);
    expect(rows.map(label)).toEqual([
      "gap:8",
      "same:l8",
      "same:l9",
      "del:l10",
      "add:changed",
      "same:l11",
      "same:l12",
      "gap:7",
    ]);
  });

  it("puts a change on the last line right after one leading gap", () => {
    const rows = foldUnchanged(lineDiff(body.join("\n"), `${body.join("\n")}\n`), 3);
    expect(rows[0]).toEqual({ kind: "gap", count: 17 });
    expect(rows.at(-1)).toEqual({ kind: "line", line: { kind: "add", text: "" } });
  });

  it("folds an unchanged diff to nothing", () => {
    expect(foldUnchanged(lineDiff("a\nb", "a\nb"))).toEqual([]);
  });
});
