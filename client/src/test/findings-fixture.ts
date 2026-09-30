/** FindingRecord factory for component tests (defaults: an open CRITICAL finding). */
import type { FindingRecord } from "@devdigest/shared";

let seq = 0;

export function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  seq += 1;
  return {
    id: `f${seq}`,
    severity: "CRITICAL",
    category: "security",
    title: `Finding ${seq}`,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}
