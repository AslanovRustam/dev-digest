/* VersionDiff — inline line diff of one body against another (a version against
   the one before it): removed lines red with "-", added lines green with "+".
   Unchanged runs fold into "⋯ N unchanged lines" so every change is in view,
   and an added/removed EMPTY line shows "⏎" so whitespace-only edits are visible. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { foldUnchanged, hasChanges, lineDiff } from "./helpers";
import { s } from "./styles";

const SIGN = { same: " ", add: "+", del: "-" } as const;

export function VersionDiff({ from, to }: { from: string; to: string }) {
  const t = useTranslations("skills");
  const diff = React.useMemo(() => lineDiff(from, to), [from, to]);

  if (!hasChanges(diff)) return <div style={s.same}>{t("versions.noChanges")}</div>;

  return (
    <pre className="mono" style={s.panel}>
      {foldUnchanged(diff).map((row, i) =>
        row.kind === "gap" ? (
          <div key={i} data-kind="gap" style={s.gap}>
            {t("versions.unchangedLines", { count: row.count })}
          </div>
        ) : (
          <div key={i} data-kind={row.line.kind} style={s.line(row.line.kind)}>
            <span style={s.sign}>{SIGN[row.line.kind]}</span>
            {row.line.text ||
              (row.line.kind === "same" ? (
                " "
              ) : (
                <span style={s.emptyMark} title={t("versions.emptyLine")} aria-label={t("versions.emptyLine")}>
                  ⏎
                </span>
              ))}
          </div>
        ),
      )}
    </pre>
  );
}
