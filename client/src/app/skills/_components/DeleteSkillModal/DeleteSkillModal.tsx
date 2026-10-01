/* DeleteSkillModal — confirms deleting a skill: Cancel or Delete. Shared by the
   skill card's trash button and the Config tab's Delete button.
   Rendered through a portal into <body>: the card can be dimmed (opacity) and
   is itself clickable, so an inline modal would inherit the dimming and its
   clicks would select the card. React still bubbles portal events through the
   component tree, so the wrapper stops them here. If the deleted skill is the
   one open in the detail pane, it navigates back to /skills. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function DeleteSkillModal({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const del = useDeleteSkill();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !del.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, del.isPending]);

  const confirm = () => {
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deletedToast"));
        onClose();
        if (pathname?.includes(skill.id)) router.push("/skills");
      },
    });
  };

  const agents = skill.agent_count ?? 0;

  return createPortal(
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Modal
        width={460}
        title={t("deleteModal.title")}
        onClose={del.isPending ? undefined : onClose}
        footer={
          <div style={s.footer}>
            <Button kind="secondary" onClick={onClose} disabled={del.isPending} autoFocus>
              {t("deleteModal.cancel")}
            </Button>
            <Button kind="danger" icon="Trash" onClick={confirm} loading={del.isPending}>
              {t("deleteModal.confirm")}
            </Button>
          </div>
        }
      >
        <div style={s.body}>
          {t.rich("deleteModal.body", {
            name: skill.name,
            b: (chunks) => <span className="mono" style={s.name}>{chunks}</span>,
          })}
          {agents > 0 && <div style={s.warning}>{t("deleteModal.linked", { count: agents })}</div>}
        </div>
      </Modal>
    </div>,
    document.body,
  );
}

export default DeleteSkillModal;
