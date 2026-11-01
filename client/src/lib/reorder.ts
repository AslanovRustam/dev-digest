/* reorder.ts — moving items within an ordered list (drag-and-drop and
   Alt+Arrow keyboard moves in the agent Skills tab and the Context tabs). */

/** Move one element of a list to another index (returns a new list). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
