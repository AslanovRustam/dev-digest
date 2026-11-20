import type { PrBrief, PrBriefResponse, ReviewRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { shortSha } from "../IntentCard/helpers";

export interface FileRef {
  path: string;
  start: number | null;
  end: number | null;
}

/** Split `path`, `path:12` or `path:12-18` into its parts; anything else stays a bare path. */
export function parseFileRef(ref: string): FileRef {
  const m = /^(.*):(\d+)(?:-(\d+))?$/.exec(ref);
  if (!m) return { path: ref, start: null, end: null };
  const start = Number(m[2]);
  const end = m[3] ? Number(m[3]) : null;
  return { path: m[1] ?? ref, start, end };
}

export interface StaleMessage {
  key: "staleCommit" | "staleReview";
  values: { generated: string; current: string };
}

/** One message per stale reason, in the API's order. */
export function staleMessages(res: PrBriefResponse): StaleMessage[] {
  if (!res.brief || !res.stale) return [];
  const values = { generated: shortSha(res.brief.head_sha), current: shortSha(res.pr_head_sha) };
  return res.stale_reasons.map((r) => ({
    key: r === "new_commit" ? ("staleCommit" as const) : ("staleReview" as const),
    values,
  }));
}

export interface MissingInput {
  source: string;
  ref: string | null;
  reason: string;
}

/** Inputs the brief did not see; `reason` falls back to `missing` when the server gave none. */
export function missingInputs(brief: PrBrief): MissingInput[] {
  return brief.inputs
    .filter((i) => i.status === "missing")
    .map((i) => ({ source: i.source, ref: i.ref ?? null, reason: i.reason ?? "missing" }));
}

export type BriefErrorKey =
  | "errors.load"
  | "errors.unreachable"
  | "errors.config"
  | "errors.inProgress"
  | "errors.notFound"
  | "errors.generic";

/** Message key (+ provider for `config_error`) for a failed load or generate. */
export function briefErrorKey(err: Error): { key: BriefErrorKey; provider?: string } {
  if (err instanceof ApiError) {
    if (err.status === 0) return { key: "errors.unreachable" };
    if (err.status === 409) return { key: "errors.inProgress" };
    if (err.status === 404) return { key: "errors.notFound" };
    if (err.code === "config_error") {
      const d = err.details;
      const provider =
        d && typeof d === "object" && "provider" in d && typeof d.provider === "string" ? d.provider : undefined;
      return { key: "errors.config", provider };
    }
  }
  return { key: "errors.generic" };
}

/** Message key for a failed load of the stored brief: unreachable / not found keep their text, the rest is "could not load". */
export function briefLoadErrorKey(err: Error): { key: BriefErrorKey } {
  if (err instanceof ApiError) {
    if (err.status === 0) return { key: "errors.unreachable" };
    if (err.status === 404) return { key: "errors.notFound" };
  }
  return { key: "errors.load" };
}

/** The newest review that carries a verdict (reviews come newest-first), or null. */
export function newestVerdictReview(reviews: ReviewRecord[] | undefined): ReviewRecord | null {
  return reviews?.find((r) => r.verdict != null) ?? null;
}

/** Findings and blockers (CRITICAL, not dismissed) of a review — as ReviewRunAccordion counts them. */
export function reviewCounts(review: Pick<ReviewRecord, "findings">): { findings: number; blockers: number } {
  const findings = review.findings;
  return {
    findings: findings.length,
    blockers: findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}
