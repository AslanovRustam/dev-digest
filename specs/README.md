# Specs

A spec says what the system shall do for one feature and how to tell that it does. It is the input of
the `implementation-planner` agent.

**This folder holds only specs that touch two or more packages.** A feature inside one package gets its
spec in that package's folder:

| Feature touches | Folder |
|---|---|
| two or more packages | `specs/` (here) |
| only `server/` | [`server/specs/`](../server/specs/) |
| only `client/` | [`client/specs/`](../client/specs/) |
| only `reviewer-core/` | [`reviewer-core/specs/`](../reviewer-core/specs/) |
| only `mcp/` | `mcp/specs/` (created with its first spec) |
| e2e coverage only | [`e2e/docs/specs/`](../e2e/docs/specs/) — `e2e/specs/` holds the flow tests |

## Naming and format

- File `YYYY-MM-DD-<feature-slug>.md`, Spec ID `SPEC-YYYY-MM-DD-<feature-slug>`.
- English. The template, EARS rules, IDs, traceability and the self-check are in the
  [`spec-authoring`](../.claude/skills/spec-authoring/SKILL.md) skill.
- No implementation details: behaviour, states, workflow diagrams and shape-level contracts only. Files,
  functions, libraries and tables belong to the plan.
- `01-…` – `08-…` in this folder were written before this convention. They keep their names and their
  format.

## Status

| Status | Set by | Meaning |
|---|---|---|
| `draft` | `spec-creator` | written, not approved; it may still change |
| `approved` | the user | the source of truth for scope; nobody edits it in place |
| `implemented` | the user | the feature shipped |
| `superseded` | `spec-creator`, after the user agreed | replaced by the spec in `Superseded-by:` |

## Who touches specs

- **`spec-creator`** writes drafts, only in the folders above.
- **The user** approves them.
- **`implementation-planner`** reads a spec as read-only input; a conflict comes back as "Spec impact".
- **`plan-verifier`** traces the plan to the spec's `AC-n` / `NFR-n` IDs.
- **`implementer`** and **`doc-writer`** never edit specs.

To write a spec, ask the main session to run `spec-creator` with the brief and the design sources (text,
Figma links, screenshots, code paths). It comes back with blocking questions and proposals first, then
writes the draft.
