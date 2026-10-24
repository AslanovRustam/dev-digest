/* UnanchoredAnnotations — footer block for annotations whose line is not part of
   the rendered patch (e.g. a finding outside the changed hunks). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { type DiffAnnotation } from "../annotations";
import { cs } from "../comments";

export function UnanchoredAnnotations({ items }: { items: DiffAnnotation[] }) {
  const t = useTranslations("shell");
  if (items.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("diffViewer.notInDiff")}</span>
      {items.map((a) => (
        <React.Fragment key={a.id}>{a.content}</React.Fragment>
      ))}
    </div>
  );
}
