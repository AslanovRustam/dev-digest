import { describe, it, expect } from "vitest";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { briefErrorKey, missingInputs, parseFileRef, reviewCounts, staleMessages } from "./helpers";

const brief = {
  summary: "s",
  risks: [],
  review_focus: [],
  history: [],
  head_sha: "abcdef1234",
  generated_at: "2026-01-01T00:00:00.000Z",
  provider: "openrouter",
  model: "m",
  tokens_in: 1,
  tokens_out: 1,
  attempts: 1,
  inputs: [
    { source: "diff", status: "used", tokens: 10 },
    { source: "intent", status: "missing", tokens: 0, reason: "not_derived" },
    { source: "findings", status: "missing", tokens: 0 },
  ],
} satisfies PrBrief;

describe("parseFileRef", () => {
  it("splits path, line and range", () => {
    expect(parseFileRef("a/b.ts")).toEqual({ path: "a/b.ts", start: null, end: null });
    expect(parseFileRef("a/b.ts:12")).toEqual({ path: "a/b.ts", start: 12, end: null });
    expect(parseFileRef("a/b.ts:12-18")).toEqual({ path: "a/b.ts", start: 12, end: 18 });
    expect(parseFileRef("a:b/c.ts")).toEqual({ path: "a:b/c.ts", start: null, end: null });
  });
});

describe("staleMessages", () => {
  const res = (over: Partial<PrBriefResponse>): PrBriefResponse => ({
    brief,
    pr_head_sha: "9999999zzz",
    stale: true,
    stale_reasons: ["new_commit", "new_review"],
    ...over,
  });
  it("maps each reason to a message with short shas", () => {
    expect(staleMessages(res({}))).toEqual([
      { key: "staleCommit", values: { generated: "abcdef1", current: "9999999" } },
      { key: "staleReview", values: { generated: "abcdef1", current: "9999999" } },
    ]);
  });
  it("is empty when fresh or without a brief", () => {
    expect(staleMessages(res({ stale: false, stale_reasons: [] }))).toEqual([]);
    expect(staleMessages(res({ brief: null }))).toEqual([]);
  });
});

describe("missingInputs", () => {
  it("lists only missing inputs, defaulting the reason", () => {
    expect(missingInputs(brief)).toEqual([
      { source: "intent", ref: null, reason: "not_derived" },
      { source: "findings", ref: null, reason: "missing" },
    ]);
  });
});

describe("briefErrorKey", () => {
  it("maps API errors to message keys", () => {
    expect(briefErrorKey(new ApiError("x", 0)).key).toBe("errors.unreachable");
    expect(briefErrorKey(new ApiError("x", 409, "brief_in_progress")).key).toBe("errors.inProgress");
    expect(briefErrorKey(new ApiError("x", 404, "not_found")).key).toBe("errors.notFound");
    expect(briefErrorKey(new ApiError("x", 500, "config_error", { provider: "openrouter" }))).toEqual({
      key: "errors.config",
      provider: "openrouter",
    });
    expect(briefErrorKey(new ApiError("x", 502, "brief_generation_failed")).key).toBe("errors.generic");
    expect(briefErrorKey(new Error("boom")).key).toBe("errors.generic");
  });
});

describe("reviewCounts", () => {
  it("counts blockers as CRITICAL and not dismissed", () => {
    const findings = [
      { severity: "CRITICAL", dismissed_at: null },
      { severity: "CRITICAL", dismissed_at: "2026-01-01" },
      { severity: "WARNING", dismissed_at: null },
    ] as unknown as Parameters<typeof reviewCounts>[0]["findings"];
    expect(reviewCounts({ findings })).toEqual({ findings: 3, blockers: 1 });
  });
});
