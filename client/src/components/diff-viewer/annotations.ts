/* Generic line annotations for the DiffViewer: a coloured bar + label on a line,
   a marker on the file header and rich content under the line. The viewer knows
   nothing about what an annotation is (findings, lint hits, ...) — the caller
   builds `content` as a ReactNode. Pure helpers only; React bits live in FileCard. */
import type { ReactNode } from "react";
import { lineKey } from "./comments";

/** One annotation anchored to a new-side (RIGHT) line of a file. */
export interface DiffAnnotation {
  id: string;
  path: string;
  line: number;
  /** CSS colour of the line bar, the right-hand label and the file marker. */
  color: string;
  /** Short text shown at the right edge of the annotated line. */
  label: string;
  /** Resolved annotation: still renders `content`, but draws no bar, label or file marker. */
  resolved?: boolean;
  /** Rich body rendered under the line (or in the "not on a changed line" block). */
  content: ReactNode;
}

/** What the viewer needs to render annotations. */
export interface DiffAnnotationApi {
  /** Pre-sorted, most important first. */
  items: DiffAnnotation[];
  /** When false only `content` is hidden; the bar, label and marker stay. */
  show: boolean;
  /** Accessible name of the file-header marker. */
  markerLabel: string;
}

/** `RIGHT:<line>` — the key an annotation is matched on. */
export function annotationKey(a: Pick<DiffAnnotation, "line">): string {
  return lineKey("RIGHT", a.line) as string;
}

/**
 * Split annotations into those that match a rendered line (keyed) and ones whose
 * line is not part of this patch. The unmatched bucket is surfaced separately so
 * nothing is silently dropped.
 */
export function partitionAnnotations(
  items: DiffAnnotation[],
  renderedKeys: Set<string>,
): { matched: Map<string, DiffAnnotation[]>; unmatched: DiffAnnotation[] } {
  const matched = new Map<string, DiffAnnotation[]>();
  const unmatched: DiffAnnotation[] = [];
  for (const a of items) {
    const key = annotationKey(a);
    if (renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(a);
      matched.set(key, list);
    } else {
      unmatched.push(a);
    }
  }
  return { matched, unmatched };
}
