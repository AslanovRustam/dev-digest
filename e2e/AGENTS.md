# e2e — `@devdigest/e2e` (browser flows)

Deterministic UI journeys driven by the `agent-browser` CLI (CDP). No Playwright, no LLM, no key.

## Before answering
- Read an existing flow in `specs/` of the same shape before writing a new one.
- A UI change (text, route, label) may break a flow — grep `specs/*.flow.json` for the old string.
- Flows assume ONLY the seeded demo data (`acme/payments-api`, PR #482, seeded agents).

## Stack
`agent-browser` CLI (global install) · `run.ts` runner via tsx · TypeScript.

## Commands (npm — NOT pnpm)
- One-time: `npm i -g agent-browser && agent-browser install`
- Hermetic (recommended): `./scripts/e2e.sh` — own Postgres :5433, API :3101, web :3100
- Against the dev stack (only if its DB holds just the seed): `cd e2e && npm install && npm test`

## Map
- `specs/NN-name.flow.json` — the flows (test cases, NOT design docs)
- `run.ts` — runs each flow's steps in one browser session · `lib/assert.ts` — stdout checks
- `test-results/` — failure screenshots (git-ignored)

## Conventions (non-default)
- A flow = `{ name, steps: [{ cmd: [...], label, assert? }] }`; `{BASE}` = `E2E_BASE_URL`.
- Assertions ARE the waits: `wait --text` / `wait --url` fail the step on timeout.
- Locators: only `--url`, `--text`, `find role|text|label`. NEVER the AI `chat` command.
- Read-only: a flow must not submit forms or trigger a model call.
- Number new flows sequentially (`08-…`) and add a row to the coverage table in `README.md`.

## Gotchas
- Flows 02/04/05 follow "first repo" → fail against a dev DB with other imported repos.
- The hermetic stack's :5433 may collide with other local Postgres containers —
  override: `E2E_PG_PORT=5440 E2E_API_PORT=3201 E2E_WEB_PORT=3200 ./scripts/e2e.sh`.

## Docs
| Doc | Use when |
|-----|----------|
| `README.md` | need the flow format, env knobs, or the coverage table |
| `docs/` | need deeper notes on the e2e harness |
| `docs/specs/` | planning new coverage (design specs live here — `specs/` is taken by flows) |
| `INSIGHTS.md` | a flow is flaky or fails unexpectedly; entries are added via the `engineering-insights` skill |
| `../TESTING.md` | deciding whether a check belongs in e2e or in a client/server suite |
