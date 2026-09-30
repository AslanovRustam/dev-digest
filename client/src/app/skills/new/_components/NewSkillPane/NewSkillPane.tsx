/* NewSkillPane — right pane of /skills/new: a "New skill" header over the
   blank Config form. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SkillIconTile } from "../../../_components/SkillIconTile";
import { ConfigTab } from "../../../_components/ConfigTab";
import { s } from "./styles";

export function NewSkillPane() {
  const t = useTranslations("skills");
  return (
    <>
      <div style={s.header}>
        <SkillIconTile type="custom" size={30} />
        <h2 style={s.title}>{t("new.title")}</h2>
      </div>
      <div style={s.body}>
        <ConfigTab />
      </div>
    </>
  );
}
