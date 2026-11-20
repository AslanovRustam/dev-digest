import type { ContextAttachmentItem, ContextDocSummary, ContextDocType } from "@devdigest/shared";

/** One row of a Context tab: a repo document or an attached path, with its attachment state. */
export interface AttachmentRowModel {
  path: string;
  /** File name (last segment). */
  name: string;
  /** Folder (`specs/`, `.devdigest/specs/`); empty at the repo root. */
  folder: string;
  /** From the repo list; null for a path this repo lacks. */
  type: ContextDocType | null;
  /** Checked: an own attachment (`via` null) or an inherited one (`via` set). */
  attached: boolean;
  /** Name of the skill an inherited row comes from — read-only. */
  via: string | null;
  /** The server's view of an attached path (status, tokens); null for unattached rows. */
  item: ContextAttachmentItem | null;
}

function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i === -1 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i + 1) };
}

/**
 * Rows in display order (AC-9, AC-12): own attachments in their order, then
 * inherited ones, then every other repo document A→Z.
 */
export function buildRows(
  items: readonly ContextAttachmentItem[],
  documents: readonly ContextDocSummary[],
): AttachmentRowModel[] {
  const typeOf = new Map(documents.map((d) => [d.path, d.type]));
  const toRow = (item: ContextAttachmentItem): AttachmentRowModel => ({
    path: item.path,
    ...splitPath(item.path),
    type: typeOf.get(item.path) ?? null,
    attached: true,
    via: item.via_skill,
    item,
  });
  const attachedPaths = new Set(items.map((i) => i.path));
  const rest = documents
    .filter((d) => !attachedPaths.has(d.path))
    .map((d) => d.path)
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({ path, ...splitPath(path), type: typeOf.get(path) ?? null, attached: false, via: null, item: null }));
  return [
    ...items.filter((i) => !i.via_skill).map(toRow),
    ...items.filter((i) => i.via_skill).map(toRow),
    ...rest,
  ];
}

/** The own attachment list, in order — the PUT body. */
export function ownPaths(rows: readonly AttachmentRowModel[]): string[] {
  return rows.filter((r) => r.attached && !r.via).map((r) => r.path);
}

/** Check a row (append to the own list) or uncheck an own one (remove it). Inherited rows don't change. */
export function togglePath(rows: readonly AttachmentRowModel[], path: string): string[] {
  const own = ownPaths(rows);
  const row = rows.find((r) => r.path === path);
  if (!row || row.via) return own;
  return own.includes(path) ? own.filter((p) => p !== path) : [...own, path];
}

/** Case-insensitive match on the path (AC-11); empty query keeps every row. */
export function filterRows(rows: readonly AttachmentRowModel[], query: string): AttachmentRowModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

/** Text labels of an attached row (AC-12), as message keys under `context.attachments`. */
export function rowLabelKeys(item: ContextAttachmentItem | null): string[] {
  if (!item) return [];
  const keys: string[] = [];
  if (item.status === "not_in_repo") keys.push("notInRepo");
  if (item.status === "too_large") keys.push("tooLarge");
  if (item.truncated) keys.push("truncated");
  if (item.dropped) keys.push("dropped");
  return keys;
}

/** What a skill contributes to the prompt, as the "Serializes as" box shows it (AC-17). */
export function serializeAs(paths: readonly string[]): string {
  return ["## Project context", ...paths.map((p) => `- ${p}`)].join("\n");
}
