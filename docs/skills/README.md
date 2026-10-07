# Review skills

The skill texts for the two reviewer agents added in L02, plus the runbook for the control
experiment. Scope and business rules: [`specs/03-skills.md`](../../specs/03-skills.md).

| Folder | Agent | Skills |
|---|---|---|
| [`test-quality/`](./test-quality/) | Test Quality Reviewer — [prompt](../agent-prompts/test-quality-reviewer.md) | `untested-branches`, `corner-cases`, `over-mocking`, `flaky-tests/` (import demo) |
| [`api-contract/`](./api-contract/) | API Contract Reviewer — [prompt](../agent-prompts/api-contract-reviewer.md) | `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy` (import demo) |

These files are the reviewable originals. Nothing is seeded: the skills and agents are created by
hand in the UI, and the DB is the source of truth at run time. When you change a skill, edit the
file here **and** save it in the UI (each content save is a new version).

## What a skill is

A skill is a reusable block of review instructions — name, description, type, markdown body — that
any number of agents can link. **It is prompt text only.** It cannot call tools, run code or read
files.

When an agent runs, each of its active skills becomes one block in the `## Skills / rules` section
of the task message:

```
### Skill: <name>
_<description>_
<body>
```

- **Two switches, both must be on.** The global toggle on the skill card (`/skills`) is a kill
  switch for every agent; the checkbox in an agent's **Skills** tab is the per-agent switch. A
  globally disabled skill is dimmed there and marked *disabled globally* — it never reaches a
  prompt, whatever the checkbox says.
- **Order is per agent** and is the order of the blocks in the prompt. Drag rows in the agent's
  Skills tab (dragging is off while the filter is active).
- **No active skills → no section.** The prompt is byte-identical to a run without skills.

The agent's system prompt states only the role. The concrete checks live in the skills — that
split is what makes the control experiment below show a difference.

## File format

```markdown
---
name: untested-branches
description: Use when <situation>. Flag <what the agent must report>.
type: rubric          # rubric | convention | security | custom
---

<body: concrete, actionable checks, severity guidance, "cite file:line from the diff">
```

- **`description` is the skill's interface.** Write it as a directive — when it applies and what
  to flag — because the model reads it first, right under the skill's name.
- **Body:** checks the model can act on, a severity section that uses the agent rubric
  (`CRITICAL` / `WARNING` / `SUGGESTION`, no inflation), and an instruction to cite `file:line`
  from the diff (ungrounded findings are dropped). Aim for ~150–400 tokens: every enabled skill
  is paid for on every run, and the trace shows the cost per block.
- Do not open the body with a `#` heading — the block already has `### Skill: <name>`.
- Missing `type` or an unknown one becomes `custom`; a missing `name` falls back to the first
  heading, then the file or folder name.

## Create a skill in the UI

1. `/skills` → **Add Skill** → **Create skill**.
2. Fill **Name**, **Description**, **Type**, and paste the body — everything **below** the closing
   `---` of the frontmatter — into **Skill body**. The editor shows the token count.
3. **Save skill.** Create writes v1; every later content save bumps the version (the **What
   changed?** note is optional; an empty one gets an automatic note). Toggling *enabled* does not
   bump. **Versions** shows the history with **Diff** and **Restore**.

Create this way: `untested-branches`, `corner-cases`, `over-mocking`, and `breaking-change`,
`response-schema`, `semver-discipline` from `api-contract/`. `deprecation-policy.md` goes through
**Import from file** instead (a single `.md` is enough — no zip needed), so the API Contract Reviewer
also has a skill that came in through the import path.

## Import a skill from a file

`flaky-tests/` is shaped like a skill from somewhere else: a `SKILL.md`, an extra markdown file
(`reference.md`), a script (`scripts/detect-flaky.sh`, harmless — it only `echo`es), and an
`allowed-tools` frontmatter key that a coding agent would treat as a tool grant.

1. Zip the folder (from the repo root):

   ```powershell
   # PowerShell
   Compress-Archive -Path docs/skills/test-quality/flaky-tests -DestinationPath flaky-tests.zip
   ```

   ```bash
   # bash (macOS / Linux — Git Bash on Windows has no `zip`; use PowerShell there)
   cd docs/skills/test-quality && zip -r ../../../flaky-tests.zip flaky-tests
   ```

   Do not commit the zip. A single `.md` file imports too.

2. `/skills` → **Add Skill** → **Import from file** → pick `flaky-tests.zip` (`.md` or `.zip`,
   ≤ 512 KB). The server parses it in memory and returns a preview. **Nothing is stored yet.**
3. The preview shows:
   - the trust banner — *"An imported skill is someone else's instructions inside your agent's
     prompt. Read it before enabling."*;
   - the parsed **name / description / type** (editable) and the rendered body from `SKILL.md`;
   - **Parser warnings** — here: `allowed-tools` was ignored, because a skill is prompt text only;
   - **Not imported** — `flaky-tests/reference.md` as *extra markdown — not imported* and
     `flaky-tests/scripts/detect-flaky.sh` as *executable — not run*.
4. **Save as disabled.** The skill is created with source *Imported*, `enabled = false`, and
   opens. Read the body, then turn it on with the card's toggle.

**Why the ceremony.** An imported skill is foreign text that lands inside your agent's prompt,
next to the diff. A malicious or careless skill can tell the reviewer to ignore a class of bugs,
approve everything, or leak what it sees into its output. The importer never executes anything —
scripts are listed and dropped, capability keys are ignored, only markdown is decoded, nothing is
written to disk — but it cannot judge the *instructions*. That is your job before you enable it.

## Set up the two agents

For each agent:

1. `/agents` → **Add Agent** → **Create from scratch**. Name, description, provider and model are
   in the setup note at the top of the prompt file; paste the prompt from `# Role` to the end.
   - [`test-quality-reviewer.md`](../agent-prompts/test-quality-reviewer.md)
   - [`api-contract-reviewer.md`](../agent-prompts/api-contract-reviewer.md)
2. Open the agent's **Skills** tab. Check its skills and drag them into this order:

   | Test Quality Reviewer | API Contract Reviewer |
   |---|---|
   | 1. `untested-branches` | 1. `breaking-change` |
   | 2. `corner-cases` | 2. `response-schema` |
   | 3. `over-mocking` | 3. `deprecation-policy` |
   | 4. `flaky-tests` | 4. `semver-discipline` |

   The most important check goes first. Each check or drop saves immediately; the badge shows
   `N of M enabled`, and the agent card shows `N skills` — the count that reaches the prompt.
3. Make sure `flaky-tests` and `deprecation-policy` are enabled globally once you have read them
   (imports are saved disabled).

## Control experiment

Goal: show that the skills, not the role prompt, make the agent catch the problem. Run it on PRs
already imported into DevDigest.

| Agent | Pick a PR that… | Without skills | With skills |
|---|---|---|---|
| Test Quality Reviewer | adds or changes a test that covers **only the happy path** of code with an error branch or a boundary | misses it | flags the uncovered branch and the boundary case |
| API Contract Reviewer | changes a route's **signature** (path, method, param or a required body field) without versioning | misses it | reports the breaking change |

For each agent:

1. **Skills off.** In the agent's **Skills** tab, uncheck every skill (the order is kept). The
   badge reads `0 of M enabled`.
2. Open the PR → **Run Review** → pick this agent from the dropdown. Wait for it to complete.
3. Open the run (**View trace**). Expected:
   - **Live log** has no `skill "…"` line;
   - **Prompt assembly** has no skill blocks;
   - the findings miss the issue (or report it only vaguely).
4. **Skills on.** Re-check the skills in the same order.
5. **Run Review** → the same agent again, same model.
6. Open the new run. Expected:
   - **Live log** has one line per active skill, in order:
     `skill "untested-branches" v1 attached (~390 tokens)` — only for skills that are enabled
     both globally and for this agent;
   - **Prompt assembly** shows one block per skill, labelled
     `Skill · <name> · v<N> · ~T tokens`, in the agent's order;
   - the findings now name the issue with a `file:line` from the diff.
7. Optional: disable one skill **globally** on `/skills` and run again — its Live log line and
   block disappear, the others stay.

Record the result (PR, run ids, findings before/after, tokens added) — it is acceptance item 5.

If "without skills" already catches the issue, pick a subtler PR or check that the agent's system
prompt was pasted unchanged; the prompts are deliberately role-level so the skills carry the
checklist.

## Acceptance checklist

From [`specs/03-skills.md`](../../specs/03-skills.md) § Acceptance:

- [ ] A skill is created and edited in the UI; each content save adds a version with its note;
      **Diff** and **Restore** work.
- [ ] Both agents exist and have their skills linked; at least one skill (`flaky-tests`) came in
      through import.
- [ ] The import went through the preview; `scripts/detect-flaky.sh` was listed as *not
      processed* and never ran; the skill was saved disabled.
- [ ] An enabled skill shows up in the run's Live log and trace as its own block with tokens; a
      skill disabled per agent or globally does not.
- [ ] The control experiment reproduces on both agents.
- [ ] `/pr-self-review` was run by hand and routed files to both frontend and backend skills.
