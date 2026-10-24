import type { SmartDiffRole } from "@devdigest/shared";

/**
 * Group header of each role: `prReview.smartDiff.*` keys for the label and the
 * one-line hint, plus the colour of the role square (theme tokens; docs has no
 * token of its own, so it takes a fixed violet that reads in both themes).
 */
export const ROLE_META = {
  core: { labelKey: "coreLabel", hintKey: "coreHint", color: "var(--accent)" },
  tests: { labelKey: "testsLabel", hintKey: "testsHint", color: "var(--ok)" },
  wiring: { labelKey: "wiringLabel", hintKey: "wiringHint", color: "var(--warn)" },
  docs: { labelKey: "docsLabel", hintKey: "docsHint", color: "#8b5cf6" },
  boilerplate: { labelKey: "boilerplateLabel", hintKey: "boilerplateHint", color: "var(--info)" },
} as const satisfies Record<SmartDiffRole, { labelKey: string; hintKey: string; color: string }>;

/** Low-signal groups start collapsed so the review begins at the core change. */
export const COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);

export type FileOrder = "smart" | "original";
