---
name: spec-authoring
description: Use when writing, revising or checking a feature specification for Spec Driven Development in this repo (specs/, server/specs/, client/specs/, reviewer-core/specs/, mcp/specs/, e2e/docs/specs/) — EARS acceptance criteria, edge cases, non-functional requirements, untrusted inputs, traceability; or when judging whether a spec requirement is testable before planning it.
---

# Spec authoring

## Overview

A spec says **what** the system shall do for one feature and **how to tell** that it does — never how it
is built. `implementation-planner` plans from it, `plan-verifier` traces the plan back to its IDs. Every
requirement is observable from outside: a UI state, an API response, a tool result, a number.

Checklists for the analysis (design gaps and UI states, module interaction, untrusted inputs, NFR
categories): [references/checklists.md](references/checklists.md). Read it when drafting or reviewing.

## Where a spec lives

| Feature touches | Folder |
|---|---|
| one package | `server/specs/`, `client/specs/`, `reviewer-core/specs/`, `mcp/specs/` |
| e2e coverage only | `e2e/docs/specs/` — `e2e/specs/` holds flow tests, never specs |
| two or more packages | root `specs/` (cross-package specs only) |

- File: `YYYY-MM-DD-<feature-slug>.md` — the date the draft was started, a kebab-case slug of 2–5 words.
- Spec ID: `SPEC-YYYY-MM-DD-<feature-slug>`, the file name without `.md`.
- Language: English.
- Legacy `specs/01-…` – `specs/08-…` keep their names and their older format.

## Status lifecycle

`draft` → `approved` → `implemented`; any of them → `superseded`.
- Only the user moves a spec past `draft`.
- A spec past `draft` is never rewritten. A changed decision is a new spec with `Supersedes: <path>`;
  the old one gets `Status: superseded` plus a `Superseded-by: <path>` line, and nothing else.

## Template

```markdown
# Spec: <feature name>

Spec ID: SPEC-YYYY-MM-DD-<feature-slug>
Status: draft
Supersedes: <path> | none
Modules: <server, client, reviewer-core, mcp, e2e — the ones it touches>

## Problem and user
<Who hits the problem, in which moment, and what it costs them today. 3–6 lines, facts tagged.>

## Goals / Non-goals
- **G-1** <outcome the user gets>
- **NG-1** <what this spec deliberately does not do>

## User stories
- **US-1** As a <role>, I want <capability>, so that <benefit>.

## Workflow and module interaction
<Only when two or more modules talk, or the flow has three or more steps. One Mermaid diagram
(flowchart or sequenceDiagram) of the behaviour and of which module talks to which, then contracts
at shape level.>

| Contract | From → to | Fields (required unless marked optional) | Errors |
|---|---|---|---|

## Acceptance criteria (EARS)
- **AC-1** [must] WHEN <trigger>, the <system> shall <response>.

## Edge cases
- **EC-1** <situation> → AC-n | NG-n

## Non-functional requirements
- **NFR-1** [must] <EARS sentence with a number and a unit>

## Inputs and provenance
| Source | What was taken from it |
|---|---|
| [user] brief, YYYY-MM-DD | … |

## Untrusted inputs
| Source | Reaches | Requirement |
|---|---|---|
| <external data> | <where it goes> | AC-n |

## Decisions
- **D-1** YYYY-MM-DD — <question> → <answer> [user]

## Open questions
- **OQ-1** <question> — default if unanswered: <X>; affects: <AC-n | nothing yet>

## Traceability
| Req | Covers | Edge cases | Verify |
|---|---|---|---|
| AC-1 | US-1, G-1 | EC-1 | <observable check> |
```

## What a spec may contain

| May | May not |
|---|---|
| behaviour, states, limits, user-visible texts the user pinned | file paths, function / component / hook names, libraries |
| one Mermaid diagram of the workflow and of which modules talk | table or column names, SQL, Zod or any other code |
| contracts at shape level: fields, types in words, required / optional, status values, error cases | phases, steps, a task list — that is the plan |
| `path:line` evidence of what exists, in `Inputs and provenance` only | |

## EARS — one testable reaction per criterion

| Pattern | Form | Use for |
|---|---|---|
| Ubiquitous | The <system> shall <response>. | rules that always hold |
| Event-driven | WHEN <trigger>, the <system> shall <response>. | user actions, incoming events |
| State-driven | WHILE <state>, the <system> shall <response>. | behaviour during a state (loading, indexing) |
| Unwanted behaviour | IF <unwanted condition>, THEN the <system> shall <response>. | errors, limits, bad or untrusted input |
| Optional feature | WHERE <feature is enabled>, the <system> shall <response>. | flags, settings |

- Keywords in capitals, exactly one `shall` per criterion. WHILE and WHEN may combine, one of each at most.
- `<system>` is a part the user can name — "the PR page", "the API", "the MCP tool `get_blast_radius`",
  "the review engine" — never a file or a function.
- `[must]` blocks the feature; `[should]` may ship later. The planner cuts phases by it.

| Not testable | Testable |
|---|---|
| The page should load fast. | NFR: WHEN the user opens the PR list, the PR list shall show the first 50 rows within 1 s on the seeded dataset. |
| Handle API errors gracefully. | IF the API answers 5xx, THEN the PR page shall show the error banner with a Retry button and keep the data already shown. |
| The system shall validate and save the form. | Two criteria: one for the validation message, one for the saved result. |
| The page shall call the blast hook on mount. | WHEN the user opens the Overview tab, the PR page shall show the Blast radius card. |
| Users can filter findings. | WHEN the user selects a severity chip, the findings list shall show only findings of that severity. |

Words that need a number or a concrete reaction: fast, quick, responsive, user-friendly, intuitive,
robust, gracefully, seamless, appropriate, as needed, support, handle, and/or.

## IDs and traceability

- IDs: `G-n`, `NG-n`, `US-n`, `AC-n`, `EC-n`, `NFR-n`, `D-n`, `OQ-n`. Never renumber; a dropped item
  keeps its ID as `~~AC-4~~ dropped (D-2)`.
- Every `G-n` and `US-n` is covered by at least one `AC-n`.
- Every `EC-n` points to an `AC-n` (usually IF…THEN) or to an `NG-n` — none is left hanging.
- Every `NFR-n` is an EARS sentence with a number and a unit.
- `Traceability` has one row per `AC-n` and `NFR-n`. **Verify** is an observable check: a UI action and
  the expected result, a request and the expected response or status, "e2e flow", or "inspection: …".
  Never a test file or function name — choosing the test is the planner's job.

## Provenance tags

Every fact in the spec carries its source: `[user]`, `[figma:<fileKey>/<node-id>]`,
`[screenshot:<path>]`, `[code:<path:line>]`, `[research:R-n]`, `[assumption]`. Every `[assumption]`
also appears in `Open questions` (with its default) or in `Decisions`.

## Self-check — run on the written file before handing it over

1. Every AC has exactly one EARS pattern, one `shall` and one observable reaction; no word from the list
   above without a number.
2. Every G and US is covered by an AC; every EC points to an AC or an NG; every AC and NFR has a
   Traceability row with a Verify.
3. File paths, function names, libraries and tables appear only in `Inputs and provenance`.
4. Every fact is tagged; every `[assumption]` is in Open questions or Decisions.
5. A UI feature closes its state matrix: loading, empty, error, degraded, data, no access.
6. Every external data source has a row in `Untrusted inputs` that points to an IF…THEN criterion.
7. Changed contracts are shown in `Workflow and module interaction`: both `shared` copies,
   `mcp/src/contracts.ts`, UI texts that e2e flows match.
8. Right folder, `YYYY-MM-DD-<slug>.md` name, `Status: draft`, size ≤ 20 KB.

## Common mistakes

- Writing the plan inside the spec: files, steps, "add a hook".
- One criterion per screen element instead of one per behaviour.
- Edge cases listed but never turned into a criterion or a non-goal.
- `Untrusted inputs` as "validate input" instead of naming the source and the reaction.
- An assumption buried in prose instead of tagged and listed.
- Editing an approved spec in place instead of superseding it.
