/* ImportSkillModal — "Import from file". Pick a .md/.zip (≤ 512 KB) → the
   server parses it and returns a preview (nothing stored) → the user reads the
   body, the parser warnings and the files that were NOT imported → "Save as
   disabled" creates the skill with source imported_file, enabled false. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Markdown, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType, SkillImportPreview } from "@devdigest/shared";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import { useCreateSkill, usePreviewSkillImport } from "@/lib/hooks";
import { IMPORT_ACCEPT } from "./constants";
import { checkImportFile, importNote, readFileAsBase64 } from "./helpers";
import { s } from "./styles";

interface Draft {
  name: string;
  description: string;
  type: SkillType;
}

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const preview = usePreviewSkillImport();
  const create = useCreateSkill();

  const [filename, setFilename] = React.useState<string | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);
  const [parsed, setParsed] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<Draft>({ name: "", description: "", type: "custom" });
  const [showRaw, setShowRaw] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`config.types.${v}`) }));

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setParsed(null);
    setFileError(null);
    preview.reset();
    create.reset();
    const problem = checkImportFile(file);
    if (problem === "too_large") return setFileError(t("import.tooLarge", { filename: file.name }));
    if (problem === "bad_extension") return setFileError(t("import.badExtension"));

    setFilename(file.name);
    setReading(true);
    let content_base64: string;
    try {
      content_base64 = await readFileAsBase64(file);
    } catch {
      setReading(false);
      return setFileError(t("import.readFailed"));
    }
    setReading(false);
    preview.mutate(
      { filename: file.name, content_base64 },
      {
        onSuccess: (p) => {
          setParsed(p);
          setDraft({ name: p.name, description: p.description, type: p.type });
          setShowRaw(false);
        },
      },
    );
  };

  const reset = () => {
    setParsed(null);
    setFilename(null);
    setFileError(null);
    preview.reset();
    create.reset();
  };

  const save = () => {
    if (!parsed || !filename) return;
    create.mutate(
      {
        name: draft.name.trim(),
        description: draft.description,
        type: draft.type,
        body: parsed.body,
        enabled: false,
        source: "imported_file",
        note: importNote(t("import.note", { filename })),
      },
      {
        onSuccess: (skill) => {
          onClose();
          router.push(`/skills/${skill.id}`);
        },
      },
    );
  };

  const busy = reading || preview.isPending;
  const serverError = preview.error ?? create.error;

  const footer = (
    <div style={s.footer}>
      {parsed && (
        <Button kind="ghost" icon="Upload" onClick={reset}>
          {t("import.chooseAnother")}
        </Button>
      )}
      <div style={s.spacer} />
      <Button kind="secondary" onClick={onClose}>
        {t("import.cancel")}
      </Button>
      <Button
        kind="primary"
        icon="Lock"
        onClick={save}
        disabled={!parsed || !draft.name.trim()}
        loading={create.isPending}
      >
        {create.isPending ? t("import.saving") : t("import.save")}
      </Button>
    </div>
  );

  return (
    <Modal width={760} title={t("import.title")} subtitle={t("import.subtitle")} onClose={onClose} footer={footer}>
      <div style={s.body}>
        {!parsed && (
          <label
            style={s.dropzone(dragOver)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void pickFile(e.dataTransfer.files[0]);
            }}
          >
            <Icon.Upload size={22} style={s.dropIcon} />
            <span style={s.dropTitle}>
              {busy && filename ? t("import.reading", { filename }) : t("import.dropzone")}
            </span>
            <span style={s.dropHint}>{t("import.dropzoneHint")}</span>
            <input
              type="file"
              accept={IMPORT_ACCEPT}
              aria-label={t("import.fileLabel")}
              disabled={busy}
              style={s.fileInput}
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        )}

        {fileError && (
          <div role="alert" style={s.error}>
            {fileError}
          </div>
        )}
        {serverError && (
          <div role="alert" style={s.error}>
            {serverError.message}
          </div>
        )}

        {parsed && (
          <>
            <div role="note" style={s.trustBanner}>
              <Icon.AlertTriangle size={16} style={s.trustIcon} />
              <span>{t("import.trustBanner")}</span>
            </div>

            <div style={s.sourceLine}>
              <Icon.FileText size={13} />
              <span className="mono">{t("import.sourceFile", { file: parsed.source_file })}</span>
            </div>

            {parsed.warnings.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionLabel}>{t("import.warnings")}</div>
                <ul style={s.list}>
                  {parsed.warnings.map((w, i) => (
                    <li key={i} style={s.warning}>
                      <Icon.AlertTriangle size={12} style={s.warningIcon} />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.ignored_files.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionLabel}>{t("import.ignoredTitle")}</div>
                <ul style={s.list}>
                  {parsed.ignored_files.map((f) => (
                    <li key={f.path} style={s.ignoredRow}>
                      <Icon.File size={12} style={s.ignoredIcon} />
                      <span className="mono" style={s.ignoredPath}>
                        {f.path}
                      </span>
                      <span style={s.ignoredReason(f.reason === "executable")}>{t(`import.reason.${f.reason}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <FormField label={t("config.name")} required>
              <TextInput mono value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} />
            </FormField>
            <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(description) => setDraft((d) => ({ ...d, description }))}
              />
            </FormField>
            <FormField label={t("config.type")}>
              <SelectInput
                value={draft.type}
                onChange={(v) => setDraft((d) => ({ ...d, type: v as SkillType }))}
                options={typeOptions}
              />
            </FormField>
            <FormField
              label={t("import.body")}
              right={
                <Button kind="tertiary" size="sm" icon={showRaw ? "Eye" : "Code"} onClick={() => setShowRaw((r) => !r)}>
                  {showRaw ? t("import.showRendered") : t("import.showRaw")}
                </Button>
              }
            >
              <div style={s.bodyPanel}>
                {showRaw ? <pre className="mono" style={s.raw}>{parsed.body}</pre> : <Markdown>{parsed.body}</Markdown>}
              </div>
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
