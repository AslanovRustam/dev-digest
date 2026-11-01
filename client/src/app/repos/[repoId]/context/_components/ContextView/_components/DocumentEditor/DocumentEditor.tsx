/* DocumentEditor — Edit an existing document, or write a new / uploaded one.
   Save commits to a NEW branch off the default branch and opens a PR (the
   clone is never written). Every failure keeps the text; a dirty editor tells
   ContextView through `onDirtyChange`, which asks before discarding it. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { ContextSaveResult } from "@devdigest/shared";
import { useSaveContextDocument } from "@/lib/hooks/project-context";
import { s as pane } from "../../styles";
import { defaultCommitMessage, saveErrorView } from "./helpers";
import { s } from "./styles";

export function DocumentEditor({
  repoId,
  mode,
  initialPath,
  initialText,
  baseVersion,
  initialError,
  hint,
  onCancel,
  onSaved,
  onDirtyChange,
}: {
  repoId: string;
  mode: "create" | "update";
  initialPath: string;
  initialText: string;
  /** `ContextDocument.version` the edit starts from (update only). */
  baseVersion?: string;
  /** Shown by the path field from the start (e.g. an upload that isn't UTF-8). */
  initialError?: string;
  hint?: string;
  onCancel: () => void;
  onSaved: (result: ContextSaveResult) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("context");
  const save = useSaveContextDocument(repoId);
  const [path, setPath] = React.useState(initialPath);
  const [text, setText] = React.useState(initialText);
  // null = follow the path (`docs: update <path>`) until the user edits the message.
  const [message, setMessage] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState(initialError ?? null);
  const submitting = React.useRef(false);

  const dirty = text !== initialText || path !== initialPath;
  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  // Leaving (unmount) always clears the parent's flag, so it never outlives the editor.
  React.useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const commit = message ?? defaultCommitMessage(mode, path);
  const errorView = saveErrorView(save.error);
  const fieldError = uploadError ?? (errorView?.place === "field" ? errorView.message : null);

  const submit = () => {
    // One request per click burst — isPending only flips after a re-render.
    if (submitting.current) return;
    submitting.current = true;
    setUploadError(null);
    save.mutate(
      { path, text, mode, ...(mode === "update" ? { base_version: baseVersion } : {}), message: commit },
      {
        onSuccess: (result) => {
          onDirtyChange(false);
          onSaved(result);
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };

  return (
    <form
      style={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div style={pane.paneHeader}>
        {mode === "update" && (
          <span className="mono" style={pane.panePath}>
            {path}
          </span>
        )}
        <div style={pane.paneModes} role="group" aria-label={t("doc.modeLabel")}>
          {mode === "update" && (
            <button type="button" style={pane.paneMode(false)} aria-pressed="false" onClick={onCancel}>
              {t("doc.preview")}
            </button>
          )}
          <button type="button" style={pane.paneMode(true)} aria-pressed="true">
            {t("doc.edit")}
          </button>
        </div>
      </div>

      <div style={s.body}>
        {mode === "create" && (
          <div style={s.field}>
            <label htmlFor="context-doc-path" style={s.label}>
              {t("editor.pathLabel")}
            </label>
            <input
              id="context-doc-path"
              className="mono"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "context-doc-path-error" : undefined}
              style={s.input(!!fieldError)}
            />
            {fieldError && (
              <span id="context-doc-path-error" role="alert" style={s.fieldError}>
                {fieldError}
              </span>
            )}
            {hint && <span style={s.hint}>{hint}</span>}
          </div>
        )}
        {mode === "update" && fieldError && (
          <span role="alert" style={s.fieldError}>
            {fieldError}
          </span>
        )}

        {errorView?.place === "changed" && (
          <div role="alert" style={s.banner}>
            {t("editor.changedUpstream")}
          </div>
        )}
        {errorView?.place === "github" && (
          <div role="alert" style={s.banner}>
            {t("editor.githubRefused", { message: errorView.message })}
            <Link href="/settings/api-keys" style={s.link}>
              {t("editor.openSettings")}
            </Link>
          </div>
        )}
        {(errorView?.place === "retry" || errorView?.place === "banner") && (
          <div role="alert" style={s.banner}>
            {t("editor.saveFailed", { message: errorView.message })}
            {errorView.place === "retry" && (
              <Button size="sm" kind="secondary" type="button" onClick={submit}>
                {t("editor.retry")}
              </Button>
            )}
          </div>
        )}

        <textarea
          aria-label={t("editor.sourceLabel")}
          className="mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          style={s.source}
        />

        <div style={s.field}>
          <label htmlFor="context-doc-message" style={s.label}>
            {t("editor.messageLabel")}
          </label>
          <input
            id="context-doc-message"
            className="mono"
            value={commit}
            maxLength={200}
            onChange={(e) => setMessage(e.target.value)}
            style={s.input(false)}
          />
        </div>
      </div>

      <div style={s.footer}>
        <Button kind="secondary" type="button" onClick={onCancel} disabled={save.isPending}>
          {t("editor.cancel")}
        </Button>
        <Button kind="primary" type="submit" disabled={save.isPending}>
          {save.isPending ? t("editor.committing") : t("editor.save")}
        </Button>
      </div>
    </form>
  );
}
