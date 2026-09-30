/* PreviewTab — the skill body rendered as markdown, as the reviewing agent reads it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { s } from "./styles";

export function PreviewTab({ body }: { body: string }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <div style={s.panel}>
        <Markdown>{body}</Markdown>
      </div>
    </div>
  );
}
