import { fileURLToPath } from "node:url";
import type { SkillCase } from "../../src/index.js";

// Two tiers of cases for this skill:
//
// 1. TOOL cases (`tools` + `cwd`) — the model works inside fixtures/repo the way a real session
//    does: the skill is loaded as Claude Code loads it (SKILL.md body + base directory, references
//    read on demand), it reads `dependency-facts.md` and checks claims in the code with
//    Read/Grep/Glob. Bash is never handed to an eval (bypassPermissions on a live checkout), so the
//    facts are the frozen output of the REAL collector — regenerate with fixtures/make-facts.mjs
//    after changing the fixture or the collector. The collector itself is covered by
//    `node --test .claude/skills/dependency-checker/scripts/collect.test.mjs`.
// 2. A CONTENT case (no tools) — inline data, the skill's text in isolation. Cheap, and the only
//    tier that also runs on EVAL_BACKEND=openrouter.
//
// Practices judge reasoning (ranking, scoping, verification), not the skill's own vocabulary,
// except where the prompt asks for the format. Nothing in the fixture's code comments hints at
// the findings.

const FIXTURE_REPO = fileURLToPath(new URL("./fixtures/repo", import.meta.url));
const READ_ONLY = ["Read", "Grep", "Glob"];

const NO_SHELL =
  "Shell commands are not available in this session. The dependency facts were already collected " +
  "for you into `dependency-facts.md` at the repository root (your working directory). Use Read, " +
  "Grep and Glob for anything you want to check in the code.";

const REPO_DATA = `Here is the data you'd normally gather yourself — treat it as already collected, and produce the report directly from it (do not ask for tool access or more data).

Package managers: server and client use pnpm (pnpm-lock.yaml); reviewer-core and e2e use npm (package-lock.json).

server/package.json dependencies: fastify@5.1.0, drizzle-orm@0.36.0, zod@3.23.8, pg@8.13.0, moment@2.30.1
server/package.json devDependencies: vitest@2.1.4, typescript@5.6.3, tsx@4.19.0
client/package.json dependencies: next@15.0.3, react@19.0.0, react-dom@19.0.0, @tanstack/react-query@5.59.0, zod@3.22.4, date-fns@4.1.0
client/package.json devDependencies: vitest@2.1.4, typescript@5.6.3, tailwindcss@3.4.14
reviewer-core/package.json dependencies: zod@3.23.8
reviewer-core/package.json devDependencies: typescript@5.6.3
e2e/package.json dependencies: (none runtime)
e2e/package.json devDependencies: playwright@1.48.2, typescript@5.6.3

Installed sizes (du -sh):
server/node_modules/moment: 4.2M
server/node_modules/drizzle-orm: 8.1M
server/node_modules/fastify: 6.5M
server/node_modules/pg: 3.8M
server/node_modules/zod: 2.1M
client/node_modules/next: 132M
client/node_modules/react-dom: 6.9M
client/node_modules/date-fns: 22M
client/node_modules/zod: 1.9M
reviewer-core/node_modules/zod: 2.1M
e2e/node_modules/playwright: 210M

zod is declared at two different versions across three packages: 3.23.8 in server and reviewer-core, 3.22.4 in client.

grep for imports crossing package boundaries:
- server/src/routes/reviews.ts imports types from "@shared/review-types" (alias to server/src/vendor/shared)
- server/src/services/review-service.ts imports "reviewer-core/src/pipeline.js" directly by relative path (not via the package's public entry point)
- client/src/lib/api-types.ts imports "@shared/review-types" (same alias as server)
- grep found no import of "moment" anywhere under server/src — only present in package.json`;

export const cases: SkillCase[] = [
  // --- tool tier --------------------------------------------------------------------------------
  {
    name: "full report from the collected facts, with verification and correct ranking",
    kind: "quality",
    tools: READ_ONLY,
    cwd: FIXTURE_REPO,
    prompt:
      "Run a dependency check on this repository and give me the full report: scope, a Mermaid " +
      "dependency graph, sizes, prioritized findings and a short summary.\n\n" + NO_SHELL,
    grounding: ["```mermaid", "flowchart"],
    practices: [
      "the report has these sections in this order: Scope, Dependency graph, Size breakdown, Findings & Priorities, Summary",
      "the Mermaid graph draws links between the repository's own packages (server, client, reviewer-core) differently from external npm packages, and marks server's relative import into reviewer-core as a problem edge",
      "sizes in the report match dependency-facts.md (for example next 132.0 MB in client and moment 4.2 MB in server) rather than rounded or re-estimated values",
      "server/src/services/review-service.ts importing ../../../reviewer-core/src/pipeline.js is ranked in the highest priority tier (P0 or equivalent)",
      "the relative import in reviewer-core/test/pipeline.test.ts is ranked lower than the one in server's production code, because it is in test code",
      "moment in server is reported as unused, and the report says the code was searched to confirm it (or marks the finding unverified)",
      "every removal or change is a proposal for the user to confirm, with a command in the package's own manager (pnpm for server and client, npm for reviewer-core, mcp and e2e) and without --workspace or --filter flags",
      "the report does not recommend migrating to a workspace or monorepo and does not call the repository a monorepo",
    ],
    threshold: 0.7,
    maxTurns: 24,
  },
  {
    name: "prioritizes a cleanup sprint: judgment over the raw candidate list",
    kind: "quality",
    tools: READ_ONLY,
    cwd: FIXTURE_REPO,
    prompt:
      "We have one sprint for dependency cleanup across these packages. What do we fix first and what " +
      "can wait?\n\n" + NO_SHELL,
    practices: [
      "findings carry explicit priority labels from one consistent scheme, highest priority first",
      "server's relative import of reviewer-core/src/pipeline.js is in the fix-first group",
      "the zod versions are called out as drift: client 3.22.4 versus 3.23.8 in server and reviewer-core, and the 4.x major in mcp",
      "the zod 4.x in mcp gets a lower priority than the drift between server, client and reviewer-core, with a reason based on mcp not sharing code with the other packages (no internal links / talks over HTTP)",
      "the two copies of the @shared types diverging (review-types.ts differs between client and server) are reported",
      "the unused devDependencies (typescript in e2e, tsx in reviewer-core) are ranked below the production-code issues (server's relative import into reviewer-core, the zod drift, the unused moment)",
      "no workspace or monorepo migration is recommended",
    ],
    threshold: 0.7,
    maxTurns: 24,
  },

  // --- content tier (no tools) ------------------------------------------------------------------
  {
    name: "content only: ranks, names files and proposes commands from inline data",
    kind: "quality",
    prompt: `We suspect some npm dependencies in server/ and client/ are unused or duplicated across packages with different versions. Check our dependencies and tell me what to prioritize fixing first.\n\n${REPO_DATA}`,
    practices: [
      "findings carry explicit priority labels from one consistent scheme (for example P0/P1/P2/Info), not an unranked list",
      "client's zod@3.22.4 versus zod@3.23.8 in server and reviewer-core is called out as version drift",
      "moment being declared in server/package.json but never imported anywhere under server/src is called out as an unused dependency",
      "server/src/services/review-service.ts importing reviewer-core/src/pipeline.js by relative path is ranked as a top-priority issue",
      "each recommendation names a specific package and file (e.g. server/package.json, moment, zod) rather than a generic suggestion",
      "removing moment is a proposal for the user to confirm, using server's own manager (pnpm) and no --workspace flag",
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
];
