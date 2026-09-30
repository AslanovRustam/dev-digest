# Skills

**Status:** in progress (lesson L02). This spec is the source of truth for scope.

## Context

L02 on the README roadmap is "Skills in the product". A **skill** is a reusable, text-only block of
review instructions — name, description, type, markdown body — that any number of agents can link.
When an agent runs, its enabled skills are injected into the prompt as separate blocks, in the
order the agent defines, and the run trace shows each block with its token cost.

Most of the foundation already exists but nothing is wired:

- Tables `skills`, `skill_versions`, `agent_skills(agent_id, skill_id, order)` (migration 0000).
- Contracts `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` in both `shared` copies.
- `GET/POST /agents/:id/skills` and the `linkedSkills / setSkills` repository methods.
- `assemblePrompt` renders a `## Skills / rules` section from `ReviewInput.skills` (reviewer-core).
- The trace drawer renders `prompt_assembly.skills`.

The gap: there is no skills module or page, and `run-executor.ts` never passes `skills` to the
engine, so no skill ever reaches a prompt.

**A skill is prompt text only.** It cannot call tools, run code, or read files. An imported skill
is somebody else's instructions inside our agent's prompt — the product treats it as untrusted
until a person reads and enables it.

## Scope

### Skills page — `/skills` (Skills Lab › Skills)

Master/detail, the same shell as `/agents/[id]`.

**Left column — skill list**

- "Skills" title, "Add Skill" dropdown (**Create skill** · **Import from file**), search by
  name/description.
- One card per skill:
  - icon tile tinted by type, name (mono), enabled `Toggle` (global kill switch);
  - one-line description;
  - type badge (rubric = blue, convention = green, security = red, custom = grey) + source label
    with icon (Manual · Imported · Extracted · Community);
  - footer `N agents · X% pull · Y% accept` (accept tinted by value; `—` when there is no data).
  - A disabled skill's card is dimmed. The selected card is highlighted.

**Right pane — skill detail**, `/skills/[id]?tab=config|preview|stats|versions`

Header: type icon, name (mono), type badge, `v{N}` badge. There is **no** Evals tab and **no**
"Run on evals" button — those belong to L06 and are added by that lesson.

| Tab | Shows |
|---|---|
| **Config** | "Configuration" + `v{N}`, Enabled toggle. Fields: **Name\***, **Description** (hint: *"The description is the skill's interface — write it as a directive: when it applies and what the agent must do."*), **Type** (select), **Skill body\*** — a code-editor panel: file header `<name>.md`, an `unsaved` badge while dirty, `N tokens` on the right, line-numbered monospace text. Footer: optional **What changed?** note, Save, Cancel. |
| **Preview** | "Rendered as the reviewing agent receives it." — the body rendered as markdown. |
| **Stats** | Four tiles: **Used by** (N agents), **Pull frequency** (%), **Accept rate** (% + ring), **Findings (30d)**. Panels: **Agents using this skill** (name, per-agent on/off state, **Open** → `/agents/:id?tab=skills`) and **Findings by category** (donut, counts). Caption: *"Correlated, not causal: findings from runs whose prompt included this skill."* |
| **Versions** | "Version history" + count badge. Caption: *"Every save snapshots the body so eval runs stay reproducible against the exact text they scored."* One row per version, newest first: `vN` badge, change note, date; the current one shows **Current**, older ones show **Diff** (line diff against the current body, expands inline) and **Restore**. |

**Create** (`/skills/new`): the Config tab, blank, type = `custom`. Save → `/skills/[id]`.

**Import** (modal from "Import from file"):

1. Pick a `.md` or `.zip` file (≤ 512 KB).
2. The server parses it and returns a preview. **Nothing is stored yet.**
3. The modal shows a trust banner — *"An imported skill is someone else's instructions inside
   your agent's prompt. Read it before enabling."* — the parsed name / description / type
   (editable), the rendered body, the parser's warnings, and every other archive file with the
   reason it was not processed (*executable — not run*, *non-markdown*, *extra markdown*).
4. **Save as disabled** creates the skill with `source = imported_file`, `enabled = false`, and
   opens it. The user enables it after reading it.

### Agent editor — Skills tab (`/agents/[id]?tab=skills`)

Matches the agents design:

- "Skills" + `N of M enabled` badge, filter input, hint *"Order matters — earlier skills appear
  earlier in the assembled prompt. Drag to reorder."*
- One row per **workspace skill**: drag handle, checkbox, name (mono), type badge. Linked skills
  come first in their stored order, then unlinked skills by name.
- The checkbox is the **per-agent** switch (`agent_skills.enabled`). Unchecking keeps the row's
  position; checking an unlinked skill links it.
- A skill that is disabled globally is dimmed and marked *disabled globally*; it never reaches a
  prompt whatever the checkbox says.
- Every check or drop saves the whole ordered list immediately. Drag is disabled while the filter
  is active.
- The agent cards show `N skills` (the count that would reach the prompt).

### Review run and trace

- A skill reaches an agent's prompt iff `agent_skills.enabled AND skills.enabled`, in `order`.
- Each skill becomes one block:

  ```
  ### Skill: <name>
  _<description>_
  <body>
  ```

- Live Log gets one line per injected skill — `skill "<name>" v<N> attached (~T tokens)`.
  Disabled skills produce no line and no block.
- The trace's `prompt_assembly.skill_blocks` lists each injected block
  (`skill_id, name, type, version, tokens, text`). The trace drawer renders one `PromptBlock` per
  skill labelled `Skill · <name> · v<N> · ~T tokens`; older traces fall back to the joined
  `skills` string.
- No enabled skills → the `skills` slot is omitted and the prompt is byte-identical to before.

### New agents (created through the UI, not seeded)

The prompt and skill texts live in the repo; the agents and skills are created by hand in the UI,
and at least one skill goes through the import flow.

| Agent | Finds | Skills (`docs/skills/…`) |
|---|---|---|
| **Test Quality Reviewer** | untested branches, missed corner cases, over-mocking, flaky tests | `untested-branches`, `corner-cases`, `over-mocking`, `flaky-tests` (a folder with `SKILL.md` + `scripts/` — the import demo) |
| **API Contract Reviewer** | breaking changes in route signatures, response shapes, status/error contracts | `route-signature-breaking-change`, `response-shape-compat`, `status-and-error-contract` |

Their system prompts (`docs/agent-prompts/*.md`) state the role only. The concrete checks live in
the skills, which is what makes the control experiment show a difference.

### Control experiment (on existing PRs)

| Agent | PR | Without skills | With skills |
|---|---|---|---|
| Test Quality Reviewer | adds a test that covers only the happy path | misses it | flags the uncovered branch and the boundary case |
| API Contract Reviewer | changes a route's signature | misses it | reports the breaking change |

Toggle the agent's skills off → Run → on → Run → open the trace → the prompt-assembly section shows
the skill blocks and the tokens they added. The steps are in `docs/skills/README.md`.

### `pr-self-review`

The skill exists with auto-invocation off (`disable-model-invocation: true`) and is run by hand
(`/pr-self-review`). On this branch it must route files to both frontend skills
(`frontend-ui-architecture`, `next-best-practices`, `react-best-practices`) and backend skills
(`onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`).

**Business decisions**

- **Two switches.** `skills.enabled` is global (the list toggle); `agent_skills.enabled` is per
  agent (the checkbox). Both must be on.
- **Order is per agent** and is the order of blocks in the prompt.
- **Versioning.** Create writes v1. A content change (name / description / type / body) bumps the
  version and snapshots it with its change note (empty note → an automatic one:
  *"Initial version"*, *"Edited body, description"*). Toggling `enabled` does not bump.
  **Restore vK** writes a new version with vK's content and the note *"Restored vK"* — history
  is never rewritten.
- **Stats are correlational.** The window is 30 days.
  - *Used by*: agents that link the skill, in any per-agent state.
  - *Pull frequency*: of the completed runs of those agents in the window, the share whose trace
    contains this skill in `skill_blocks`.
  - *Findings (30d)* and *by category*: findings of the reviews produced by those pulled runs.
  - *Accept rate*: `accepted / (accepted + dismissed)` over the same findings; `null` → `—`.
- **Import never executes.** The zip is read in memory. Only markdown is decoded. Nothing is
  written to disk. Frontmatter keys that grant capabilities (`allowed-tools`, `hooks`, …) are
  dropped with a warning. Limits: 512 KB file, 200 entries, 256 KB per entry, 2 MB unpacked.

**Not in scope:** the Evals tab and "Run on evals" (L06); import from URL or community; agent-card
runs/accept stats; the agent system-prompt token counter; seeding the new agents or skills.

## Approach

### Contracts (both `shared` copies)

- `knowledge.ts`:
  - `SkillSource` += `imported_file`.
  - `Skill` += `agent_count`, `pull_rate`, `accept_rate` (nullish, list/get only).
  - `SkillCreate`, `SkillUpdate` (+ optional `note`), `SkillVersion` (`version, note, name,
    description, type, body, created_at`), `SkillStats`, `SkillImportRequest`,
    `SkillImportPreview`.
  - `AgentSkillLink` += `enabled`; `AgentSkillsSet { items: {skill_id, enabled}[] }`.
  - `Agent` += `skill_count`.
- `trace.ts`: `SkillBlock`, `PromptAssembly.skill_blocks`.

### Schema (`pnpm db:generate`)

- `agent_skills.enabled boolean not null default true`.
- `skill_versions` += `note text not null default ''`, `name`, `description`, `type` (nullable —
  rows from before this change have none).
- `skills.source` enum += `imported_file` (a TS-only enum; no SQL change).

### Server

- `adapters/archive/`: `NodeZipReader`, a read-only in-memory zip reader on `node:zlib`. It
  enforces the limits before and during inflation. It is exposed as `container.archive` with a
  `ContainerOverrides` seam. No new dependency.
- `modules/skills/` (routes · service · repository · helpers · constants):

  | Method | Path | |
  |---|---|---|
  | GET | `/skills` | list + `agent_count` / `pull_rate` / `accept_rate` |
  | GET | `/skills/:id` | one skill |
  | POST | `/skills` | create (writes v1) |
  | PUT | `/skills/:id` | update (bumps version on a content change) |
  | DELETE | `/skills/:id` | delete (links cascade) |
  | GET | `/skills/:id/versions` | history, newest first |
  | POST | `/skills/:id/versions/:version/restore` | restore as a new version |
  | GET | `/skills/:id/stats` | `SkillStats` |
  | POST | `/skills/import/preview` | parse only, stores nothing (rate-limited) |

  `helpers.ts` holds `toSkillDto`, `isSkillContentChange`, `autoVersionNote`,
  `formatSkillBlock`, `parseSkillMarkdown`, `findSkillEntry`, `classifyIgnoredFile`.
- `modules/agents/`:
  - `PUT /agents/:id/skills` replaces the ordered set in one transaction and rejects skill ids
    from another workspace. The old `POST` stays compatible.
  - `GET /agents/:id/skills` returns `enabled`. The list returns `skill_count`.
  - The repository gets `enabledSkillsForAgent`.
- `modules/reviews/run-executor.ts`:
  - Loads the enabled skills through `container.agentsRepo` and formats the blocks.
  - Counts tokens with `container.tokenizer` and logs one line per skill.
  - Passes `skills` only when non-empty.
  - Writes `skill_blocks` into the trace. reviewer-core is unchanged.

### Client

- `lib/hooks/skills.ts`: list / get / create / update / delete / versions / restore / stats /
  import-preview, plus `useAgentSkills` and `useSetAgentSkills` (optimistic).
- `components/skill-type-badge/`: used by both `/skills` and the agent Skills tab.
- `app/skills/`:
  - `page.tsx` (list plus an empty state), `[id]/page.tsx`, `new/page.tsx`;
  - `_components/`: `SkillsList`, `SkillCard`, `SkillDetail` (header + tabs), `ConfigTab`
    (`BodyEditor`), `PreviewTab`, `StatsTab`, `VersionsTab` (`VersionDiff`), `ImportSkillModal`.
- `app/agents/[id]/…/AgentEditor/_components/SkillsTab/`, with native HTML5 drag-and-drop (no new
  dependency).
- Nav: a "Skills Lab" group with Skills and Agents (`vendor/ui/nav.ts`); a `GripVertical` icon.
- The trace drawer renders per-skill `PromptBlock`s.
- i18n: `messages/en/skills.json` and `agents.json`.

## Acceptance

1. A skill is created and edited in the UI. Each content save adds a version with its note. Diff
   and Restore work.
2. Both new agents exist and have skills linked; at least one skill came in through import.
3. The import went through the preview; the archive's script was listed as *not processed* and
   never ran; the skill was saved disabled.
4. An enabled skill shows up in the run's Live Log and trace as its own block with tokens; a
   disabled one (per agent or globally) does not.
5. The control experiment reproduces on both agents.
6. `/pr-self-review` is run by hand and routes to both frontend and backend skills.
