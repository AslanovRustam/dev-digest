import { describe, it, expect } from "vitest";
import { annotationKey, partitionAnnotations, type DiffAnnotation } from "./annotations";

const ann = (id: string, line: number): DiffAnnotation => ({
  id,
  path: "a.ts",
  line,
  color: "red",
  label: "blocker",
  content: null,
});

describe("partitionAnnotations", () => {
  it("keys annotations on the RIGHT side", () => {
    expect(annotationKey(ann("x", 7))).toBe("RIGHT:7");
  });

  it("matches rendered lines, keeps order, and surfaces the rest as unmatched", () => {
    const items = [ann("a", 3), ann("b", 3), ann("c", 99)];
    const { matched, unmatched } = partitionAnnotations(items, new Set(["RIGHT:3", "RIGHT:4"]));
    expect(matched.get("RIGHT:3")?.map((a) => a.id)).toEqual(["a", "b"]);
    expect(unmatched.map((a) => a.id)).toEqual(["c"]);
  });
});
