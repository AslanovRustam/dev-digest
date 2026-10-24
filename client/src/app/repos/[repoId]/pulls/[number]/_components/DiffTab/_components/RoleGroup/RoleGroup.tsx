"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffAnnotationApi, type DiffCommentApi } from "@/components/diff-viewer";
import type { PrFile } from "@devdigest/shared";
import { s, chevronFor, roleSquare } from "./styles";

interface RoleGroupHeading {
  label: string;
  /** One-line description of the role, muted after the label. */
  hint: string;
  /** Colour of the role square. */
  color: string;
}

interface RoleGroupProps {
  heading: RoleGroupHeading;
  files: PrFile[];
  defaultOpen: boolean;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** Findings indicator rendered next to the label. */
  badge?: React.ReactNode;
}

/** One role group of the Smart Diff: a sticky, collapsible header over its files. */
export function RoleGroup({ heading, files, defaultOpen, commenting, annotations, badge }: RoleGroupProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={14} style={chevronFor(open)} />
        <span aria-hidden style={roleSquare(heading.color)} />
        <span>{heading.label}</span>
        <span style={s.hint}>{heading.hint}</span>
        {/* Findings badge + file count sit on the right edge, as in the prototype. */}
        <span style={s.spacer} />
        {badge}
        <span style={s.count}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          <DiffViewer files={files} commenting={commenting} annotations={annotations} />
        </div>
      )}
    </div>
  );
}
