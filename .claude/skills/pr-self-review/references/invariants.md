# Deterministic invariants

Checked by `scripts/invariants.mjs`. No LLM, no judgement — each one is a flat fact about the
diff, taken from `AGENTS.md` or the `onion-architecture` skill. They run *before* the fan-out
and can stop the whole review on their own.

All of them are emitted with `kind: "hook"` (or `"secret_leak"`), which means they are exempt
from line-level citation grounding — see `reviewer-core/src/grounding.ts:16`.

| Rule | Fires when | Severity | Why it is a hard rule |
|---|---|---|---|
| `INV-MIGRATION` | a file under `server/src/db/migrations/**` is **modified or deleted** (adding a generated one is fine) | CRITICAL | An edited migration diverges from what other environments already applied. |
| `INV-ARCH-DEBT` | `server/.dependency-cruiser-known-violations.json` gains net lines | CRITICAL (WARNING if this is the first baseline) | onion-architecture: the ledger only shrinks. Growing it records a *new* layering violation as permitted. |
| `INV-SHARED-DRIFT` | a path under `server/src/vendor/shared/` changes without the same relative path under `client/src/vendor/shared/` (or vice versa) | CRITICAL | `@devdigest/shared` is two separate copies. Nothing type-checks the gap between them. |
| `INV-VENDORED-SKILL` | a path under `.claude/skills/<name>/` where `<name>` is in the root `skills-lock.json` | CRITICAL | The next sync overwrites the edit, so the change is silently lost. |
| `INV-RUNTIME-DATA` | `server/clones/**` or `client/src/vendor/ui/**` | CRITICAL | Runtime data and the vendored design system are not source. |
| `INV-SECRET` | an **added** line matches a credential pattern, or a `.env` file (not `.env.example`) enters the diff | CRITICAL | Once pushed it is public history; rotating the key is the only real fix. |
| `INV-CI-BLIND` | nothing in the change set matches a CI path filter | WARNING | Advisory: this self-review is then the only gate the PR gets. |

## Secret patterns

| id | Shape |
|---|---|
| `openai-key` | `sk-` + 20 or more `[A-Za-z0-9_-]` |
| `anthropic-key` | `sk-ant-` + 20 or more |
| `github-token` | `ghp_` / `gho_` / `ghu_` / `ghs_` / `ghr_` + 36 or more |
| `github-pat` | `github_pat_` + 22 or more |
| `aws-access-key` | `AKIA` + exactly 16 `[0-9A-Z]` |
| `private-key` | a `-----BEGIN … PRIVATE KEY-----` header |

There was nothing to reuse: `server/src/adapters/secrets/local.ts` is a key **store**
(`LocalSecretsProvider`), not a detector.

Matches are masked before they reach the report (`ghp_xx…xx (40 chars)`) — a report gets pasted
into a PR body, and a report must never be the thing that publishes the credential.

Deliberate non-matches: `process.env.OPENAI_API_KEY` (a reference, not a value) and `sk-`
appearing inside a word such as `task-runner`.

## Known limits

- `INV-SHARED-DRIFT` compares *paths*, not content. The two copies have deliberately diverged in
  places (`LLMProvider.id` has no `'openrouter'` on the client). A genuinely server-only change
  is the normal case for the inline suppression:
  `// pr-self-review-ignore: INV-SHARED-DRIFT — server-only field, the UI never reads it`.
- `INV-SECRET` matches shapes, not entropy. A fixture token in a test file will fire; suppress it
  with a reason.
