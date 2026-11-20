/* AttachmentRow — one document in a Context tab: drag handle, checkbox, name,
   folder, labels ("via <skill>", "not in this repo", …), type badge, Preview.
   Drag events come from ContextAttachments; Alt+ArrowUp/Down is the keyboard
   move. An inherited row is read-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Icon } from "@devdigest/ui";
import { rowLabelKeys, type AttachmentRowModel } from "../../helpers";
import { s, TYPE_COLORS } from "../../styles";

export type DragHandlers = Pick<
  React.HTMLAttributes<HTMLLIElement>,
  "onDragStart" | "onDragOver" | "onDrop" | "onDragEnd"
>;

export function AttachmentRow({
  row,
  reorderable,
  dragging,
  over,
  onToggle,
  onMove,
  onPreview,
  dragHandlers,
}: {
  row: AttachmentRowModel;
  /** Own attachment and no active filter: draggable and movable by keyboard. */
  reorderable: boolean;
  dragging: boolean;
  over: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  /** Absent when the document can't be read here (no repo, not in it). */
  onPreview?: () => void;
  dragHandlers: DragHandlers;
}) {
  const t = useTranslations("context.attachments");
  const labels = rowLabelKeys(row.item);

  const onKeyDown = (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (!reorderable || !e.altKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
    }
  };

  return (
    <li
      draggable={reorderable}
      onKeyDown={onKeyDown}
      data-path={row.path}
      style={s.row({ checked: row.attached, dragging, over })}
      {...(reorderable ? dragHandlers : {})}
    >
      <button
        type="button"
        aria-label={t("reorder", { path: row.path })}
        aria-disabled={!reorderable}
        title={reorderable ? t("reorderHint") : undefined}
        style={s.handle(reorderable)}
      >
        <Icon.GripVertical size={14} />
      </button>
      <Checkbox
        checked={row.attached}
        onChange={row.via ? undefined : onToggle}
        label={
          <span>
            <span className="mono" style={s.name}>
              {row.name}
            </span>{" "}
            <span className="mono" style={s.folder}>
              {row.folder}
            </span>
          </span>
        }
      />
      <span style={s.labels}>
        {row.via && <span style={s.label}>{t("via", { skill: row.via })}</span>}
        {labels.map((key) => (
          <span key={key} style={s.label}>
            {t(key)}
          </span>
        ))}
      </span>
      <span style={s.rowRight}>
        {row.item?.tokens != null && <span style={s.rowTokens}>{t("tokens", { count: row.item.tokens })}</span>}
        {row.type && (
          <Badge color={TYPE_COLORS[row.type].color} bg={TYPE_COLORS[row.type].bg}>
            {row.type}
          </Badge>
        )}
        {onPreview && (
          <Button size="sm" kind="secondary" icon="Eye" onClick={onPreview} aria-label={t("previewOf", { path: row.path })}>
            {t("preview")}
          </Button>
        )}
      </span>
    </li>
  );
}
