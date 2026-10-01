import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { compactAge, countBy, filterCandidates, parseCategory, parseStatus, skillCandidates } from "./helpers";

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

const LIST = [
  cand({ id: "a", status: "accepted", category: "async" }),
  cand({ id: "b", status: "accepted", category: "api" }),
  cand({ id: "c", status: "rejected", category: "async" }),
  cand({ id: "d", status: "pending", category: "naming" }),
  cand({ id: "e", status: "accepted", category: "async", skill_id: "sk", skill_name: "x" }),
];

describe("skillCandidates", () => {
  it("takes only accepted candidates not yet in a skill — never rejected or pending", () => {
    expect(skillCandidates(LIST, "all").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("narrows to the category filter, so each area can become its own skill", () => {
    expect(skillCandidates(LIST, "api").map((c) => c.id)).toEqual(["b"]);
    expect(skillCandidates(LIST, "naming")).toEqual([]);
  });
});

describe("filterCandidates / countBy", () => {
  it("filters by status and category together", () => {
    expect(filterCandidates(LIST, "accepted", "async").map((c) => c.id)).toEqual(["a", "e"]);
    expect(filterCandidates(LIST, "all", "all")).toHaveLength(5);
  });

  it("counts per status and per category", () => {
    const c = countBy(LIST);
    expect(c.status).toEqual({ pending: 1, accepted: 3, rejected: 1, all: 5 });
    expect(c.category.get("async")).toBe(3);
    expect(c.category.has("typing")).toBe(false);
  });
});

describe("compactAge", () => {
  it("formats a compact age", () => {
    const now = Date.parse("2026-10-01T12:00:00.000Z");
    expect(compactAge("2026-10-01T11:59:40.000Z", now)).toBeNull();
    expect(compactAge("2026-10-01T11:55:00.000Z", now)).toBe("5m");
    expect(compactAge("2026-10-01T09:00:00.000Z", now)).toBe("3h");
    expect(compactAge("2026-09-29T12:00:00.000Z", now)).toBe("2d");
    expect(compactAge("nope", now)).toBeNull();
  });
});

describe("URL filter parsing", () => {
  it("accepts known values and falls back to all", () => {
    expect(parseStatus("accepted")).toBe("accepted");
    expect(parseStatus("bogus")).toBe("all");
    expect(parseStatus(null)).toBe("all");
    expect(parseCategory("error-handling")).toBe("error-handling");
    expect(parseCategory("nope")).toBe("all");
  });
});
