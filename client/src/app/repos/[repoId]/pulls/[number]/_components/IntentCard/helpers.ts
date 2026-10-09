import type { IntentConfidence, IntentRiskKind } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

export const shortSha = (sha: string): string => sha.slice(0, 7);

export type IntentErrorKey = "errors.unreachable" | "errors.config" | "errors.generic";

/** Message key for a failed derive: API down, no OpenRouter key, or anything else. */
export function intentErrorKey(err: Error): IntentErrorKey {
  if (err instanceof ApiError && err.status === 0) return "errors.unreachable";
  if (err instanceof ApiError && err.code === "config_error") return "errors.config";
  return "errors.generic";
}

/** Badge colours per confidence level. */
export function confidenceTone(c: IntentConfidence): { color: string; bg: string } {
  if (c === "high") return { color: "var(--ok)", bg: "var(--ok-bg)" };
  if (c === "medium") return { color: "var(--warn)", bg: "var(--warn-bg)" };
  return { color: "var(--danger)", bg: "var(--danger-bg)" };
}

/** Icon per risk kind: security/auth → shield, dependency → boxes, performance → zap, others → alert. */
export function riskIcon(kind: IntentRiskKind): "Shield" | "Boxes" | "Zap" | "AlertTriangle" {
  if (kind === "security" || kind === "auth") return "Shield";
  if (kind === "dependency") return "Boxes";
  if (kind === "performance") return "Zap";
  return "AlertTriangle";
}
