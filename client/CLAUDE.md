# client — `@devdigest/web` (Next.js studio)

The UI: add repos, browse PRs, run and read reviews, edit agents. Talks only to the Fastify API.

## Before answering
- Locate the route in `src/app/**/page.tsx`, then its colocated `_components/<Name>/`.
- Need data? Look for an existing hook in `src/lib/hooks/*` before writing a new fetch.
- Need a UI primitive? Check `@devdigest/ui` (`src/vendor/ui`) before building one.
- Using a type from `@devdigest/shared`? This is the CLIENT copy — compare with
  `server/src/vendor/shared` if the API shape looks off.

## Stack
Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 (single locale `en`) ·
recharts · mermaid · vitest 2 + React Testing Library + jsdom.

## Commands (pnpm)
- Dev: `pnpm dev` (:3000) · Test: `pnpm test` · Typecheck: `pnpm typecheck`
- API base: `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`)

## Map
- `src/app/` — routes; pages are thin, feature logic in `_components/<Name>/`
- `src/components/` — cross-route chrome: `app-shell` (nav, breadcrumbs, `g`-key shortcuts), diff-viewer
- `src/lib/api.ts` — `apiFetch` + `ApiError` · `src/lib/hooks/*` — every React Query hook
- `src/vendor/ui/` — `@devdigest/ui` design system · `src/vendor/shared/` — Zod contracts (copy)
- `messages/en/<namespace>.json` — UI strings, one file per feature namespace

## Conventions (non-default)
- Component folder: `Name.tsx` · `index.ts` (re-export) · `styles.ts` · `constants.ts` ·
  `helpers.ts` · `Name.test.tsx`. Nested sub-components go in `_components/` inside it.
- Styles are `CSSProperties` objects in `styles.ts` (`export const s = {...}`) using CSS
  variables (`var(--border)`, `var(--bg-elevated)`) — NOT Tailwind classes.
- All server data goes through a hook in `lib/hooks` → `api.*`; no raw `fetch` in components.
- Every user-facing string lives in `messages/en/<ns>.json`, read via `useTranslations("<ns>")`.
  A new feature adds its own namespace file.
- Errors: branch on `ApiError.status` / `code` (0 = API unreachable).

## Gotchas
- `src/vendor/shared` has already drifted from the server copy (e.g. no `'openrouter'` in
  `LLMProvider.id`) — sync it when a contract changes.
- Tests mock `fetch`; they never hit the API. Real journeys belong in `../e2e`.
- Namespaces for future lessons (`blast`, `eval`, `memory`, …) exist in `messages/` already.

## Do not touch
- `src/vendor/ui/**` — vendored design system; extend deliberately, don't fork per-feature.

## Docs
| Doc | Use when |
|-----|----------|
| `README.md` | need the UI route map and which API endpoints each page uses |
| `src/vendor/ui/README.md` | picking or extending a design-system component, theming |
| `docs/` | need deeper UI design notes / ADRs |
| `specs/` | implementing a UI feature that has a spec |
| `INSIGHTS.md` | a component/test behaves unexpectedly; entries are added via the `engineering-insights` skill |
| `../e2e/CLAUDE.md` | a change alters a flow covered by browser e2e |
