/* BodyEditor — code-editor panel for a skill body: `<name>.md` file header with
   an "unsaved" badge and a token estimate, a line-number gutter and a
   non-wrapping monospace textarea whose scroll the gutter follows. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { MAX_ROWS, MIN_ROWS } from "./constants";
import { countLines, estimateTokens, gutterText } from "./helpers";
import { s } from "./styles";

export function BodyEditor({
  fileName,
  value,
  onChange,
  dirty,
}: {
  fileName: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLPreElement>(null);
  const lines = countLines(value);
  const rows = Math.min(Math.max(lines, MIN_ROWS), MAX_ROWS);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <Icon.FileText size={13} style={s.fileIcon} />
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        {dirty && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" style={s.unsaved}>
            {t("config.unsaved")}
          </Badge>
        )}
        <span className="mono tnum" style={s.tokens}>
          {t("config.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <div style={s.body}>
        <pre ref={gutterRef} aria-hidden className="mono" style={s.gutter(rows)}>
          {gutterText(lines)}
        </pre>
        <textarea
          className="mono"
          aria-label={t("config.bodyLabel")}
          value={value}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea(rows)}
        />
      </div>
    </div>
  );
}
