/* DocumentPreview — the selected document: path, Preview / Edit switch, "Used by
   N agents", ≈ tokens and the rendered markdown. Markdown never renders raw
   HTML, so a document's <script> shows as inert text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { s as pane } from "../../styles";
import { s } from "./styles";

export function DocumentPreview({
  path,
  doc,
  loading,
  error,
  onRetry,
  onEdit,
}: {
  path: string;
  doc: ContextDocument | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Absent → no Edit switch (e.g. the repo has no clone). */
  onEdit?: () => void;
}) {
  const t = useTranslations("context");

  return (
    <>
      <div style={pane.paneHeader}>
        <span className="mono" style={pane.panePath}>
          {path}
        </span>
        <div style={pane.paneModes} role="group" aria-label={t("doc.modeLabel")}>
          <button type="button" style={pane.paneMode(true)} aria-pressed="true">
            {t("doc.preview")}
          </button>
          {onEdit && doc && (
            <button type="button" style={pane.paneMode(false)} aria-pressed="false" onClick={onEdit}>
              {t("doc.edit")}
            </button>
          )}
        </div>
        {doc && (
          <div style={s.meta}>
            <span style={s.metaItem}>
              <Icon.Cpu size={13} />
              {t("doc.usedBy", { count: doc.used_by_agents })}
            </span>
            <span style={s.metaItem}>{t("doc.tokens", { count: doc.tokens })}</span>
          </div>
        )}
      </div>
      <PreviewBody doc={doc} loading={loading} error={error} onRetry={onRetry} />
    </>
  );
}

function PreviewBody({
  doc,
  loading,
  error,
  onRetry,
}: {
  doc: ContextDocument | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const t = useTranslations("context");
  if (loading) {
    return (
      <div style={s.skeletons} role="status" aria-label={t("side.loading")}>
        <Skeleton height={22} width="40%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="80%" />
      </div>
    );
  }
  const status = error instanceof ApiError ? error.status : null;
  if (status === 404) return <p style={s.note}>{t("states.docNotFound")}</p>;
  if (status === 413) return <p style={s.note}>{t("states.docTooLarge")}</p>;
  if (error) return <ErrorState body={t("states.docLoadError")} onRetry={onRetry} />;
  if (!doc) return null;
  return (
    <article style={s.body}>
      <Markdown>{doc.text}</Markdown>
    </article>
  );
}
