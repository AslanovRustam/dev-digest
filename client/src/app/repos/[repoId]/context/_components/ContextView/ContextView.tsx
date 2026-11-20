/* ContextView — the Project Context page body (L05): the clone's markdown
   documents as a tree (New file / New folder / Upload / Rescan, footer with the
   scan time), and the selected document's preview or editor. The selection
   lives in `?doc=` so a reload or a shared link keeps it. Any action that
   would drop an unsaved edit asks first. */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, IconBtn, Skeleton } from "@devdigest/ui";
import type { ContextSaveResult } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import {
  useContextDocs,
  useContextDocument,
  useRescanContext,
} from "@/lib/hooks/project-context";
import { DocumentEditor } from "./_components/DocumentEditor";
import { DocumentPreview } from "./_components/DocumentPreview";
import { DocumentTree } from "./_components/DocumentTree";
import {
  buildTree,
  decodeUpload,
  defaultFolder,
  folderOf,
  joinPath,
  MAX_UPLOAD_BYTES,
  rootsLabel,
  scannedTime,
} from "./helpers";
import { s } from "./styles";

type Pane =
  | { kind: "view" }
  | { kind: "edit" }
  /** `seq` is new per open, so a confirmed discard always remounts the editor, even on the same path. */
  | { kind: "new"; seq: number; path: string; text: string; error?: string; hint?: string };

function readBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function ContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const docsQ = useContextDocs(repoId);
  const rescan = useRescanContext(repoId);
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pane, setPane] = React.useState<Pane>({ kind: "view" });
  const [folder, setFolder] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<ContextSaveResult | null>(null);
  const dirty = React.useRef(false);
  const uploadInput = React.useRef<HTMLInputElement>(null);
  const newSeq = React.useRef(0);
  // The editor owns this flag: it reports every change and clears it when it unmounts.
  const onDirtyChange = React.useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const list = docsQ.data;
  const docs = list?.documents ?? [];
  const selectedPath = search.get("doc") ?? docs[0]?.path ?? null;
  const docQ = useContextDocument(repoId, list?.state === "ok" ? selectedPath : null);

  if (docsQ.isError) {
    if (docsQ.error instanceof ApiError && docsQ.error.status === 404) {
      return (
        <div style={s.center}>
          <EmptyState icon="Folder" title={t("states.notFound")} body={t("states.notFoundBody")} />
        </div>
      );
    }
    return (
      <div style={s.center}>
        <ErrorState body={t("states.loadError")} onRetry={() => void docsQ.refetch()} />
      </div>
    );
  }
  if (list?.state === "not_cloned") {
    return (
      <div style={s.center}>
        <EmptyState icon="GitBranch" title={t("states.notClonedTitle")} body={t("states.notClonedBody")} />
      </div>
    );
  }

  /**
   * Run `action` unless it would drop an unsaved edit the user wants to keep. Every guarded action
   * closes or remounts the editor, whose unmount clears the flag — so the flag is never reset here.
   */
  const guard = (action: () => void) => {
    if (dirty.current && !window.confirm(t("editor.discardConfirm"))) return;
    action();
  };
  const roots = list?.roots ?? [];
  const currentFolder = folder ?? (selectedPath ? folderOf(selectedPath) : defaultFolder(docs, roots));

  const select = (path: string) =>
    guard(() => {
      setPane({ kind: "view" });
      setSaved(null);
      setFolder(null);
      router.replace(`${pathname}?doc=${encodeURIComponent(path)}`);
    });
  const openNew = (path: string, text = "", extra: { error?: string; hint?: string } = {}) =>
    guard(() => {
      setSaved(null);
      newSeq.current += 1;
      setPane({ kind: "new", seq: newSeq.current, path, text, ...extra });
    });
  const onUpload = async (file: File) => {
    const path = joinPath(currentFolder, file.name);
    // Refuse an oversized file before buffering it; a failed read is shown by the path field too.
    if (file.size > MAX_UPLOAD_BYTES) return openNew(path, "", { error: t("editor.uploadTooLarge") });
    let result: ReturnType<typeof decodeUpload>;
    try {
      result = decodeUpload(await readBytes(file));
    } catch {
      return openNew(path, "", { error: t("editor.uploadReadError") });
    }
    if (result.ok) openNew(path, result.text);
    else openNew(path, "", { error: t(result.reason === "too_large" ? "editor.uploadTooLarge" : "editor.uploadNotUtf8") });
  };
  const closeEditor = () => guard(() => setPane({ kind: "view" }));
  const onSaved = (result: ContextSaveResult) => {
    setSaved(result);
    setPane({ kind: "view" });
  };

  let paneBody: React.ReactNode = null;
  if (pane.kind === "new") {
    paneBody = (
      <DocumentEditor
        key={`new:${pane.seq}`}
        repoId={repoId}
        mode="create"
        initialPath={pane.path}
        initialText={pane.text}
        initialError={pane.error}
        hint={pane.hint}
        onCancel={closeEditor}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />
    );
  } else if (pane.kind === "edit" && selectedPath && docQ.data) {
    paneBody = (
      <DocumentEditor
        key={`edit:${selectedPath}`}
        repoId={repoId}
        mode="update"
        initialPath={selectedPath}
        initialText={docQ.data.text}
        baseVersion={docQ.data.version}
        onCancel={closeEditor}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />
    );
  } else if (list && docs.length === 0) {
    paneBody = (
      <div style={s.center}>
        <EmptyState icon="FileText" title={t("states.emptyTitle")} body={t("states.emptyBody", { roots: rootsLabel(roots) })} />
      </div>
    );
  } else if (selectedPath) {
    paneBody = (
      <DocumentPreview
        path={selectedPath}
        doc={docQ.data}
        loading={docQ.isLoading}
        error={docQ.error}
        onRetry={() => void docQ.refetch()}
        onEdit={() => {
          setSaved(null);
          setPane({ kind: "edit" });
        }}
      />
    );
  } else if (!docsQ.isLoading) {
    paneBody = <p style={s.hint}>{t("states.selectHint")}</p>;
  }

  return (
    <div style={s.layout}>
      <aside style={s.side}>
        <div style={s.sideHead}>
          <div style={s.sideLabel}>{t("side.label")}</div>
          {roots.length > 0 && <div style={s.roots}>{t("side.roots", { roots: rootsLabel(roots) })}</div>}
        </div>
        {list && (
          <div style={s.toolbar}>
            <IconBtn icon="Plus" label={t("side.newFile")} onClick={() => openNew(joinPath(currentFolder, "untitled.md"))} />
            <IconBtn
              icon="Folder"
              label={t("side.newFolder")}
              onClick={() =>
                openNew(joinPath(currentFolder, "new-folder/untitled.md"), "", { hint: t("editor.newFolderHint") })
              }
            />
            <IconBtn icon="Upload" label={t("side.upload")} onClick={() => uploadInput.current?.click()} />
            <IconBtn
              icon="RefreshCw"
              label={rescan.isPending ? t("side.rescanning") : t("side.rescan")}
              onClick={() =>
                guard(() => {
                  // A confirmed discard really discards: the editor closes with the old text.
                  setPane({ kind: "view" });
                  rescan.mutate();
                })
              }
            />
            <input
              ref={uploadInput}
              type="file"
              accept=".md,text/markdown"
              hidden
              data-testid="context-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onUpload(file);
              }}
            />
          </div>
        )}
        {rescan.isError && (
          <div role="alert" style={s.rescanError}>
            {t("side.rescanError", { message: (rescan.error as Error).message })}
          </div>
        )}
        <div style={s.tree}>
          {docsQ.isLoading ? (
            <div style={s.skeletons} role="status" aria-label={t("side.loading")}>
              <Skeleton height={18} />
              <Skeleton height={18} width="80%" />
              <Skeleton height={18} width="65%" />
            </div>
          ) : (
            <DocumentTree
              nodes={buildTree(docs)}
              label={t("side.treeLabel")}
              selectedPath={selectedPath}
              selectedFolder={folder}
              onSelectFile={select}
              onSelectFolder={setFolder}
            />
          )}
        </div>
        {list?.scanned_at && (
          <div style={s.footer}>
            <span>{t("side.footer", { count: list.total, time: scannedTime(list.scanned_at) })}</span>
            {list.total > docs.length && <span>{t("side.moreNotListed", { count: list.total - docs.length })}</span>}
          </div>
        )}
      </aside>

      <section style={s.pane}>
        {saved && (
          <div role="status" style={s.saved}>
            <a href={saved.pr_url} target="_blank" rel="noopener noreferrer" style={s.savedLink}>
              {t("editor.prOpened", { number: saved.pr_number })}
            </a>
            <span style={s.savedHint}>{t("editor.prOpenedHint")}</span>
          </div>
        )}
        {paneBody}
      </section>
    </div>
  );
}
