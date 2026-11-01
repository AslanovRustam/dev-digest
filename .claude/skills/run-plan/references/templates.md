# /run-plan templates

Fill the `<slots>`; keep the rest verbatim. Paths are repo-relative; `P` = `.devdigest/plans/<slug>`.

## State — `P.impl.json`

```json
{
  "plan": ".devdigest/plans/<slug>.md",
  "spec": "<path> | null",
  "brief": "<text or path> | null",
  "designs": [".devdigest/plans/<slug>.design/<node>.png"],
  "mode": "multi-agent | single-agent",
  "verifier_model": "sonnet | opus",
  "rounds_max": 3,
  "stage": "preflight | phases | verify | review | fix | live | docs | done",
  "phases": { "P1": "done", "P2": "pending" },
  "round": 1,
  "verify_fixes": 0,
  "updated_at": "<ISO time>"
}
```

## implementer

```
plan: .devdigest/plans/<slug>.md
phase: <P2 | F1 | V1 | B1>
out: .devdigest/plans/<slug>.<phase>.report.md
notes: <the brief's HOW constraints | for a re-run: "S1–S3 are done (see <report>); do S4 with the user's decision: …" | none>
design: <PNG paths for the screens of this phase | none>
previous report: <path, only when this phase depends on it | none>
```

## plan-verifier — round 1

```
plan: .devdigest/plans/<slug>.md
spec: <path | none>
base: origin/main
diff-index: .devdigest/plans/<slug>.diff-index.md
verify: .devdigest/plans/<slug>.verify.json
brief (verbatim user requirements, one U-n row each): <text | none>
out: .devdigest/plans/<slug>.r1.verifier.md
```

Pass `model: "opus"` on the Agent call only with `verifier:opus`.

## plan-verifier — delta (round k > 1)

```
plan: .devdigest/plans/<slug>.md
spec: <path | none>
base: origin/main
diff-index: .devdigest/plans/<slug>.diff-index.md   (regenerate it first)
verify: .devdigest/plans/<slug>.verify.json
rows: <ledger rows still open, e.g. S4-R2, AC-3> + all rows of steps F<k-1>.*
previous: .devdigest/plans/<slug>.r<k-1>.verifier.md
out: .devdigest/plans/<slug>.r<k>.verifier.md
```

## architecture-reviewer — round 1

```
base: origin/main
diff-index: .devdigest/plans/<slug>.diff-index.md
plan: .devdigest/plans/<slug>.md
out: .devdigest/plans/<slug>.r1.arch.md
```

## architecture-reviewer — delta (round k > 1)

```
base: origin/main
scope:
<one path per line — `node scripts/tree-snapshot.mjs changed P.r<k-1>.snap.json --paths`>
previous: .devdigest/plans/<slug>.r<k-1>.arch.md
out: .devdigest/plans/<slug>.r<k>.arch.md
```

## doc-writer

```
plan: .devdigest/plans/<slug>.md
spec: <path | none>
verifier report: .devdigest/plans/<slug>.r<last>.verifier.md
Return only the status line and the list of pages written or changed.
```

## Ledger — `P.review.md`

```markdown
# Review ledger — <slug>

| id | round | source | ref | severity | where | finding (≤15 words) | decision | status |
|---|---|---|---|---|---|---|---|---|
| R-1 | 1 | arch | A1 · ON-PURE-LOGIC | SUGGESTION | `server/src/modules/x/service.ts:40` | BFS roll-up inside the service | fix (user, round 1) | verified (round 2) |
| R-2 | 1 | verifier | S4-R2 | NOT MET | `server/src/modules/x/routes.ts` | route has no rate limit | fix | open · attempts 1 |
| R-3 | 1 | code-review | — | WARNING | `client/src/lib/hooks/x.ts:12` | stale closure over prId | rejected: the hook re-subscribes on prId (`x.ts:18`) | closed |
| R-4 | 1 | verifier | EXTRA | — | `server/test/x.test.ts` | test S4 implies | accepted extra | closed |
```

- `source`: `verifier` · `arch` · `code-review` · `verify` · `live`.
- `decision`: `fix` · `fix (user)` · `ask` → the user's answer · `deferred (user)` · `rejected: <reason>` ·
  `accepted extra` · `accepted deviation (user)` · `report only`.
- `status`: `open` · `fixed (round k)` (implementer reported it) · `verified (round k)` (a reviewer confirmed)
  · `reopened` · `closed`.

## Amendment — appended to the plan file

```markdown
## Amendment — review round <k> (<YYYY-MM-DD>, /run-plan)

### Phase F<k> — review fixes · done when: `<typecheck + unit lane (+ arch) of the touched packages>`

### F<k>.1 R-2: <finding title>
- Files: modify `<path from the repo root>`
- Finding (<source> `<ref>`, `.devdigest/plans/<slug>.r<k>.<verifier|arch>.md`): "<≤3 quoted lines>"
- Fix: <the direction — only this finding>
- Skills: <from the plan's Skill map for this file>
- Done when: `<typecheck + this file's test>` → <expected result>
```

The same shape with `## Amendment — verify fix <n>` / `### Phase V<n>` / `### V<n>.1 <pkg> <lane>` for a red
`verify.mjs`, and `## Amendment — brief` / `### Phase B1` / `### B1.1` for brief requirements the plan did
not cover.

## Accepted extras — a plan section, created once

```markdown
## Accepted extras

- `server/test/x.test.ts` — the test S4 implies (round 1, main session)
- `client/messages/en/x.json` — accepted by the user, round 2: <reason>
```

`node scripts/plan.mjs files` counts these as planned, so the next verifier round does not flag them again.

## Final report — `P.impl-report.md`

```markdown
# /run-plan — <slug> · <PASS | PASS with known issues | STOPPED at <stage>>

- Plan: <path> · Spec: <path | none> · Mode: <mode> · Verifier: <sonnet | opus>
- Phases: P1 ✅ · P2 ✅ · … · fix rounds: <n> (F1 … F<n>) · verify fixes: <n>
- Last verify: `<slug>.verify.json` <OK | FAIL> · last verifier: <verdict> · last architecture review: <status>
- Ledger: <n> fixed · <n> rejected · <n> deferred · <n> accepted · <n> still open

## Known gaps
- NOT VERIFIABLE: <ID — what would verify it>
- Rows without test evidence (test-writer is off): <ID — behaviour>
- Deferred suggestions: <R-n — finding>

## Run by hand
- <e.g. `cd server && pnpm exec vitest run .it.test` with Docker up — the integration lane was skipped>

## Next
- The user runs `/pr-self-review`.
```
