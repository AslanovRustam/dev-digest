import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Icon beside the source label (labels are i18n'd under skills.card.source). */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_url: "Upload",
  imported_file: "Upload",
  extracted: "Wrench",
  community: "Globe",
};
