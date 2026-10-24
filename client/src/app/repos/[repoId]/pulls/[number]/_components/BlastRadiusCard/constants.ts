export const BLAST_VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof BLAST_VIEWS)[number];

/** Symbol kinds rendered with a trailing `()` (callable declarations). */
export const FUNCTION_KINDS: ReadonlySet<string> = new Set(["function", "method"]);
