/* Route: /skills (Skills Lab › Skills). Thin route entry — the list, the
   import modal and the right-pane hint / empty state live in _components. */
"use client";

import { SkillsWorkspace } from "./_components/SkillsWorkspace";
import { SkillsIndexPane } from "./_components/SkillsIndexPane";

export default function SkillsPage() {
  return <SkillsWorkspace>{({ openImport }) => <SkillsIndexPane onImport={openImport} />}</SkillsWorkspace>;
}
