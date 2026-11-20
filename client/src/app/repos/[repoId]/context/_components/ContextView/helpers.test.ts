import { describe, it, expect } from "vitest";
import type { ContextDocSummary } from "@devdigest/shared";
import { buildTree, decodeUpload, defaultFolder, folderOf, joinPath, MAX_UPLOAD_BYTES, rootsLabel } from "./helpers";

const doc = (path: string): ContextDocSummary => ({
  path,
  type: "specs",
  tokens: 10,
  too_large: false,
  used_by_agents: 0,
});

describe("Project Context page helpers", () => {
  it("buildTree nests folders from `/` paths, folders before files, A→Z", () => {
    const tree = buildTree([doc("specs/z.md"), doc(".devdigest/specs/b.md"), doc("specs/sub/a.md"), doc("specs/a.md")]);
    const shape = (nodes: ReturnType<typeof buildTree>): unknown =>
      nodes.map((n) => (n.kind === "folder" ? { [n.name]: shape(n.children) } : n.name));
    expect(shape(tree)).toEqual([
      { ".devdigest": [{ specs: ["b.md"] }] },
      { specs: [{ sub: ["a.md"] }, "a.md", "z.md"] },
    ]);
  });

  it("derives folders, the default folder and the roots label", () => {
    expect(folderOf("specs/sub/a.md")).toBe("specs/sub");
    expect(folderOf("a.md")).toBe("");
    expect(defaultFolder([doc("docs/a.md")], ["specs"])).toBe("docs");
    expect(defaultFolder([], ["specs", "docs"])).toBe("specs");
    expect(rootsLabel(["specs", "docs"])).toBe("specs/, docs/");
    expect(joinPath("specs", "a.md")).toBe("specs/a.md");
    expect(joinPath("", "a.md")).toBe("a.md");
  });

  it("decodeUpload accepts UTF-8 up to 256 KB and rejects the rest with a reason", () => {
    const utf8 = new TextEncoder().encode("# Café ✓");
    expect(decodeUpload(utf8.buffer as ArrayBuffer)).toEqual({ ok: true, text: "# Café ✓" });
    expect(decodeUpload(new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer)).toEqual({ ok: false, reason: "not_utf8" });
    expect(decodeUpload(new Uint8Array(MAX_UPLOAD_BYTES + 1).buffer)).toEqual({ ok: false, reason: "too_large" });
  });
});
