/* IntentSources — what the classifier saw (or could not see), recorded by code. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { IntentSource } from "@devdigest/shared";
import { sourceStatusTone } from "../../helpers";
import { s } from "./styles";

export function IntentSources({ sources, missing }: { sources: IntentSource[]; missing: string[] }) {
  const t = useTranslations("intent");
  return (
    <div>
      <div style={s.list}>
        {sources.map((src, i) => (
          <div key={`${src.kind}-${src.ref}-${i}`} style={s.row}>
            <span style={s.kind}>{t(`sourceKind.${src.kind}`)}</span>
            <span style={s.ref}>{src.ref}</span>
            <Badge color={sourceStatusTone(src.status)}>{t(`sourceStatus.${src.status}`)}</Badge>
            {src.truncated && <Badge>{t("truncated")}</Badge>}
            {src.reason && src.status !== "used" && <span style={s.reason}>{src.reason}</span>}
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <>
          <div style={s.missingLabel}>{t("missingContext")}</div>
          <ul style={s.missing}>
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
