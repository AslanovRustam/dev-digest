# Conventions Extractor + API Contract Reviewer

**Status:** implemented (lesson L02, part 2). This spec is the source of truth for scope.

## Context

A repo has house conventions no agent knows about — "async/await, never `.then()` chains", "route
handlers return `AppError` subclasses", "SQL only in a repository". Before this feature the only
way to teach an agent such a rule was to notice it by eye and hand-write a skill.

The **Conventions Extractor** samples a repo in code, asks a cheap model to propose candidate rules
**with evidence from real code**, checks that evidence in code, lets a person accept / reject / edit
each candidate, and merges the accepted ones into one or more Skills Lab skills that can be linked to
an agent. Pipeline:

```
SAMPLE (code) → PROPOSE (one LLM call) → VERIFY (code) → TRIAGE (human) → SKILL (+ agent link)
```

The second half ships an **API Contract Reviewer** with four skills and a control experiment: without
skills the agent misses a breaking change, with skills it reports it.

### What already existed (reused, not rebuilt)

| Piece | Where |
|---|---|
| `conventions` table (unused) | `server/src/db/schema/knowledge.ts` |
| `repoIntel.getConventionSamples(repoId, n)` — top-ranked source files, junk-filtered | `server/src/modules/repo-intel/service.ts` |
| `FEATURE_MODELS.conventions` + `resolveFeatureModel` | `vendor/shared/contracts/platform.ts`, `modules/settings/feature-models.ts` |
| `skills.source = 'extracted'`, `skills.evidence_files` | `server/src/db/schema/skills.ts` |
| Skill CRUD with v1 snapshot, agent links, prompt injection | spec 03 |
| `githubBlobUrl`, `BodyEditor`, `ProgressBar`, `MonoLink` | client |

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Sampling is **code only**: config files + `getConventionSamples(repoId, 12)` | deterministic, cheap, reproducible; the model cannot browse |
| D2 | The evidence gate is **code**, not a second model: no file or no snippet match ⇒ the candidate is dropped | "every candidate has real evidence" holds by construction, not by model honesty |
| D3 | Line numbers and the displayed snippet come **from the file**, the model's `evidence_line` is only a hint between duplicate matches | the UI never shows a paraphrase as code; a miscounted line is not fatal |
| D4 | Model-supplied paths are normalised; `..`, absolute paths and drive letters are rejected **before** reading | the git port reads `join(clonePath, path)` with no traversal guard |
| D5 | Triage is a three-state `status` (pending / accepted / rejected); a re-scan replaces only `pending` | a decision is never lost to a re-scan |
| D6 | A re-scan drops proposals already triaged — by normalised wording **and** by evidence location (category + file + start line) | an edited rule must not come back in its original wording |
| D7 | Rejected (and accepted) rules are sent to the model as "do not propose again" | rejections are labelled negatives; cheap quality win |
| D8 | The scan stores `proposed / dropped_ungrounded / dropped_duplicate` and shows them | 3 of 12 surviving reads as "the gate worked", not "broken" |
| D9 | Evidence links pin the **scan's commit sha**, not `default_branch` | `repos.default_branch` is never filled from GitHub, and line numbers drift on a branch |
| D10 | The skill is a server-built **draft** that is fully editable; saving re-checks that every id is `accepted` (422 otherwise) | rejected candidates can never reach a skill, whatever the client sends |
| D11 | Several skills = filter by category, create, repeat; a candidate merged into a skill is marked (`skill_id`) and excluded next time | no extra mode or UI; one skill per area falls out naturally |
| D12 | Default model: OpenRouter `deepseek/deepseek-v4-flash` (Settings → Feature Models can override) | the "cheap model" requirement; same key the agents already use |

## Data model

Migrations `0013`–`0017` (generated; the later ones came out of `/pr-self-review`).

- `convention_scans`: `id, workspace_id, repo_id, source_sha, sample_files jsonb, model, proposed,
  dropped_ungrounded, dropped_duplicate, cost_usd, created_at`; indexes on `(repo_id, created_at)`
  and `workspace_id`.
- `conventions`: + `scan_id` (**set null** — a scan is provenance, deleting one must not delete
  triaged or skill-merged conventions), `category` (typed from `CONVENTION_CATEGORIES`, pinned to
  `ConventionCategory` by a unit test), `evidence_start_line` / `evidence_end_line`, `status`,
  `skill_id` (set null), `created_at`, `updated_at`; − `accepted`. Evidence columns are NOT NULL;
  CHECKs on `status`, `category` and `1 ≤ start ≤ end`; indexes on `repo_id`, `scan_id`, `skill_id`.

## Contracts (both `shared` copies)

`ConventionCategory` · `ConventionStatus` · `ConventionCandidate` (+ `source_sha`, `skill_name`) ·
`ConventionScan` · `ConventionsList {scan, candidates}` · `ConventionPatch` · `ConventionBulkStatus`
· `ConventionSkillDraftRequest` / `ConventionSkillDraft` · `ConventionSkillCreate` /
`ConventionSkillCreated`.

## API — `server/src/modules/conventions/`

| Route | Does |
|---|---|
| `GET /repos/:id/conventions` | latest scan + every candidate of the repo |
| `POST /repos/:id/conventions/extract` | sample → LLM → gate → persist; rate-limited 6/min; 409 when not cloned / not indexed |
| `PATCH /repos/:id/conventions/:conventionId` | status, rule, category (evidence is not editable) |
| `POST /repos/:id/conventions/status` | bulk status ("Accept all" / "Deselect all") |
| `POST /repos/:id/conventions/skill/draft` | accepted ids → `{name, description, type, body, evidence_files}`; stores nothing |
| `POST /repos/:id/conventions/skill` | create the skill (`source: extracted`, `evidence_files`), mark candidates, optional `agent_ids` link |

Files: `routes` · `service` (orchestration) · `repository` (all SQL) · `helpers` (pure: LLM schema,
prompt messages, `locateSnippet`, `groundCandidates`, `buildSkillDraft`, DTOs) · `constants`. The
system prompt lives in `src/prompts/conventions.system.md`. Cross-module needs go through the
container: `container.featureModel()`, `container.skillsRepo`, `container.agentsRepo`.

## UI — `/repos/:repoId/conventions` (Skills Lab › Conventions, `g c`)

- Header "Conventions in **repo**", "Detected from N sample files · last scan 1h ago", the gate
  counters, **Re-scan**. Empty state with **Run extraction**; a separate empty state when the model
  proposed rules but none survived the gate.
- Toolbar: **Accept all** / **Deselect all**, "N of M accepted", **Create skill (n)**; status chips
  (Pending / Accepted / Rejected / All) and category chips.
- Card: italic rule, category, "in skill X" link, `path:start-end` → GitHub at the scan sha, copy
  button, verified snippet, confidence bar (≥ 85 % green, ≥ 65 % amber), Accept / Reject toggles
  (click again → pending), inline Edit of rule and category.
- **Create skill from conventions** modal: banner "Merged from N accepted conventions", Name,
  Description, Type, Enabled, optional **Attach to agent**, body editor with token count, footer
  "Saved as v1 · added to Skills Lab".

## API Contract Reviewer

- Agent prompt: `docs/agent-prompts/api-contract-reviewer.md` (role-level on purpose).
- Skills in `docs/skills/api-contract/`, each with a directive description and a Bad / Good example:
  `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`. Three are created
  in the editor; `deprecation-policy.md` is imported through **Import from file**.
- Control experiment: a PR that renames a response field and changes a route param, reviewed with
  all four skills unchecked, then checked. Runbook: `docs/skills/README.md`.

## Results (2026-10-01, `openrouter/deepseek/deepseek-v4-pro`, one run per cell)

Conventions Extractor on `AslanovRustam/dev-digest` (`deepseek-v4-flash`, ~$0.001 per scan):

| Scan | Sample | Proposed | Dropped (no evidence) | Kept |
|---|---|---|---|---|
| 1 — top-12 by rank | 12 files, all `client/src/app/agents/**` (flat `file_rank`) | 14 | 3 | 11 |
| 3 — diversified sample | 12 files over client / server / reviewer-core / e2e + 4 tsconfigs | 15 | 1 | 14 |

Triage: 6 accepted (one edited), 8 rejected → `dev-digest-conventions` (v1, `source: extracted`,
6 `evidence_files`) linked to General Reviewer; a review of PR #3 logged
`skill "dev-digest-conventions" v1 attached (~524 tokens)`.

API Contract Reviewer control experiment (demo PRs, closed unmerged):

| PR | Contract changes | Without skills | With the 4 skills |
|---|---|---|---|
| #4 | route `/repos/:id/pulls` → `/pull-requests`; DTO `full_name` → `fullName` | 2 CRITICAL — both caught | 2 CRITICAL, now citing the missing deprecation |
| #5 | new required `default_branch`; URL narrowed to GitHub; DELETE → 204 no body; `clone_path` nullable → optional | 2 CRITICAL + 1 WARNING; **`clone_path` explicitly dismissed** ("unlikely to cause issues") | 3 CRITICAL incl. **`clone_path` nullable → optional**; DELETE 204 raised to CRITICAL (that finding was then dropped by grounding — the model cited `route.ts` instead of `routes.ts`) |

Takeaway: the role-level prompt already catches blunt breaks (renamed route / field) on `v4-pro`; the
skills add the subtle ones a checklist names explicitly (nullability/optionality, removed response
body) and raise their severity. A single run per cell — the model is not deterministic at
`temperature: 0`.

## Out of scope

A file-selection LLM step (the mock's `ConventionFileSelection` name stays unused) · editing a
candidate's evidence · diffing a scan against the previous one · per-finding attribution to a skill.

## Roadmap — more findings, better findings

The gate is deliberately strict; quality work means feeding it more real signal, not loosening it.

**Better input**
1. **Diversity sampling** — today's top-12 by rank often come from one layer. Bucket by directory /
   file role (route, service, repository, component, test) and take the top-N per bucket.
2. **Include tests** — `getConventionSamples` drops them (right for review context, wrong here);
   testing conventions are among the most useful.
3. **Mine history** — review comments and repeated fix-up commits: a rule someone already asked
   for twice in review is the strongest candidate. DevDigest's own accepted findings are a second
   source.
4. **Ranked file selection** — let the model pick 12 files from a code-built list of 100 paths (it
   ranks, never browses).

**Better verification**
5. **Frequency as confidence** — after extraction, search the pattern across the repo (the
   `CodeIndex` ripgrep adapter is wired): "found in 42 files" instead of the model's self-reported
   confidence. Highest-leverage upgrade.
6. **Counter-examples** — "38 files follow it, 3 violate it": grades the rule and hands the user a
   cleanup task.
7. **Contradiction check** — warn when a new rule contradicts a skill already in the Skills Lab.

**Better loop**
8. **Close the loop through review outcomes** — a convention whose findings keep being dismissed is
   a bad rule; retire or rewrite it (the eval dashboard has the shape for this).
9. **Scheduled re-scans** on merge to the default branch, with a drift view against the last scan.
10. **Skill sync** — when a merged candidate is edited or rejected later, offer to update the skill
    it lives in (new version) instead of leaving them out of sync.

## Acceptance

- [ ] A PR is open with a description of what was built.
- [ ] The extractor produces candidates in the UI.
- [ ] One or several skills can be created from accepted candidates; rejected ones never land in a skill.
- [ ] Every candidate carries real-code evidence; clicking it opens the file and lines on GitHub.
- [ ] A generated skill can be linked to an agent and shows up in a review run's trace.
- [ ] The API Contract Reviewer with skills catches a breaking change that it misses without them.
