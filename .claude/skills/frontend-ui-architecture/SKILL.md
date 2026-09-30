---
name: frontend-ui-architecture
description: Decides WHERE frontend code goes and HOW it is split — file and folder placement, component boundaries, naming of non-component modules, where business logic lives, import direction, barrel-file policy, and the server/client boundary as a structural constraint. Use this skill whenever adding a page, component, hook, constant, type or helper to a React or Next.js codebase, whenever asked "where should this live", "how should I split this", "what do I call this folder", or when reviewing or refactoring frontend structure — including when the user only says "add a component" without mentioning architecture at all. Architecture only: for rendering performance, memoization, bundle size or Core Web Vitals use react-best-practices and next-best-practices instead.
version: 1.0.0
---

# Frontend UI architecture

This skill answers one question: **where does this code go, and how is it split?**

It exists because React publishes no official guidance on project structure at all — the only
statement the React team ever made lives in the archived `legacy.reactjs.org` FAQ, and react.dev has
no successor page. Next.js calls itself explicitly "unopinionated about how you organize and
colocate your project files". So structure is not something you can look up; it is something a
codebase decides once and then holds. This skill is that decision, with the reasoning attached so
you can tell when it does not apply.

Every position here was taken deliberately over a documented disagreement. Where the sources are
genuinely split, the section says so and says which side was chosen and why. Where the sources are
silent, the section says that too — see **What is not a rule**, which matters as much as the rules,
because most bad structural advice is folklore repeated with confidence.

## Scope, and what to use instead

| You are asking about | Use |
|----------------------|-----|
| Where a file goes, how to split it, what to name it, import direction | **this skill** |
| Re-renders, memoization, bundle size, Core Web Vitals, image/font loading | `next-best-practices`, `react-best-practices` |
| `useEffect` rules, state hygiene, derive-don't-store, key props, a11y | `react-best-practices` |
| Next.js API specifics: async params, route handlers, metadata, Suspense | `next-best-practices` |
| Zod schema authoring | `zod` |

**Known conflict.** `react-best-practices` says "Shared utilities go in `utils/`". This skill
forbids that folder name (see **Naming**). When they disagree on placement or naming, this skill
wins — it is project-owned and was written against the primary sources. On everything else
(hooks, state, rendering) `react-best-practices` wins.

## The placement decision

Ask these in order and stop at the first yes. The ordering is the point: colocation is the default
and sharing is the exception you have to earn, because a file that is shared before it has a second
real consumer has been designed against an imagined requirement.

1. **Is it used by exactly one component?** Put it in that component's folder. A constant, a type,
   a formatting function or a sub-component used once belongs next to its only caller, not in a
   shared bucket.
2. **Is it used by several components inside one route or feature?** Put it at that route/feature
   root — `_components/`, or a `helpers.ts`/`constants.ts` beside them. Still local.
3. **Is it used by two or more unrelated routes or features?** Now promote it to shared. See
   **Promotion**.
4. **Is it a UI primitive with no domain knowledge?** It belongs in the design system, not in
   shared app code.

The failure mode this ordering prevents is the "shared" folder that slowly becomes the whole
application. If you cannot name the second consumer, it is not shared yet.

## Components: placement and splitting

**Folder per component, not file per component**, once a component has anything beside itself —
sub-components, styles, tests, constants. The folder is what makes colocation possible; a single
`.tsx` forces everything adjacent to spill into shared folders.

```
RunHistory/
  RunHistory.tsx        # the component
  RunHistory.test.tsx   # its test
  index.ts              # one-line re-export (see Barrels)
  styles.ts             # its styles
  constants.ts          # constants only it uses
  helpers.ts            # pure functions only it uses
  _components/          # sub-components used only by it
```

A component that is genuinely one file — no styles module, no test, no sub-parts — can stay a
single `.tsx` next to its siblings. Do not create a folder with one file in it to satisfy a pattern.

**When to split.** react.dev gives exactly one substantive criterion and it is not size: a component
should correspond to **one piece of your data model**. Split when:

- the component renders two things that would change for different reasons;
- you see the same markup a third time (not the second — see **premature abstraction** below);
- a layer passes props it does not itself use, which react.dev names as a sign of a forgotten
  extraction.

**When not to split.** Duplication is cheaper than the wrong abstraction. Sandi Metz's rule — prefer
duplication to premature abstraction — and Kent C. Dodds' AHA ("avoid hasty abstractions") both say
to wait until the shape of the repetition is actually clear. Two similar components that are about
to diverge should stay two components.

**Props API.** Prefer composition over configuration. When a component grows a fourth boolean flag,
that is the signal to accept `children` or named slots instead of more props. Use a boolean for a
two-state choice and a string union for three or more, or for anything likely to grow — a `variant`
prop that starts as `isPrimary` will become `isPrimary | isDanger | isGhost` and then be
unrepresentable.

## Non-component modules: naming

**Name a module by what it does, never by what category of thing it contains.** This is the single
highest-leverage naming rule and it is well supported: Martin Fowler treats "helper" in a name as "a
red flag… it usually indicates a poorly thought out abstraction"; Dave Cheney argues such names
"describe what a package contains rather than what it provides"; Feature-Sliced Design states
normatively that `lib` folders "should not be treated as helpers or utilities" and that each must
have "one area of focus, for example, dates, colors, text manipulation".

```
✗ utils/            ✓ format.ts
✗ helpers/          ✓ github-urls.ts
✗ common/           ✓ findings.ts
✗ misc/             ✓ model-label.ts
```

**Do not create `utils/` or `helpers/`.** The widely repeated distinction — utils are generic, helpers
are domain-specific — is folklore. No official documentation, no named style guide and no recognized
expert endorses it; it propagates through blog posts citing each other. A folder named for a
category has no membership criterion, so nothing is ever wrong to put in it, and it grows without
limit. A folder named `format` tells you immediately when a function does not belong.

Category-named folders that already exist and carry a real, narrow meaning — `hooks/`, `api/` — can
stay. The rule targets the semantically empty names, not every noun.

**Constants.** No global `constants.ts`. Constants follow the placement decision like everything
else: local to their component, then to their feature, then shared only with a second real consumer.
Route paths and query keys are feature-local by default — a global key registry couples every
feature to one file.

**Types.** Colocate single-use types with their usage; a shared type goes in the narrowest file both
consumers can see. Where a schema already defines the shape, derive the type (`z.infer`) rather than
writing a parallel declaration — two definitions of one contract will drift.

**Config.** One module that reads and validates environment variables at startup, so a missing
variable fails at boot with a clear message instead of as `undefined` deep in a request.

## Business logic: two tiers, not a layer

Business logic lives in **pure functions** plus **hooks that wire them up**. That is the whole model.

- **Pure functions** hold the rules — calculations, derivations, formatting, classification. They
  take data and return data, import nothing from React, and are tested by calling them.
- **Hooks** hold the wiring — fetching, caching, subscriptions, navigation, the bridge between the
  server and the pure functions. A hook should read as orchestration; if a hook contains a
  calculation worth naming, that calculation wants to be a pure function it calls.

react.dev supports the split directly: custom hooks "let you share stateful logic but not state
itself", and a function that calls no hooks "should avoid the `use` prefix" — a rule that only makes
sense if pure logic is expected to live outside hooks.

**Do not build a domain layer.** Domain/Application/Adapters, use cases and ports are a real
tradition with well-written advocacy, but its own advocates call a full implementation overkill for
most applications, and the popular references — Bulletproof React, Wieruch's feature slices — ship no
such layer. Fowler's anemic-domain-model test cuts against most frontend attempts: schemas plus
mappers plus use-case services "incur all of the costs of a domain model, without yielding any of
the benefits". In a UI that talks to a backend owning the business rules, the schema is the
contract and the pure functions are the logic. If you find yourself writing a real rules engine in
the browser, revisit this — that is when the tradition earns its cost.

**Server state is not client state.** Data that came from the server belongs to a data-fetching layer
(a hook per resource), not to a global store. Global stores are for state the client actually owns:
UI mode, selections, drafts. Putting server data in a store means writing cache invalidation by hand.

**Where a component may fetch.** Any component may call a data hook. The old rule that only
containers fetch was retracted by the author who popularized it, and colocated fetching is now
normal. The boundary that replaced it is the server/client one below, which the compiler enforces.

## Promotion: local → shared

Promote when there is a **second real consumer in a different feature** — not an anticipated one.

There is no authoritative "rule of three" for React components; the literature says "second
consumer" or "used on multiple pages". Use the second-consumer trigger, and when you promote, move
the file rather than re-exporting it from its old home, so there is one location and one import path.

Promotion is also the moment to strip feature knowledge. A component that moves to shared and still
imports a feature's types has not been promoted, it has been aliased.

## Import direction

Dependencies point one way: **shared → feature → route/app**. A feature may import from shared; a
feature may not import from another feature; nothing shared may import from a feature.

When two sibling features need the same thing, **lift it** — move the shared part up to the route or
app level that already owns both, or into shared. Do not import sideways. Sideways imports are how
two features become one feature that is stored in two folders, and they are invisible in review
because each individual import looks reasonable.

Enforce this with ESLint `import/no-restricted-paths` rather than documentation. A boundary that is
only written down erodes; the point of the rule is that it fails in CI, on the commit that breaks it,
naming the file. The alternative approach — Feature-Sliced Design's explicit cross-import notation —
solves the same problem by declaring coupling instead of forbidding it, and is the better choice in
codebases already organized into FSD layers and slices. In a route-colocated codebase it costs a
full re-layering to buy the same guarantee.

## Barrel files

**A one-line re-export beside a component is fine. An aggregating barrel is not.**

```ts
// ✓ facade: one module, no fan-out
// RunHistory/index.ts
export { RunHistory } from "./RunHistory";

// ✗ aggregator: many modules behind one specifier
// _components/index.ts
export * from "./RunHistory";
export * from "./FindingsPanel";
// ...and thirty more
```

This distinction resolves an argument that is otherwise unresolvable. The case against barrels —
cyclic imports when a module imports from the barrel of its own directory, tooling and dev-server
latency, confusing auto-imports — is measured on **aggregating** barrels with large fan-out. The case
for them is about import ergonomics and encapsulation. Neither side's evidence touches a single-module
facade, so the facade is not actually in dispute; only the aggregator is, and the aggregator is what
carries the cost.

Keep aggregating barrels to the design-system boundary, where the fan-out is deliberate and the
package is genuinely consumed as a unit.

## The server/client boundary as structure

`"use client"` is a **module-graph boundary, not a per-component label**. Everything a client module
imports, and every component it directly renders, joins the client bundle. The exception is the one
that makes layered apps possible: components passed in as `children` or other props are *not*
pulled in, because they are created by the parent, not by the client module.

Architecturally this means the directive is a structural decision, not a fix you sprinkle on an
error. Two consequences:

- **Pushing `"use client"` toward the leaves keeps more of the tree server-rendered** — but it is a
  real design choice with costs, not a law. An app whose data all comes from an external API over
  client-side fetching gains little from it, and Next.js explicitly documents "external HTTP APIs" as
  one of three sanctioned data architectures, recommending you **pick one and not mix them**.
- **Whatever posture you choose, be consistent and write it down.** The expensive state is a codebase
  where half the pages assume one model and half assume the other, because every new file then needs
  an investigation before it can be placed.

**Authorization never lives in a layout or a proxy alone.** Layouts do not re-render on navigation
and do not control whether the rest of the route renders; request-level middleware is not a
sufficient line of defence. Checks belong as close to the data as possible.

## What is not a rule

These are findings, not gaps. Asserting them as rules is how folklore spreads, so say "no
authoritative source specifies this" when asked.

- **No line count or prop count makes a component too big.** "Split at 200 lines" appears only in
  low-authority listicles. Use the data-model and change-reason criteria instead.
- **`utils` vs `helpers` has no authoritative definition.** The distinction is invented. (This skill
  forbids both names for a different and better-supported reason: category names have no membership
  criterion.)
- **No "rule of three" for promoting a React component.** The rule of three that exists comes from
  design-system literature, not React.
- **Prop drilling is explicitly tolerated by react.dev** — "it's not unusual to pass a dozen props
  down through a dozen components". Context is presented as the third option, not the fix. The real
  smell is a layer that passes a prop it does not use.
- **"God component", "fat component" and "god hook" are folk terms** with no authoritative
  definitions. Describe the concrete problem instead.
- **React has no official project-structure guidance.** Do not cite react.dev for folder layout; it
  has no such page.

## In this repo

The `client/` package is Next.js 15 / React 19 / TanStack Query 5 / next-intl / Zod, and it uses the
App Router as a **purely client-side router**: every `page.tsx` is a client component reading route
params via `useParams()` rather than the `params` prop, the root `layout.tsx` is the only server
component, and all data comes from the Fastify API on `:3001` through hooks in `src/lib/hooks/`.

This is a deliberate, internally consistent posture, and the absence of route handlers and server
actions is compliance with "choose one data-fetching architecture" — not a gap to fill. Match it
when adding code:

- A new page is a client component; read params with `useParams()`. Do not convert a page to
  `async function Page({ params })` — `params` is a Promise in Next 15 and the page's hooks would
  break.
- Server data goes through a hook in `src/lib/hooks/`, never a raw `fetch` in a component.
- Non-component modules in `src/lib/` are purpose-named (`format.ts`, `findings.ts`,
  `github-urls.ts`) — keep it that way.
- `src/vendor/ui/` is the design system and the one place aggregating barrels are expected.
- Every user-facing string lives in `messages/en/<namespace>.json`.

See `client/AGENTS.md` for the package's full conventions and `client/INSIGHTS.md` for the traps.

## Further reading

`examples.md` — worked before/after examples for each rule above, including the placement decision
applied to a realistic new feature.

`README.md` — the full annotated source list behind every position in this skill, grouped by theme,
with authority ratings and the record of which disagreements were decided and how.
