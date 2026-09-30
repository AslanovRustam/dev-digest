# Finding format and severity rubric

This mirrors the product's own contracts. Do not invent a parallel taxonomy.

- `Severity` → `server/src/vendor/shared/contracts/findings.ts:11`
- `CiFailOn` (the gate) → `server/src/vendor/shared/contracts/knowledge.ts:173`
- Gate arithmetic → `reviewer-core/src/output/to-review.ts:23-50`
- Grounding exemption → `reviewer-core/src/grounding.ts:16`

## The JSON a reviewing subagent returns

A single JSON array. No prose before or after it.

```json
[
  {
    "source_skill": "onion-architecture",
    "rule_id": "R6",
    "severity": "CRITICAL",
    "category": "bug",
    "kind": "finding",
    "title": "SQL runs inside the route handler",
    "file": "server/src/modules/pulls/routes.ts",
    "start_line": 42,
    "end_line": 47,
    "rationale": "…markdown, states the concrete mechanism…",
    "suggestion": "Move the query into `modules/pulls/repository.ts`.",
    "failure_scenario": "GET /repos/1/pulls with a workspace the caller does not own returns other tenants' rows, because the handler's query has no workspace filter.",
    "confidence": 0.9
  }
]
```

| Field | Rule |
|---|---|
| `severity` | exactly `CRITICAL`, `WARNING` or `SUGGESTION` |
| `category` | `bug`, `security`, `perf`, `style` or `test` |
| `kind` | `finding` for anything tied to diff lines |
| `file` | repo-relative, exactly as it appears in the patch |
| `start_line` / `end_line` | must intersect a real hunk, or the finding is discarded |
| `rationale` | the mechanism, not a restatement of the rule |
| `failure_scenario` | **mandatory for CRITICAL**, ignored otherwise |
| `confidence` | 0–1 |
| `rule_id` | required where the skill has ids — `onion-architecture` R1–R13 |

## Severity — the rubric, verbatim in spirit from `docs/agent-prompts/general-reviewer.md`

- **CRITICAL** — once merged it can cause a security breach, data loss or corruption, incorrect
  results, a crash, or a broken contract callers depend on. **This is the only level that blocks.**
- **WARNING** — a real problem worth fixing that does not block: a missed edge case, degraded
  behaviour, a maintainability or perf risk that bites at scale.
- **SUGGESTION** — a minor improvement or nit; the PR is safe to merge without it.

Assign the severity you would defend to the author's face. Do **not** inflate: a speculative
issue ("might be", "could potentially", "if X isn't already handled elsewhere") is at most a
WARNING, never CRITICAL. If you would dismiss your own finding as a likely false positive, do
not report it at all.

## Why `failure_scenario` is mandatory for CRITICAL

A CRITICAL blocks a merge. If nobody can write "input X → wrong result Y", it is not a CRITICAL.
`report.mjs` demotes any CRITICAL with an empty `failure_scenario` to WARNING automatically,
before any verification subagent runs — it is the cheapest anti-inflation lever available.

## Verification verdicts

`verification.json` is an array written by the adversarial pass:

```json
[{ "id": "<an id from report.json → pending_verification>", "real": false, "reason": "the guard on line 31 already handles it" }]
```

`real: false` demotes the finding to WARNING with the reason recorded. Deterministic findings
(invariants, failed commands) are never sent for verification — they are facts, not hypotheses.

## Discipline

- Report only **distinct** issues. Never list the same problem twice and never pad toward a
  number. Zero findings is a valid and good answer.
- Only flag what **this diff** introduced or made worse. Pre-existing code is out of scope unless
  the change directly amplifies it.
- Every finding cites a file and line range that exists in the diff.
