import type { WorkflowCase } from "../src/index.js";

/**
 * Does the dependency-checker skill ENGAGE from its `description` in the real harness
 * (settingSources:["project"])? Content evals cannot see this — they inject the skill by hand.
 *
 * Budget: 2 Claude sessions (positive + near-miss negative). Turns are capped low: engagement shows
 * in the first turns (a Skill call or a read of its SKILL.md), and the workflow tier has no Bash,
 * so a real check could not finish here anyway.
 */
export const cases: WorkflowCase[] = [
  {
    kind: "activation",
    name: "a dependency audit request engages dependency-checker",
    prompt:
      "Перевір залежності в цьому репо: що найважче, що не використовується і що розʼїхалось по версіях між пакетами.",
    skill: "dependency-checker",
    shouldActivate: true,
    maxTurns: 3,
  },
  {
    kind: "activation",
    // Near-miss: same vocabulary (package.json, dependencies), but a general-knowledge question.
    name: "a general npm question does NOT engage dependency-checker",
    prompt:
      "Коротко поясни, чим peerDependencies відрізняються від dependencies у package.json. Репозиторій аналізувати не треба.",
    skill: "dependency-checker",
    shouldActivate: false,
    maxTurns: 2,
  },
];
