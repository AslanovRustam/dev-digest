/* VersionDiff — inline line diff of an older version against the current body:
   removed lines red with "-", added lines green with "+". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { hasChanges, lineDiff } from "./helpers";
import { s } from "./styles";

const SIGN = { same: " ", add: "+", del: "-" } as const;

export function VersionDiff({ from, to }: { from: string; to: string }) {
  const t = useTranslations("skills");
  const diff = React.useMemo(() => lineDiff(from, to), [from, to]);

  if (!hasChanges(diff)) return <div style={s.same}>{t("versions.noChanges")}</div>;

  return (
    <pre className="mono" style={s.panel}>
      {diff.map((line, i) => (
        <div key={i} data-kind={line.kind} style={s.line(line.kind)}>
          <span style={s.sign}>{SIGN[line.kind]}</span>
          {line.text || " "}
        </div>
      ))}
    </pre>
  );
}
