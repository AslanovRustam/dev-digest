/* SeverityTally — compact per-severity counts ("⊘2 ⚠2 💡2") for the PR list and
   the run timeline. Levels with zero findings are omitted; icon + number, never
   colour alone. The dotted underline hints that hovering reveals more. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import { SEVERITIES, type SeverityTallyCounts } from "@/lib/findings";
import { s } from "./styles";

export function SeverityTally({ counts }: { counts: SeverityTallyCounts }) {
  const levels = SEVERITIES.filter((sev) => counts[sev] > 0);
  const label = levels.map((sev) => `${counts[sev]} ${SEV[sev].label.toLowerCase()}`).join(", ");
  return (
    <span role="img" aria-label={label} data-testid="severity-tally" style={s.row}>
      {levels.map((sev) => {
        const I = Icon[SEV[sev].icon];
        return (
          <span key={sev} data-severity={sev} style={s.item(SEV[sev].c)}>
            <I size={13} />
            <span className="tnum">{counts[sev]}</span>
          </span>
        );
      })}
    </span>
  );
}

export default SeverityTally;
