# Insights — client

Append-only. Written by the `engineering-insights` skill; rules, gate and entry format live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

_None yet._

## What Doesn't Work

_None yet._
- **2026-09-25** · Don't mount another `FindingsPanel` to reuse its list (e.g. in the trace drawer). Compose
  `FindingCard` + `visibleFindings` + `useFindingAction` instead, as `RunTraceDrawer/_components/FindingsSection`
  does. why: every panel adds its own `window` keydown listener for j/k and a/d, so each open panel reacts to
  one keypress and `a`/`d` would accept or dismiss a finding in each of them.
  · ref: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`

- **2026-09-30** · Import `@devdigest/shared` TYPE-only in client code (`import type { … }`). A value
  import such as `SkillType.options` passes `pnpm typecheck` and `pnpm test` but fails `next build` with
  `Module not found: Can't resolve './contracts/knowledge.js'` — webpack can't map the vendored copy's `.js`
  specifiers to `.ts`. Need the enum values at runtime? Keep a client-side constant (see `SKILL_TYPES`).
  · ref: `src/components/skill-type-badge/constants.ts`
- **2026-09-30** · Never run `pnpm build` while `pnpm dev` is serving from the same folder — why: both
  write `client/.next`; the build overwrites the dev server's output and every page then returns 500
  (pages-router error shell). Deleting `.next` does not recover it; only restarting `next dev` does.
  Verify a production build with the dev server stopped. · ref: `client/next.config.mjs`

## Codebase Patterns

_None yet._
- **2026-09-25** · For any rich tooltip or popover, reuse `components/hover-card/HoverCard` (portal + fixed
  position) instead of an absolutely-positioned panel — why: `@devdigest/ui` has no Tooltip/Popover, and the
  PR list's `tableCard` has `overflow: hidden`, which clips absolute panels. Keep its `stopPropagation` on the
  card: React bubbles portal events through the COMPONENT tree, so a click inside the card would still reach
  `PRRow`'s `onClick` and navigate. · ref: `src/components/hover-card/HoverCard.tsx`, `src/app/repos/[repoId]/pulls/styles.ts`

- **2026-09-29** · The App Router here is a pure client-side router: every `src/app/**/page.tsx` is a
  client component that reads route params via `useParams()`, NOT the `params` prop; the root
  `src/app/layout.tsx` is the only server component and holds the only `metadata` export. Do not
  "fix" a page into `async function Page({ params })` — `params` is a Promise in Next 15 and the
  page's hooks (TanStack Query, `useTranslations`) would break. There are deliberately no
  `error.tsx` / `loading.tsx` / `not-found.tsx`, no route handlers and no server actions: the API is
  Fastify on :3001, and Next's own docs say to pick ONE data-fetching architecture and not mix them.
  · ref: `src/app/repos/[repoId]/pulls/[number]/page.tsx:28`

- **2026-09-30** · The kit's `Donut` hard-codes a `$` prefix and `toFixed(2)` — use recharts `PieChart`
  directly for counts (Skills → Stats). The kit `Toggle` takes no `aria-label`: wrap it in a `<label>` with
  visually hidden text so `getByRole('switch', { name })` works; the kit `Checkbox` is a
  `<button role="checkbox">` inside a `<label>`, so its label text is already the accessible name.
  · ref: `src/app/skills/[id]/_components/SkillDetail/_components/StatsTab/`

## Tool & Library Notes

_None yet._

- **2026-09-29** · Enabling Next.js `cacheComponents` would break the build as the client package is
  written today: `useParams` suspends for dynamic params not covered by `generateStaticParams`, and
  every page here reads params that way, so each would need a `<Suspense>` boundary above it. Check
  this before adopting the flag. · ref: https://nextjs.org/docs/app/api-reference/functions/use-params

- **2026-09-30** · vitest does not enforce `noUncheckedIndexedAccess`, `pnpm typecheck` does: `rows[i]` and
  `const [a] = arr` are `T | undefined` under tsc, so code green in vitest can still fail typecheck — run both.
  · ref: `client/tsconfig.json`

## Recurring Errors & Fixes

- **2026-09-30** · **Symptom:** `cd client && pnpm typecheck` fails with `error TS6053: File
  '.../client/.next/types/app/layout.ts' not found`, then passes on an immediate re-run, with no
  source change in between. **Cause:** `client/tsconfig.json` includes `.next/types/**/*.ts`, a
  Next-generated directory. A present-but-stale `.next` makes tsc list files that no longer exist;
  a fresh checkout has no `.next` at all, so the glob matches nothing and CI never sees this.
  **Fix:** re-run, or `rm -rf client/.next`. Do not chase it as a type error in `src/`.
  · ref: `client/tsconfig.json` (`include`)


## Session Notes

### 2026-09-29 — architecture research for a React/frontend skill
Measured the package's actual shape (65 of 105 `.tsx` carry `"use client"`) and researched the
canon behind it. Sources and the synthesis live in `research_notes/Архитектура React и Next js/`
and `reports/Архитектура React и Next js.md` at the repo root. Headline: React publishes NO
official guidance on project structure, and the current Next.js docs ship as v16.3.x with
`middleware.ts` renamed to `proxy.ts` — so pre-2026 structural writing needs re-checking.

_None yet._

## Open Questions

_None yet._
