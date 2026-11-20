import type { RiskSeverity } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Severity as icon colour; the text label comes from `severity.*` in `brief.json`. */
export const SEVERITY_META: Record<RiskSeverity, { color: string; icon: IconName }> = {
  high: { color: "var(--crit)", icon: "AlertTriangle" },
  medium: { color: "var(--warn)", icon: "AlertTriangle" },
  low: { color: "var(--info)", icon: "Info" },
};
