import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

/**
 * Cases written in the agent's REAL vocabulary (`.claude/agents/architecture-reviewer.md`):
 * status `ARCHITECTURE REVIEW: CLEAN | FINDINGS | INCOMPLETE | BLOCKED`, severities CRITICAL / WARNING /
 * SUGGESTION, rule ids only from its fixed table (`R1`…`R13` from onion-architecture `rules.md`,
 * `ON-*`, `FE-*`, `X-*`, `MCP-ARCH`). The previous version expected PASS/FAIL, critical/high/medium and
 * invented ids (`inward-only-dependencies`, `reviewer-core-zero-io`) the agent never emits, so it
 * failed at baseline before any edit (root INSIGHTS.md, 2026-11-22).
 *
 * Eval conditions the prompt states explicitly, or a correct agent returns BLOCKED / wanders:
 *  - the fixture diffs describe files that do NOT exist in the repo, so the scope is the diff text;
 *  - agentTask strips Bash/Write (evals/src/config.ts MUTATING_TOOLS), so Step 1's deterministic checks
 *    (`pnpm arch`, the reviewer-core purity test) cannot run → they belong under "Not checked", and a
 *    review with no findings is INCOMPLETE, not CLEAN — both are accepted below.
 *
 * Shared with evals/agents/architecture-reviewer-lite (the relaxed-citation A/B variant).
 */
const prompt = (fixture: string, files: string[]) => `Review this change set.

scope: ${files.join(", ")}
These files exist only in the diff below, not in the working tree — review the diff text as given and do
not try to compute the scope from git. Bash is not available in this session, so the Step 1 deterministic
checks cannot run: list them under "Not checked". No \`out:\` — return the full report as your message.

${fx(fixture)}`;

const CHECKOUT = prompt("checkout-service.diff", [
  "server/src/modules/checkout/domain/checkout.ts",
  "server/src/modules/checkout/service.ts",
]);
const REVIEWER_CORE = prompt("reviewer-core-gate.diff", ["reviewer-core/src/pipeline/run.ts"]);
const BENIGN = prompt("benign-refactor.diff", ["server/src/modules/blast/score.ts"]);

const REPORT_SHAPE =
  "starts with the status line `ARCHITECTURE REVIEW: <status>` and uses only the severities CRITICAL, WARNING or SUGGESTION (no high/medium/low, no PASS/FAIL verdict)";

export const cases: AgentCase[] = [
  {
    // One session covers what used to be two cases on the same diff (finding + no fabrication).
    name: "checkout diff: flags the fastify import as R2 and stays in its lane",
    kind: "quality",
    prompt: CHECKOUT,
    practices: [
      REPORT_SHAPE,
      "reports the `import type { FastifyReply } from \"fastify\"` added to server/src/modules/checkout/domain/checkout.ts as a finding citing rule R2 (`ring2-no-http`) — nothing under modules/<m>/ except routes.ts may import fastify",
      "quotes the offending code for each finding instead of only paraphrasing it",
      "addresses the `new PgCheckoutRepository()` line in service.ts either as a finding with a rule id from its fixed table or as a 'Dropped candidates' entry with a reason — it does not silently ignore it",
      "does not report naming, style, test coverage, security or a runtime bug as an architecture finding (the optional `reply?: FastifyReply` parameter is covered by the import finding, not a separate invented rule)",
    ],
    threshold: 0.8,
    maxTurns: 20,
  },
  {
    name: "reviewer-core diff: names the I/O import, leaves the removed grounding call to the correctness lane",
    kind: "quality",
    prompt: REVIEWER_CORE,
    practices: [
      REPORT_SHAPE,
      "identifies the `import { readFileSync } from \"node:fs\"` added to reviewer-core/src/pipeline/run.ts as breaking reviewer-core's ring-0 purity (no I/O) — as a finding, or under 'Not checked' / 'Dropped candidates' tied to the reviewer-core purity check it could not run; it does not ignore the import",
      "does not report the removed `groundFindings()` call as an architecture finding with a rule id — it is a correctness issue outside this agent's lane (mentioning it as out of scope is fine)",
    ],
    threshold: 1.0,
    maxTurns: 20,
  },
  {
    name: "benign rename: zero findings, no fabricated rule",
    kind: "quality",
    prompt: BENIGN,
    practices: [
      "reports zero findings (no CRITICAL, WARNING or SUGGESTION) for the local-variable rename in server/src/modules/blast/score.ts",
      "the status is CLEAN or INCOMPLETE (INCOMPLETE is correct here because the deterministic checks could not run) — not FINDINGS",
    ],
    threshold: 1.0,
    maxTurns: 15,
  },
];
