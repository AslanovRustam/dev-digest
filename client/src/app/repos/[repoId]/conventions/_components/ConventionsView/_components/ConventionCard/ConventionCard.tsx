/* ConventionCard — one convention candidate: the rule, its evidence (file:line
   linking to GitHub at the scan's commit, plus the verified snippet), the
   model's confidence and the triage actions. Accept / Reject toggle back to
   pending when clicked again; Edit rewrites the rule or category in place
   (the evidence is not editable — it was verified against the repo). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, MonoLink, ProgressBar, SelectInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, ConventionPatch } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { useToast } from "@/lib/toast";
import { CATEGORIES } from "../../constants";
import { confidenceColor, evidenceRef } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate: c,
  repoFullName,
  onPatch,
}: {
  candidate: ConventionCandidate;
  /** owner/name — null while the repo list loads (link falls back to plain text). */
  repoFullName: string | null;
  onPatch: (patch: ConventionPatch) => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(c.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(c.category);

  const ref = evidenceRef(c);
  const href =
    repoFullName && c.source_sha
      ? githubBlobUrl(repoFullName, c.source_sha, c.evidence_path, c.evidence_start_line, c.evidence_end_line)
      : undefined;
  const pct = Math.round(c.confidence * 100);
  const accepted = c.status === "accepted";
  const rejected = c.status === "rejected";

  const startEdit = () => {
    setRule(c.rule);
    setCategory(c.category);
    setEditing(true);
  };
  const saveEdit = () => {
    const patch: ConventionPatch = {};
    if (rule.trim() !== c.rule) patch.rule = rule.trim();
    if (category !== c.category) patch.category = category;
    if (Object.keys(patch).length > 0) onPatch(patch);
    setEditing(false);
  };
  const copy = () => {
    void navigator.clipboard?.writeText(`${ref}\n${c.evidence_snippet}`).then(
      () => toast.success(t("card.copied")),
      () => undefined,
    );
  };

  return (
    <article style={s.card(c.status)} aria-label={c.rule}>
      <div style={s.main}>
        {editing ? (
          <div style={s.editGrid}>
            <label style={s.editLabel}>
              {t("card.ruleLabel")}
              <Textarea rows={2} value={rule} onChange={setRule} />
            </label>
            <label style={s.editLabel}>
              {t("card.categoryLabel")}
              <SelectInput
                value={category}
                onChange={(v) => setCategory(v as ConventionCategory)}
                options={CATEGORIES.map((k) => ({ value: k, label: t(`category.${k}`) }))}
              />
            </label>
            <div style={s.editActions}>
              <Button kind="primary" size="sm" icon="Check" onClick={saveEdit} disabled={rule.trim().length < 3}>
                {t("card.save")}
              </Button>
              <Button kind="secondary" size="sm" onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h3 style={s.rule}>{c.rule}</h3>
            <div style={s.meta}>
              <Badge color="var(--text-secondary)" bg="var(--bg-hover)">
                {t(`category.${c.category}`)}
              </Badge>
              {c.skill_id && c.skill_name && (
                <Link href={`/skills/${c.skill_id}`} style={s.skillLink}>
                  <Badge color="var(--ok)" bg="var(--ok-bg)">
                    {t("card.inSkill", { name: c.skill_name })}
                  </Badge>
                </Link>
              )}
            </div>
          </>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            {href ? (
              <span title={t("card.openOnGithub", { ref })}>
                <MonoLink href={href}>{ref}</MonoLink>
              </span>
            ) : (
              <span className="mono" style={s.evidenceRefPlain}>
                {ref}
              </span>
            )}
            <span style={s.spacer} />
            <IconBtn icon="Copy" label={t("card.copy")} onClick={copy} />
          </div>
          <pre className="mono" style={s.code}>
            {c.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidence}>
          <span>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={confidenceColor(c.confidence)} height={5} />
          </div>
          <span className="mono tnum" style={s.pct}>
            {pct}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={accepted}
          onClick={() => onPatch({ status: accepted ? "pending" : "accepted" })}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          icon="X"
          full
          aria-pressed={rejected}
          onClick={() => onPatch({ status: rejected ? "pending" : "rejected" })}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
        {!editing && (
          <Button kind="ghost" size="sm" icon="Edit" full onClick={startEdit}>
            {t("card.edit")}
          </Button>
        )}
      </div>
    </article>
  );
}

export default ConventionCard;
