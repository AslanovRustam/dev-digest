export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/**
 * Line diff via longest common subsequence. `from` → `to`: lines only in
 * `from` are "del", lines only in `to` are "add". O(n·m) time and memory —
 * fine for skill bodies (≤ 50k chars).
 */
export function lineDiff(from: string, to: string): DiffLine[] {
  // An empty body has no lines (not one empty line), so v1 diffs as pure adds.
  const a = from === "" ? [] : from.split("\n");
  const b = to === "" ? [] : to.split("\n");
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  // lcs[i*w + j] = LCS length of a[i..] and b[j..]
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      out.push({ kind: "del", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** True when the diff has at least one added or removed line. */
export function hasChanges(diff: DiffLine[]): boolean {
  return diff.some((l) => l.kind !== "same");
}

/** A rendered diff row: a line, or a run of unchanged lines folded away. */
export type DiffRow = { kind: "line"; line: DiffLine } | { kind: "gap"; count: number };

/** Unchanged lines kept around each change. */
export const DIFF_CONTEXT = 3;

/**
 * Fold unchanged runs so the changes are visible without scrolling: keep
 * `context` same-lines on each side of every change and replace the rest of a
 * run with one gap row. A diff with no changes folds to nothing.
 */
export function foldUnchanged(diff: DiffLine[], context = DIFF_CONTEXT): DiffRow[] {
  const keep = diff.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++) {
      if (diff[k]!.kind !== "same") return true;
    }
    return false;
  });
  const rows: DiffRow[] = [];
  let gap = 0;
  diff.forEach((line, i) => {
    if (keep[i]) {
      if (gap > 0) rows.push({ kind: "gap", count: gap });
      gap = 0;
      rows.push({ kind: "line", line });
    } else {
      gap++;
    }
  });
  if (gap > 0 && rows.length > 0) rows.push({ kind: "gap", count: gap });
  return rows;
}
