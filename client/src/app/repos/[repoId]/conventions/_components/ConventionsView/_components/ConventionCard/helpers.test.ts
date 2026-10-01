import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, evidenceRef } from "./helpers";

const cand = (over: Partial<ConventionCandidate>): ConventionCandidate => ({
  id: "c1",
  repo_id: "r1",
  scan_id: "s1",
  source_sha: "abc123",
  category: "async",
  rule: "Use async/await",
  evidence_path: "src/a.ts",
  evidence_start_line: 3,
  evidence_end_line: 5,
  evidence_snippet: "await x();",
  confidence: 0.9,
  status: "pending",
  skill_id: null,
  skill_name: null,
  created_at: "2026-10-01T10:00:00.000Z",
  ...over,
});

describe("display helpers", () => {
  it("colours confidence like ConfidenceNum", () => {
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.78)).toBe("var(--warn)");
    expect(confidenceColor(0.4)).toBe("var(--text-muted)");
  });

  it("formats the evidence reference", () => {
    expect(evidenceRef(cand({}))).toBe("src/a.ts:3-5");
    expect(evidenceRef(cand({ evidence_end_line: 3 }))).toBe("src/a.ts:3");
  });
});
