# Worked examples

Before/after for each rule in `SKILL.md`. Examples use this repo's `client/` package so the paths
are real, but the reasoning transfers.

## 1. The placement decision, applied

**Task:** add a "Findings by severity" panel to the PR detail page. It needs a severity→colour map,
a counting function, and a small badge component.

**Wrong instinct — everything lands in shared folders:**

```
src/lib/constants.ts          + SEVERITY_COLORS
src/lib/utils.ts              + countBySeverity()
src/components/Badge.tsx      + new shared Badge
src/app/.../page.tsx          uses all three
```

Three files in three shared locations now exist to serve one screen. Nothing else imports them, and
nothing ever will unless someone goes looking.

**Right — walk the decision, stop at the first yes:**

```
src/app/repos/[repoId]/pulls/[number]/_components/SeverityTally/
  SeverityTally.tsx
  SeverityTally.test.tsx
  index.ts            export { SeverityTally } from "./SeverityTally";
  constants.ts        SEVERITY_COLORS — used only here
  helpers.ts          countBySeverity() — used only here
  _components/
    SeverityBadge.tsx — used only by SeverityTally
```

Every question in the decision answered "used by exactly one component", so everything stayed local.
If a second route later needs `countBySeverity`, *that* is when it moves — and then it moves into
`src/lib/findings.ts`, which already owns findings logic, rather than into a new `utils.ts`.

## 2. Naming: category vs purpose

```
✗ src/lib/utils.ts
    export function formatDate(...)
    export function parseGithubUrl(...)
    export function severityRank(...)
    export function truncate(...)
```

Nothing is ever wrong to add here, so everything gets added. Reviewing an import of `utils` tells you
nothing about what the module does.

```
✓ src/lib/format.ts          formatDate, truncate
✓ src/lib/github-urls.ts     parseGithubUrl
✓ src/lib/findings.ts        severityRank
```

Now a function that fits nowhere is a visible signal that it needs its own module — which is the
whole point. This is what `client/src/lib/` already looks like; the rule describes it rather than
changing it.

## 3. Splitting: data model, not line count

```tsx
// ✗ split because "the file got long"
function PullRequestPage() { /* 240 lines */ }
// → PullRequestPageTop.tsx + PullRequestPageBottom.tsx
```

The halves have no independent meaning, cannot be tested separately, and now share state through
props that exist only because of the split.

```tsx
// ✓ split along the data model — each piece owns one thing
<PullRequestPage>
  <PullHeader pull={pull} />           {/* one PR */}
  <SeverityTally findings={findings} /> {/* the findings list */}
  <RunHistory runs={runs} />            {/* the runs list */}
</PullRequestPage>
```

Each child corresponds to one piece of data and changes for one reason. The file is shorter as a
side effect, not as a goal.

## 4. Not splitting: the third occurrence

```tsx
// Occurrence 1 and 2 — leave them alone.
<span style={s.badge}>{finding.severity}</span>     // in SeverityTally
<span style={s.pill}>{run.status}</span>            // in RunHistory
```

They look similar and are about to diverge — one is a severity scale, the other a run lifecycle.
Extracting a `<StatusThing variant=…>` now buys a shared component that both callers immediately
need to configure around.

```tsx
// Occurrence 3, with the shape finally clear — now extract.
<Badge tone="danger">{finding.severity}</Badge>
```

## 5. Props: composition over the fourth flag

```tsx
// ✗ configuration creep
<Panel
  title="Findings"
  showHeader
  showFooter
  collapsible
  bordered
  dense
/>
```

Each flag multiplies the states `Panel` must render correctly, and the next requirement adds another.

```tsx
// ✓ hand the caller the slots and let it compose
<Panel>
  <Panel.Header>Findings</Panel.Header>
  <Panel.Body dense>{…}</Panel.Body>
</Panel>
```

Note `dense` survived — a genuine two-state visual choice is a fine boolean. The flags that had to go
were the ones controlling *structure*, which `children` expresses better than a prop can.

Use a union once a choice has three states: `tone="danger"` scales where `isDanger` + `isWarning` +
`isInfo` produces unrepresentable combinations.

## 6. Business logic: pure function plus hook

```tsx
// ✗ rules buried in the hook, untestable without React
export function useFindings(pullId: string) {
  const { data } = useQuery({ queryKey: ["findings", pullId], queryFn: … });
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of data ?? []) {
    if (f.confidence < 0.5) continue;        // ← a business rule
    counts[f.severity] += 1;                 // ← another
  }
  return { findings: data, counts };
}
```

```ts
// ✓ src/lib/findings.ts — the rules, callable from a plain test
export function tallyBySeverity(findings: Finding[]): SeverityCounts {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of findings) {
    if (f.confidence < CONFIDENCE_FLOOR) continue;
    counts[f.severity] += 1;
  }
  return counts;
}
```

```tsx
// ✓ src/lib/hooks/use-findings.ts — wiring only
export function useFindings(pullId: string) {
  const { data } = useQuery({ queryKey: ["findings", pullId], queryFn: … });
  return { findings: data, counts: tallyBySeverity(data ?? []) };
}
```

`tallyBySeverity` is now tested by calling it. The hook reads as orchestration, which is what makes
it obvious when a rule has been smuggled back in.

## 7. Import direction: lift, don't reach sideways

```
✗ src/app/agents/_components/AgentEditor/AgentEditor.tsx
    import { ModelPicker } from "../../../repos/[repoId]/_components/ModelPicker";
```

Each such import looks reasonable in isolation. Together they turn two features into one feature
stored in two folders, and the relative path itself is a warning nobody reads.

```
✓ move it up to the level that already owns both
  src/components/ModelPicker/     ← shared chrome
    ModelPicker.tsx
    index.ts

  both features now import "@/components/ModelPicker"
```

Enforce it so it fails in CI rather than in review:

```js
// eslint.config.js
{
  rules: {
    "import/no-restricted-paths": ["error", {
      zones: [
        // sibling route features may not reach into each other
        { target: "./src/app/agents", from: "./src/app/repos" },
        { target: "./src/app/repos",  from: "./src/app/agents" },
        // shared code may never depend on a feature
        { target: "./src/components", from: "./src/app" },
        { target: "./src/lib",        from: "./src/app" },
      ],
    }],
  },
}
```

## 8. Barrels: facade yes, aggregator no

```ts
// ✓ facade — one module, no fan-out, keeps the import path stable
// src/app/.../_components/RunHistory/index.ts
export { RunHistory } from "./RunHistory";
```

```ts
// ✗ aggregator in app code — every importer now pulls the whole set,
//    and a module importing from its own directory's barrel creates a cycle
// src/app/.../_components/index.ts
export * from "./RunHistory";
export * from "./SeverityTally";
export * from "./FindingsPanel";
```

```ts
// ✓ aggregator at the design-system boundary — deliberate, consumed as a unit
// src/vendor/ui/index.ts
export * from "./primitives";
export * from "./kit";
```

## 9. The client boundary is a graph, not a label

```tsx
// ✗ the directive does not stay where you put it
"use client";
import { HeavyMarkdownRenderer } from "./HeavyMarkdownRenderer"; // now client too
```

Everything a client module imports joins the client bundle, transitively.

```tsx
// ✓ children cross the boundary — they are created by the parent, not the client module
// layout.tsx (server)
<ClientShell>
  <ServerOnlyThing />   {/* stays server-rendered */}
</ClientShell>
```

In this repo the posture is already decided — pages are client components by design — so the rule
you will actually use is the consistency one: a new page follows the existing model.

```tsx
// ✓ matches this codebase
"use client";
export default function PullPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { findings } = useFindings(…);
  …
}
```

```tsx
// ✗ "modernising" a page breaks its hooks — params is a Promise in Next 15
export default async function PullPage({ params }: { params: Promise<…> }) { … }
```
