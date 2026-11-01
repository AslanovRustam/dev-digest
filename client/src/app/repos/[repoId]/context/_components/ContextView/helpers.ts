import type { ContextDocSummary } from "@devdigest/shared";

/** A folder or a document in the Project Context tree. */
export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; doc: ContextDocSummary };

/** Nested folders from `/` paths: folders first, then files, each A→Z. */
export function buildTree(docs: readonly ContextDocSummary[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const doc of docs) {
    const parts = doc.path.split("/");
    let level = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let folder = level.find((n): n is Extract<TreeNode, { kind: "folder" }> => n.kind === "folder" && n.path === path);
      if (!folder) {
        folder = { kind: "folder", name: parts[i]!, path, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ kind: "file", name: parts[parts.length - 1]!, path: doc.path, doc });
  }
  return sortTree(root);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((n) => (n.kind === "folder" ? { ...n, children: sortTree(n.children) } : n))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : a.name.localeCompare(b.name)));
}

/** Folder of a `/` path ("" for a top-level file). */
export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Where New file / Upload put a document when no folder is selected: the
 * folder of the first listed document, else the first search root.
 */
export function defaultFolder(docs: readonly ContextDocSummary[], roots: readonly string[]): string {
  const first = docs[0];
  if (first) return folderOf(first.path);
  return roots[0] ?? "docs";
}

/** `specs/, docs/, insights/` — the roots as the user sees folders. */
export function rootsLabel(roots: readonly string[]): string {
  return roots.map((r) => `${r}/`).join(", ");
}

/** Local clock time of a scan (`14:05`). */
export function scannedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** The upload size cap — same as the API's (256 KB of UTF-8). */
export const MAX_UPLOAD_BYTES = 256 * 1024;

/** An uploaded file's text, or why it can't be one: over the cap or not UTF-8. */
export function decodeUpload(
  bytes: ArrayBuffer,
): { ok: true; text: string } | { ok: false; reason: "too_large" | "not_utf8" } {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "not_utf8" };
  }
}

/** A path inside `folder` (top level when empty). */
export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}
