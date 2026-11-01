/* ContextAttachments — the Context tab of an agent or a skill (L05): every
   project document of the active repo as a row, attached ones first in order
   (an agent also lists those it inherits from its skills, read-only). Each
   check, drop or Alt+Arrow move saves the whole ordered path list at once.
   The ≈ token total is what a run on the active repo would inject. Data comes
   in as props; only the Preview modal fetches. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ContextAttachments as AttachmentsView, ContextDocSummary } from "@devdigest/shared";
import { moveItem } from "@/lib/reorder";
import { AttachmentRow, type DragHandlers } from "./_components/AttachmentRow";
import { DocPreviewModal } from "./_components/DocPreviewModal";
import { buildRows, filterRows, ownPaths, serializeAs, togglePath } from "./helpers";
import { s } from "./styles";

/** `no_repo`: no active repo; `not_cloned`: the repo has no clone — paths can't be counted (AC-14). */
export type ContextRepoState = "ok" | "no_repo" | "not_cloned";

export function ContextAttachments({
  mode,
  repoId,
  repoState,
  view,
  documents,
  onSave,
  saveError,
}: {
  mode: "agent" | "skill";
  repoId: string | null;
  repoState: ContextRepoState;
  view: AttachmentsView;
  /** The active repo's documents (empty unless `repoState` is ok). */
  documents: readonly ContextDocSummary[];
  onSave: (paths: string[]) => void;
  saveError?: string | null;
}) {
  const t = useTranslations("context.attachments");
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [overPath, setOverPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  // Row moved by keyboard whose handle keeps focus: React re-inserts a row moved
  // down, which blurs it — put focus back once that has happened (as in SkillsTab).
  const refocusPath = React.useRef<string | null>(null);
  React.useEffect(() => {
    const path = refocusPath.current;
    const active = document.activeElement;
    if (!path || !listRef.current || (active && active !== document.body)) return;
    const row = Array.from(listRef.current.children).find(
      (li): li is HTMLElement => li instanceof HTMLElement && li.dataset.path === path,
    );
    row?.querySelector("button")?.focus();
    refocusPath.current = null;
  });

  const rows = buildRows(view.items, repoState === "ok" ? documents : []);
  const own = ownPaths(rows);
  const attached = rows.filter((r) => r.attached).length;
  const filtering = filter.trim() !== "";
  const visible = filterRows(rows, filter);
  const readable = new Set(documents.map((d) => d.path));

  const move = (path: string, delta: -1 | 1) => {
    const from = own.indexOf(path);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= own.length) return;
    refocusPath.current = path;
    onSave(moveItem(own, from, to));
  };
  const clearDrag = () => {
    setDragPath(null);
    setOverPath(null);
  };
  const dragHandlersFor = (path: string): DragHandlers => ({
    onDragStart: (e) => {
      setDragPath(path);
      e.dataTransfer?.setData("text/plain", path);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e) => {
      if (!dragPath || dragPath === path) return;
      e.preventDefault();
      if (overPath !== path) setOverPath(path);
    },
    onDrop: (e) => {
      e.preventDefault();
      const from = dragPath ? own.indexOf(dragPath) : -1;
      const to = own.indexOf(path);
      clearDrag();
      if (from !== -1 && to !== -1 && from !== to) onSave(moveItem(own, from, to));
    },
    onDragEnd: clearDrag,
  });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{mode === "agent" ? t("agentTitle") : t("skillTitle")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)" style={s.countBadge}>
          {mode === "agent" ? t("attachedOf", { attached, total: rows.length }) : t("attachedCount", { count: attached })}
        </Badge>
        <label style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filterPlaceholder")}
            aria-label={t("filterPlaceholder")}
            style={s.filterInput}
          />
        </label>
      </div>
      <p style={s.hint}>
        {filtering ? t("filterActiveHint") : mode === "agent" ? t("agentHint") : t("skillHint")}
      </p>
      {repoState !== "ok" && <p style={s.note}>{repoState === "no_repo" ? t("noRepo") : t("notCloned")}</p>}
      {saveError && (
        <p role="alert" style={s.error}>
          {t("saveError", { message: saveError })}
        </p>
      )}

      {visible.length === 0 ? (
        <p style={s.noMatches}>{filtering ? t("noMatches", { q: filter.trim() }) : t("noDocuments")}</p>
      ) : (
        <ul ref={listRef} style={s.list} aria-label={t("listLabel")}>
          {visible.map((row) => (
            <AttachmentRow
              key={row.path}
              row={row}
              reorderable={row.attached && !row.via && !filtering}
              dragging={dragPath === row.path}
              over={overPath === row.path}
              onToggle={() => onSave(togglePath(rows, row.path))}
              onMove={(delta) => move(row.path, delta)}
              onPreview={repoId && readable.has(row.path) ? () => setPreviewPath(row.path) : undefined}
              dragHandlers={dragHandlersFor(row.path)}
            />
          ))}
        </ul>
      )}

      <div style={s.footer}>
        <span style={s.total}>
          {repoState === "ok" ? t("tokens", { count: view.total_tokens }) : t("uncounted")}
        </span>
        {mode === "agent" && <span style={s.injected}>{t("injectedNote")}</span>}
      </div>
      {repoState === "ok" && view.requested_tokens > view.budget && (
        <p role="alert" style={s.warning}>
          {t("overBudget", { budget: view.budget, requested: view.requested_tokens })}
        </p>
      )}

      {mode === "skill" && (
        <>
          <div style={s.serialLabel}>{t("serializesAs")}</div>
          <pre className="mono" style={s.serial}>
            {serializeAs(own)}
          </pre>
          <p style={s.serialCaption}>{t("serializesCaption")}</p>
        </>
      )}

      {previewPath && repoId && (
        <DocPreviewModal repoId={repoId} path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  );
}
