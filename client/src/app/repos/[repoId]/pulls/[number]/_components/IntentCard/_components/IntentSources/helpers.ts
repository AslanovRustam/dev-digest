import type { IntentSourceStatus } from "@devdigest/shared";

/** Badge colour per source status: used → ok, unreachable → danger, anything else → warn. */
export function sourceStatusTone(s: IntentSourceStatus): string {
  if (s === "used") return "var(--ok)";
  if (s === "unreachable") return "var(--danger)";
  return "var(--warn)";
}
