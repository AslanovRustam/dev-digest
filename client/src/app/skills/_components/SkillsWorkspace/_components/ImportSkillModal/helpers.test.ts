import { describe, it, expect } from "vitest";
import { bytesToBase64, checkImportFile, importNote } from "./helpers";

describe("checkImportFile", () => {
  it("accepts .md/.zip up to 512 KB", () => {
    expect(checkImportFile({ name: "SKILL.md", size: 10 })).toBeNull();
    expect(checkImportFile({ name: "flaky-tests.ZIP", size: 512 * 1024 })).toBeNull();
    expect(checkImportFile({ name: "run.sh", size: 10 })).toBe("bad_extension");
    expect(checkImportFile({ name: "big.zip", size: 512 * 1024 + 1 })).toBe("too_large");
  });
});

describe("bytesToBase64", () => {
  it("matches Buffer's encoding, including inputs larger than one chunk", () => {
    const small = new TextEncoder().encode("# Skill\nhéllo");
    expect(bytesToBase64(small)).toBe(Buffer.from(small).toString("base64"));

    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString("base64"));
  });
});

describe("importNote", () => {
  it("caps the note at 200 chars", () => {
    expect(importNote("Imported from a.md")).toBe("Imported from a.md");
    expect(importNote("x".repeat(300))).toHaveLength(200);
  });
});
