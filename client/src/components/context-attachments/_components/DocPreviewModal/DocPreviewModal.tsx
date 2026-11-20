/* DocPreviewModal — a document's rendered markdown and ≈ tokens, opened from a
   Context tab row. Portalled into <body> so the row's dimming and clicks don't
   leak in; Escape closes it from inside or outside the dialog. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Modal, Skeleton } from "@devdigest/ui";
import { useContextDocument } from "@/lib/hooks/project-context";
import { s } from "../../styles";

export function DocPreviewModal({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const t = useTranslations("context");
  const docQ = useContextDocument(repoId, path);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Stopping propagation hides the key from the window listener, so handle Escape here too.
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <Modal
        width={760}
        title={<span className="mono">{path}</span>}
        subtitle={docQ.data ? t("doc.tokens", { count: docQ.data.tokens }) : undefined}
        onClose={onClose}
      >
        <div style={s.previewBody}>
          {docQ.isLoading && <Skeleton height={14} />}
          {docQ.isError && <ErrorState body={t("states.docLoadError")} onRetry={() => void docQ.refetch()} />}
          {docQ.data && <Markdown>{docQ.data.text}</Markdown>}
        </div>
      </Modal>
    </div>,
    document.body,
  );
}
