import type { IntentConfidence, IntentRiskKind, IntentSourceStatus } from "@devdigest/shared";

export const shortSha = (sha: string): string => sha.slice(0, 7);

/** Badge colours per confidence level. */
export function confidenceTone(c: IntentConfidence): { color: string; bg: string } {
  if (c === "high") return { color: "var(--ok)", bg: "var(--ok-bg)" };
  if (c === "medium") return { color: "var(--warn)", bg: "var(--warn-bg)" };
  return { color: "var(--danger)", bg: "var(--danger-bg)" };
}

export function sourceStatusTone(s: IntentSourceStatus): string {
  if (s === "used") return "var(--ok)";
  if (s === "unreachable") return "var(--danger)";
  return "var(--warn)";
}

/** Icon per risk kind: security/auth → shield, dependency → boxes, performance → zap, others → alert. */
export function riskIcon(kind: IntentRiskKind): "Shield" | "Boxes" | "Zap" | "AlertTriangle" {
  if (kind === "security" || kind === "auth") return "Shield";
  if (kind === "dependency") return "Boxes";
  if (kind === "performance") return "Zap";
  return "AlertTriangle";
}
