import { describe, it, expect } from "vitest";
import { callerHref, kindByName, linkSha, pathSegments, symbolLabel } from "./helpers";

describe("blast helpers", () => {
  it("symbolLabel appends () for callables only", () => {
    expect(symbolLabel("run", "function")).toBe("run()");
    expect(symbolLabel("run", "method")).toBe("run()");
    expect(symbolLabel("Svc", "class")).toBe("Svc");
    expect(symbolLabel("x", undefined)).toBe("x");
  });

  it("kindByName keeps the first kind per name", () => {
    const m = kindByName([
      { name: "a", file: "a.ts", kind: "function" },
      { name: "a", file: "b.ts", kind: "class" },
    ]);
    expect(m.get("a")).toBe("function");
  });

  it("linkSha prefers the indexed sha", () => {
    expect(linkSha("idx", "head")).toBe("idx");
    expect(linkSha(null, "head")).toBe("head");
  });

  it("pathSegments splits after each slash and keeps the text intact", () => {
    expect(pathSegments("src/lib/a.ts:12")).toEqual(["src/", "lib/", "a.ts:12"]);
    expect(pathSegments("a.ts:1")).toEqual(["a.ts:1"]);
    expect(pathSegments("client/src/[repoId]/x.tsx:9").join("")).toBe("client/src/[repoId]/x.tsx:9");
  });

  it("callerHref builds a blob link or null", () => {
    expect(callerHref("acme/api", "abc", "src/a.ts", 23)).toBe("https://github.com/acme/api/blob/abc/src/a.ts#L23");
    expect(callerHref(null, "abc", "src/a.ts", 23)).toBeNull();
  });
});
