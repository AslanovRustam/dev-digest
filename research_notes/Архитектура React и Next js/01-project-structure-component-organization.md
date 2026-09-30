# React / Frontend Project Structure and Component Organization

Scope note: ARCHITECTURE ONLY. Performance, bundle size, rendering speed and memoization are out of scope
*except* where a performance claim is the load-bearing argument in an architectural debate (barrel files) —
in those cases the argument is recorded because it is the reason the architectural rule exists, and it is
flagged as such.

Era note: sources fetched 2026-09-29. Dates below are as stated by the sources themselves.

---

## Q1. What are the named, well-known structural approaches, and what does each prescribe concretely?

### Takeaway
There are six or seven genuinely *named* approaches, and they sit on a spectrum from "no method at all"
(React's own official advice: don't overthink it) through type-based grouping, to feature-first
(Bulletproof React), to fully specified layered methodologies with enforced import direction
(Feature-Sliced Design). Atomic Design is the odd one out: it is a *design-system* taxonomy that gets
misused as a folder structure, and its own author says it is neither linear nor dogma.

### Cited Findings

**1. Type-based / "group by file type" — the default, endorsed as an option by React itself**
- React's own (legacy) docs name exactly two common approaches: "Grouping by features or routes" and
  "Grouping by file type" (e.g. `api/`, `components/`) — [React legacy docs, File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html)
- The same page caps nesting at "a maximum of three or four nested folders within a single project", because
  deeper nesting complicates relative imports and moving files — [React legacy docs](https://legacy.reactjs.org/docs/faq-structure.html)
- React's stated position: "If you're just starting a project, don't spend more than five minutes on choosing
  a file structure." Start with all files in one folder and reorganize as it grows — [React legacy docs](https://legacy.reactjs.org/docs/faq-structure.html)
- IMPORTANT STATUS FLAG: this page lives on `legacy.reactjs.org`. It is the last *official* React statement on
  file structure; the modern react.dev docs do not carry an equivalent page. So the only official React guidance
  on structure is formally archived — treat it as authoritative-but-legacy.
- The best-known informal articulation of the same position is Dan Abramov's "move files around until it feels
  right — this is not a joke", from a since-deleted tweet; it is repeated second-hand and cannot be primary-sourced
  — [dev.to write-up of the quote](https://dev.to/dance2die/move-files-around-until-it-feels-right-2lek); [sung.codes, 2018-11-18](https://sung.codes/blog/2018/11/18/move-files-around-until-it-feels-right/)

**2. Feature-based / feature-first (progressive, Robin Wieruch's formulation)**
- Wieruch prescribes a four-stage progression: (1) single `src/App.js`; (2) multiple files — "whenever a React
  component becomes a reusable React component, split it out as a standalone file"; (3) folder-per-component
  (`index.js`, `component.js`, `test.js`, `style.css`); (4) technical folders (`components/`, `hooks/`,
  `context/`, `utils/`) — [Robin Wieruch, "React Folder Structure Best Practices [2026]", last updated 2026-05-05](https://www.robinwieruch.de/react-folder-structure/)
- At scale he wants BOTH layers: technical folders for project-agnostic reusable code, plus domain/feature
  folders for business logic — and he puts the tipping point at roughly 10–15 components in a folder
  — [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- He states the direction rule in plain language: "code flows in one direction: from shared utilities into
  features, and from features into pages. Never the other way around." — [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)

**3. Bulletproof React (the de-facto community reference implementation of feature-first)**
- Top-level `src/`: `app/` (routes, main component, provider, router), `assets/`, `components/` (shared),
  `config/`, `features/`, `hooks/`, `lib/` (preconfigured reusable libraries), `stores/`, `testing/`, `types/`,
  `utils/` — [bulletproof-react docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Each `src/features/[feature-name]/` may contain the *same* technical segments, scoped: `api/`, `assets/`,
  `components/`, `hooks/`, `stores/`, `types/`, `utils/` — i.e. type-based grouping *inside* a feature
  — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Three hard rules: no barrel files, no cross-feature imports, unidirectional flow shared → features → app
  — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Authority/weight: 35.9k GitHub stars, MIT, ~271 commits on master; the repo explicitly says "This is not
  supposed to be a template, boilerplate or a framework. It is an opinionated guide that shows how to do some
  things in a certain way", and tells readers to "decide what works best for you and your team and stay
  consistent" — [bulletproof-react README](https://github.com/alan2207/bulletproof-react)
- Docs set: Application Overview, Project Standards, Project Structure, Components and Styling, API Layer,
  State Management, Testing, Error Handling, Security, Performance, Deployment, Additional Resources
  — [bulletproof-react README](https://github.com/alan2207/bulletproof-react)

**4. Feature-Sliced Design (FSD) — the most formally specified**
- Layers, top to bottom: **App** (routing, entrypoints, global styles, providers) → **Processes** (DEPRECATED)
  → **Pages** → **Widgets** → **Features** → **Entities** (business domain objects) → **Shared**
  (project-agnostic) — [feature-sliced.design, Overview](https://feature-sliced.design/docs/get-started/overview)
- Two orthogonal axes: **slices** = business domains within a layer (only in Entities, Features, Widgets, Pages);
  **segments** = technical purpose within a slice, conventionally `ui`, `api`, `model`, `lib`, `config`
  — [FSD Overview](https://feature-sliced.design/docs/get-started/overview)
- Stated goals: uniformity across projects, isolated modification without unintended consequences, balancing
  reusability against practicality, and aligning architecture with business domains
  — [FSD Overview](https://feature-sliced.design/docs/get-started/overview)
- `Processes` being marked deprecated is the one concrete sign of FSD version drift — a 2022-era FSD tutorial
  that uses `processes/` is teaching a layer the spec has retired.

**5. Atomic Design (Brad Frost) — a design-system taxonomy, repeatedly miscast as a folder structure**
- Five stages: **Atoms** ("UI elements that can't be broken down any further"), **Molecules** ("collections of
  atoms that form relatively simple UI components"), **Organisms** ("relatively complex components that form
  discrete sections of an interface"), **Templates** ("place components within a layout and demonstrate the
  design's underlying content structure"), **Pages** ("apply real content to templates … and test the resilience
  of the design system") — [Brad Frost, *Atomic Design*, Ch.2, 2016](https://atomicdesign.bradfrost.com/chapter-2/)
- Frost's own caveats, in his words: "atomic design is not a linear process" — it is "a mental model that allows
  us to concurrently create final UIs and their underlying design systems"; and "atomic design is not rigid
  dogma" — [Brad Frost, Ch.2](https://atomicdesign.bradfrost.com/chapter-2/)
- He cites GE Design renaming the whole taxonomy (Principles, Basics, Components, Templates, Features,
  Applications) approvingly, as evidence the labels are meant to be adapted
  — [Brad Frost, Ch.2](https://atomicdesign.bradfrost.com/chapter-2/)
- ERA FLAG: the book is 2016, pre-hooks, pre-RSC. Nothing in it addresses server/client boundaries, data
  fetching colocation, or route-based frameworks. Treat it as authoritative on *design-system vocabulary* and
  as outdated/out-of-scope as an application folder architecture.

**6. Screaming Architecture (Robert C. Martin, adapted to frontend)**
- Original thesis: architectural blueprints of a house "scream: house"; software should do the same. Martin:
  "Architectures are not (or should not) be about frameworks. Architectures should not be *supplied* by
  frameworks." — [Robert C. Martin, "Screaming Architecture", 2011-09-30](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
- The operative test: "When you look at the top level directory structure, and the source files in the highest
  level package; do they scream: **Health Care System**, or **Accounting System**?"
  — [Martin, 2011](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html)
- Frontend adaptation, staged: group-by-file-type → nesting/colocating children → add `pages/` → colocate
  contexts+hooks next to their components and delete the global folders where possible → feature folders by
  business entity (todos, projects, users) with a shared `ui/` folder
  — [Johannes Kettmann, Profy.dev, 2022-02-25](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- Kettmann's concrete conventions: absolute imports via path aliases; `index.js` as the module's public API;
  kebab-case for all files/folders (to dodge OS case-sensitivity bugs)
  — [Kettmann/Profy.dev](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)

**7. Framework-imposed structure (Next.js App Router) — explicitly non-prescriptive**
- Next.js states it is "**unopinionated** about how you organize and colocate your project files" and that the
  "simplest takeaway is to choose a strategy that works for you and your team and be consistent across the
  project" — [Next.js docs, "Project structure and organization", lastUpdated 2026-07-21, v16.3.7](https://nextjs.org/docs/app/getting-started/project-structure)
- It names exactly three organization strategies: (a) **store project files outside of `app`** (keep `app` purely
  for routing); (b) **store project files in top-level folders inside `app`**; (c) **split project files by
  feature or route** (globally shared code at `app` root, specific code pushed down into the route segments that
  use it) — [Next.js docs](https://nextjs.org/docs/app/getting-started/project-structure)
- It also explicitly disclaims its own example folder names: "we're using `components` and `lib` folders as
  generalized placeholders, their naming has no special framework significance"
  — [Next.js docs](https://nextjs.org/docs/app/getting-started/project-structure)

### Inferences
- The approaches are not mutually exclusive; they are nested. Bulletproof React ≈ feature-first + type-based
  *inside* each feature + unidirectional layering. FSD ≈ Bulletproof React with more layers, formal slice
  isolation, and a `@x` escape hatch. Screaming Architecture is the *motivation* for feature-first, not a
  competing layout.
- The real axis of disagreement is not "features vs types" — nearly everyone now agrees on features at the top
  level. It is **how much ceremony and enforcement** you buy: React/Next.js say none, Wieruch says grow into it,
  Bulletproof says three ESLint zones, FSD says a full layer algebra with a linter.

### Gaps
- No primary-source engineering blog posts from Vercel, Shopify, Airbnb or Spotify specifically on *React folder
  structure* surfaced in the searches performed. The Vercel-authored material found is about server/client
  boundaries (see Q6), not folder taxonomy. Spotify's widely cited frontend writing is about Backstage and squad
  ownership, not React file layout. **Treat "big-company endorsement" claims for any of these methods as
  unsourced.**
- Bulletproof React's `docs/project-structure.md` does not state a last-updated date, and the README fetch did
  not surface whether it targets React 19 specifically. Its version currency is unverified.

---

## Q2. Folder-per-component vs single-file components; what goes in a component folder; the argument against barrel files

### Takeaway
Folder-per-component is the consensus once a component acquires companions (tests, styles, helpers, types,
sub-components); before that, one file is correct. The genuinely contested item is the `index.ts` barrel: the
strongest voices (TkDodo, Bulletproof React, Marvin Hagemeister) say never in application code, while Josh
Comeau and Profy.dev/FSD defend it as the module's public API. This is the sharpest disagreement in the whole
topic.

### Cited Findings

**When folder-per-component applies, and what goes inside**
- Wieruch's trigger for splitting a component into its own file: "whenever a React component becomes a reusable
  React component". His component folder holds `index.js`, `component.js`, `test.js`, `style.css`
  — [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- Comeau's component folder holds: the main component (`FileViewer.tsx`), an `index.ts` barrel, sub-components
  (`Sidebar.tsx`, `Directory.tsx`), a helpers file (`FileViewer.helpers.ts`) and a types file
  (`FileViewer.types.ts`) — [Josh Comeau, "Delightful React File/Directory Structure", pub. 2022-03-15, last updated 2025-12-03](https://www.joshwcomeau.com/react/file-structure/)
- Notably, Comeau organizes **function-based and flat**, not feature-based: `src/components`, `src/hooks`,
  `src/helpers`, `src/utils`, `src/constants` — [Josh Comeau](https://www.joshwcomeau.com/react/file-structure/)
- Bulletproof React's per-feature `components/` folder is the feature-scoped equivalent; the repo does not
  mandate a folder per individual component — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

**The case AGAINST barrel files (the four documented arguments)**
1. **Circular imports.** Importing from a barrel *within its own directory* creates a cycle (`tab-panel.ts`
   importing `@/tab`, which re-exports `tab-panel.ts`). JS tolerates it; bundlers crash with cryptic errors.
   Editor auto-import creates these cycles silently — [TkDodo (Dominik Dorfmeister), "Please Stop Using Barrel Files", 2024-07-26](https://tkdodo.eu/blog/please-stop-using-barrel-files)
2. **Dev-server / module-graph blowup.** Barrels load every re-exported module even when one is needed. TkDodo's
   measured case: a Next.js project loading **11k modules (5–10s)** dropped to **3.5k modules** after removing
   internal barrels — a 68% reduction — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)
3. **Tooling cost scales superlinearly.** Module-load cost on an M1 MacBook: 500 modules 0.15s; 1,000 0.31s;
   10,000 3.12s; 25,000 16.81s; 50,000 48.44s. Because Jest rebuilds the module graph per test file in isolated
   processes, and linters work per file, a 100-test-file project pays roughly **1m18s** overhead at 10k modules,
   **~7 min** at 25k, **~20 min** at 50k. Author's verdict: "Get rid of all barrel files", claiming 60–80%
   tooling improvements — [Marvin Hagemeister, "Speeding up the JavaScript ecosystem — The barrel file debacle", 2023-10-08](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)
4. **The automated escape hatch is fragile.** Next.js's `optimizePackageImports` only works on "pure" barrels
   containing nothing but re-exports; a single `export const foo = 5` disables the optimization because of
   possible side effects — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)

- Bulletproof React encodes the same conclusion as a project rule: barrel files "can cause issues for Vite to do
  tree shaking and can lead to performance issues. Therefore, it is recommended to import the files directly."
  — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- TkDodo's rule and its single exception: avoid barrels entirely in application code — "you're just making your
  life harder by putting `index.ts` files into arbitrary directories" — but barrels are *acceptable and
  necessary* for **library public APIs**, where `package.json`'s `main` needs one entry point (his own
  `@tanstack/react-query` being the example) — [TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files)

**The case FOR barrel files**
- Comeau explicitly engages the "anti-barrel movement" and rejects it for app code: "the bundler will spend most
  of its time dealing with third-party dependencies. Less than 1% of the modules that the bundler encounters will
  be barrel files." — [Josh Comeau](https://www.joshwcomeau.com/react/file-structure/)
- Profy.dev lists "`index.js` as public API for modules" as a best practice
  — [Kettmann/Profy.dev, 2022](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- FSD *requires* a public API, implemented as index files with re-exports, typically `index.ts` per slice
  — [FSD, Public API reference](https://feature-sliced.design/docs/reference/public-api)

**Where the two camps meet — a real, documented compromise**
- FSD acknowledges TkDodo's article by name and concedes that "having a large amount of index files in a project
  can slow down the development server". Its stated mitigations: separate index files **per component** inside
  `shared/ui` and `shared/lib`; **avoid index files in segments** of layered modules; consider a monorepo for
  large projects — [FSD, Public API reference](https://feature-sliced.design/docs/reference/public-api)
- FSD also bans wildcard re-exports outright — `export * from "./ui/Comment"` is labelled "❌ BAD CODE BELOW,
  DON'T DO THIS" — because it hurts discoverability and accidentally exposes internals, creating refactoring
  risk when consumers depend on unintended exports. Only "the necessary parts of the slice should be exposed."
  — [FSD, Public API reference](https://feature-sliced.design/docs/reference/public-api)

### Explicit disagreement (do not smooth over)
- **TkDodo / Hagemeister / Bulletproof React vs Comeau / Profy.dev / FSD** on `index.ts`. The disagreement is
  partly empirical (Comeau's "<1% of modules" claim vs TkDodo's measured 11k→3.5k) and partly about which cost
  matters (build/tooling latency vs import ergonomics and encapsulation). They are not arguing about the same
  metric, which is why neither side refutes the other.
- Note the asymmetry in evidence quality: TkDodo and Hagemeister present measurements; Comeau presents an
  estimate of proportion without a benchmark. Comeau's post *was* last updated 2025-12-03, i.e. after TkDodo's
  2024 post, so his position is a considered rebuttal rather than stale advice.
- A narrow synthesis all sides could accept: barrels at **package/slice boundaries you actually want to
  encapsulate**, never at arbitrary intermediate directories, never wildcard, never imported from *within* the
  directory they index.

### Inferences
- The "barrel file" debate is nominally about performance but architecturally about **encapsulation**: a barrel
  is the only vanilla-TS mechanism for a module public API. Teams that reject barrels lose enforced
  encapsulation and must replace it with lint-based path restrictions (see Q5) — Bulletproof React does exactly
  this, which is why its no-barrel rule and its `import/no-restricted-paths` config are the same decision.

### Gaps
- No source found that measures the *architectural* cost of removing barrels (e.g. churn from deep-path imports
  when files move). The trade-off is asserted, not measured.

---

## Q3. Colocation: the principle, who articulated it, and its limits

### Takeaway
Kent C. Dodds' formulation — "Place code as close to where it's relevant as possible" — is the canonical
statement, and its documented limits are narrow and specific: E2E tests and system-wide docs. Next.js has since
made colocation a *framework guarantee* rather than just a convention.

### Cited Findings
- The principle, verbatim: "Place code as close to where it's relevant as possible"; alternate framing: "Things
  that change together should be located as close as reasonable."
  — [Kent C. Dodds, "Colocation", 2019-06-17](https://kentcdodds.com/blog/colocation)
- His reasoning is anti-decay, by analogy to code comments: separated artifacts drift. When related files are
  scattered, documentation desyncs, edits in one place don't trigger the corresponding edits elsewhere, and
  engineers maintain code they don't realize is obsolete. Colocation makes deletions and modifications visibly
  complete — [Kent C. Dodds](https://kentcdodds.com/blog/colocation)
- Stated limits — exactly two: (1) **E2E tests** belong at the root, because they span the whole project and
  "don't really care how the `src/` is organized at all"; (2) **system-wide documentation** describing
  integration across components belongs in a folder-level README covering the related modules
  — [Kent C. Dodds](https://kentcdodds.com/blog/colocation)
- React's own legacy docs already endorsed colocation as the practical restructuring heuristic — keep
  frequently-changed-together files together — [React legacy docs](https://legacy.reactjs.org/docs/faq-structure.html)
- Profy.dev's staged refactor makes colocation an explicit *step*: move contexts and hooks adjacent to the
  components that use them and delete the global `contexts/` and `hooks/` folders where possible
  — [Kettmann/Profy.dev](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- **Colocation as a framework guarantee (the 2023+ shift):** in the Next.js App Router, folders define routes
  but "a route is **not** publicly accessible until a `page.js` or `route.js` file is added", and even then "only
  the **content returned** by `page.js` or `route.js` is sent to the client". Therefore "project files can be
  **safely colocated** inside route segments in the `app` directory without accidentally being routable."
  — [Next.js docs](https://nextjs.org/docs/app/getting-started/project-structure)
- Next.js adds an *optional* belt-and-braces mechanism: **private folders** prefixed with `_` opt the folder and
  all subfolders out of routing. Its docs are careful to say "private folders are not required for colocation"
  since colocation is already safe; they are useful for separating UI from routing logic, consistency across the
  ecosystem, editor sorting, and "avoiding potential naming conflicts with future Next.js file conventions"
  — [Next.js docs](https://nextjs.org/docs/app/getting-started/project-structure)

### Inferences
- Colocation is the one principle in this entire topic with no dissenting source. Every methodology surveyed
  either states it (Dodds, React, Profy.dev, Next.js) or implements it structurally (Bulletproof features, FSD
  slices/segments).
- FSD is in mild tension with pure colocation: its `segments` (`ui`, `api`, `model`, `lib`) reintroduce
  type-based grouping *inside* the slice, so a component and its API call are colocated in the same *slice* but
  deliberately not the same folder. This is by design, not an oversight, but it means "colocate maximally" and
  "follow FSD segments" are not the same instruction.

### Gaps
- Dodds' post is 2019 and predates RSC. No updated statement from him on whether the server/client boundary
  changes colocation was found.

---

## Q4. Shared vs feature-local: what makes a component graduate to shared/ui? Is there a rule of three?

### Takeaway
There is no authoritative "rule of three" for React components. The dominant documented criterion is
**rule of two** — the second consumer promotes it — with a competing, more conservative "3+ features" variant
and an explicit counter-norm that duplication is cheaper than premature abstraction. Sources here are weaker
than elsewhere in this topic.

### Cited Findings
- **Rule of two (most commonly stated):** if exactly one feature uses a util it lives in that feature; once two
  or more features need it, it moves up to the shared layer — and the same logic applies to hooks, context and
  components — [search synthesis over community sources](https://www.robinwieruch.de/react-folder-structure/)
  — ⚠️ this specific phrasing came from a search-result synthesis, not a single verified primary page; treat as
  community consensus, not a cited rule.
- **Profy.dev's concrete criterion:** code moves from feature-specific to shared when it is "used on multiple
  pages"; demonstrated with a `todo-form` component moving to shared once both the home and create-todo pages
  need it — [Kettmann/Profy.dev](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- **Rule of three variant:** "shared types across 3+ features move to `shared/types/`" — a more conservative
  threshold — ⚠️ surfaced only via search synthesis of community posts; no authoritative primary source found.
- **Counter-norm — prefer duplication:** "If another feature needs this component, don't immediately move it to
  `ui`. Duplicating a small component is often cheaper than introducing a premature abstraction. Only after a
  component proves it's truly shared do you consider promoting it into `components/ui`." — ⚠️ again a community
  synthesis, unattributed to a single authoritative source.
- **FSD's structural answer:** the criterion is not a count but a *kind*. `Shared` is for "reusable,
  project-agnostic functionality"; `Entities` for business-domain objects; `Features` for reused product feature
  implementations; `Widgets` for large self-contained chunks. A component's home is determined by what it *is*,
  not by how many callers it has — [FSD Overview](https://feature-sliced.design/docs/get-started/overview)
- FSD warns against the count-based heuristic's failure mode: the restriction to extract code to another layer
  only when reused in multiple places "can lead to components being moved around or no longer being uniformly
  navigable" — ⚠️ paraphrase from search synthesis of FSD-review posts; see Gaps.
- **Wieruch's quantitative heuristic (for splitting, not promoting):** introduce domain/feature folders when the
  component count in a folder exceeds roughly **10–15** items
  — [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- **Bulletproof React's answer is directional, not numeric:** shared code lives in top-level `components/`,
  `hooks/`, `lib/`, `types/`, `utils/`, and those folders may not import from `features/` or `app/` — enforced by
  lint. The promotion decision is therefore forced by the import graph: the moment two features need something,
  the only legal home is the shared layer
  — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

### Inferences
- The lint rule *is* the promotion rule. Under Bulletproof React's zones, sharing between two features is
  literally unrepresentable except by moving the code up — so "rule of two" is not a style preference there, it
  is a mechanical consequence of the enforced import direction.
- The tension between "promote on second use" and "duplicate until proven" is unresolved in the literature and
  is probably the most honest thing to report: it is a judgement call, and the methodologies differ on whether
  to make the judgement or make the tooling decide.

### Gaps
- **I found no authoritative primary source establishing a "rule of three" for React components.** The
  "rule of three" is a general refactoring maxim (Fowler/WET), not something the React structure literature
  states. Any report claim of a canonical rule of three would be fabrication.
- The FSD "components get moved around / navigability" criticism could not be traced to an FSD-official page
  within budget; it appeared in search summaries of third-party FSD reviews. Flagged as unverified.

---

## Q5. Cross-feature imports: what rules, and how are they enforced in tooling?

### Takeaway
Two named rule systems exist: Bulletproof React's *no cross-feature imports + unidirectional shared→features→app*,
enforced with ESLint `import/no-restricted-paths` zones; and FSD's *layers strictly below + slice isolation*, with
a formal `@x` escape hatch for entity cross-references. Generic enforcement options are
`eslint-plugin-boundaries` (in-IDE) and `dependency-cruiser` (CI).

### Cited Findings

**Bulletproof React — the rules**
- "No cross-feature imports": features remain independent and are composed at the application level
  — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Unidirectional flow: shared → features → app. Shared may be used by anything; features import only from
  shared; app imports from features and shared
  — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

**Bulletproof React — the enforcement, verbatim shape**
```js
'import/no-restricted-paths': [
  'error',
  {
    zones: [
      // per-feature isolation (one zone per feature: auth, comments, discussions, teams, users…)
      { target: './src/features/auth', from: './src/features', except: ['./auth'] },

      // unidirectional enforcement
      { target: './src/features', from: './src/app' },
      {
        target: ['./src/components', './src/hooks', './src/lib', './src/types', './src/utils'],
        from: ['./src/features', './src/app'],
      },
    ],
  },
],
```
— [bulletproof-react docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Note the maintenance cost embedded in that config: feature isolation requires **one zone per feature**, listed
  by hand. It does not scale without codegen.

**FSD — the rules**
- The foundational rule, verbatim: "A module (file) in a slice can only import other slices when they are
  located on layers strictly below." — [FSD, Layers reference](https://feature-sliced.design/docs/reference/layers)
- "Modules on one layer can only know about and import from modules from the layers strictly below." Higher
  layers cannot reference sibling layers — [FSD Overview](https://feature-sliced.design/docs/get-started/overview)
- **Slice isolation:** slices within the same layer cannot import from one another — enforcing domain separation
  and preventing circular dependencies between features/entities
  — [FSD, Layers](https://feature-sliced.design/docs/reference/layers)
- **Exception:** App and Shared are "a layer and a slice at the same time" — they contain segments, not slices,
  and their segments "can import each other freely"
  — [FSD, Layers](https://feature-sliced.design/docs/reference/layers)
- **The `@x` cross-import escape hatch:** when entities genuinely relate (ownership, containment), a slice
  exposes a dedicated cross-import public API. E.g. `entities/artist/model/artist.ts` imports from
  `entities/song/@x/artist`, and `entities/song/@x/artist.ts` exports only the necessary types. This "makes the
  connection between the entities explicit and side-steps the slice isolation" while documenting the coupling
  that requires coordinated refactoring — [FSD, Layers](https://feature-sliced.design/docs/reference/layers)
- FSD's public API is the enforcement surface: only necessary parts exposed, no wildcard re-exports
  — [FSD, Public API](https://feature-sliced.design/docs/reference/public-api)

**Generic tooling**
- `eslint-plugin-boundaries` — ESLint plugin for architectural boundaries in JS/TS, giving real-time in-IDE
  feedback; suited to layered architectures, monorepos, preventing circular deps between modules
  — [eslint-plugin-boundaries overview](https://open-awesome.com/projects/eslint-plugin-boundaries); [npm/libraries.io](https://libraries.io/npm/eslint-plugin-boundaries)
- `dependency-cruiser` — standalone (non-ESLint) dependency analyzer/validator; described as "a more powerful and
  flexible way of accomplishing architecture goals", enforcing rules like "UI cannot import backend", "feature
  modules cannot depend on each other", "no circular dependencies", and producing graphs
  — [Xebia, "Taking Frontend Architecture Serious With Dependency-cruiser"](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/); [dev.to, "Avoid Cross Module Dependencies with Dependency Cruiser"](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- The documented division of labour: ESLint plugin for instant IDE feedback, dependency-cruiser for holistic
  CI/CD validation and graph output — [jmulholland.com, "6 Tools for Enforcing Good Web Architecture"](https://jmulholland.com/architecture-tools/)

### Inferences
- Bulletproof React and FSD prohibit the same thing (sibling coupling) but differ on the remedy. Bulletproof
  says *compose at the app layer* — push coupling upward. FSD says *declare the coupling explicitly* via `@x`,
  or introduce a Widget above both. FSD's answer preserves the coupling as documentation; Bulletproof's
  eliminates it by inversion. Neither source addresses the other's approach.
- Because Bulletproof React bans barrels, its features have no public API; the lint zones restrict *which
  directory* you may import from, not *which symbols*. FSD, by keeping barrels, restricts symbols too. So the
  barrel decision (Q2) directly determines the granularity of boundary enforcement available.

### Gaps
- **`steiger`, the official FSD architecture linter, did not appear in search results** and I could not verify
  its existence, scope or currency within budget. Do not assert it in the report without verification.
- No source found quantifying how often these lint rules are actually adopted, or how often teams disable them.

---

## Q6. How deep should nesting go, and what are the documented failure modes at scale?

### Takeaway
The only *numeric* nesting guidance from an official source is React's "maximum of three or four nested folders".
Documented failure modes differ per approach: type-based collapses on navigability, Atomic Design on
classification ambiguity, FSD on naming/learning-curve cost and index-file proliferation, folder-per-component
on boilerplate, and colocation on nothing found. The 2025–2026 addition is the server/client boundary as a new
structural axis.

### Cited Findings

**Nesting depth**
- "A maximum of three or four nested folders within a single project" — deeper nesting makes relative imports and
  file moves painful — [React legacy docs](https://legacy.reactjs.org/docs/faq-structure.html)
- The community mitigation is absolute imports via path aliases, which removes the relative-import pain that
  motivates the depth cap — [Kettmann/Profy.dev](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- FSD's fixed depth is effectively `layer / slice / segment / file` = 3 folders + file, which sits inside React's
  cap by construction — [FSD Overview](https://feature-sliced.design/docs/get-started/overview)

**Failure mode: type-based grouping at scale**
- Wieruch's implicit threshold: past ~10–15 components in a folder, type-based grouping fragments business logic
  and you need domain folders — [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- Screaming Architecture's framing of the failure: a type-first tree (`/components`, `/pages`, `/hooks`) screams
  "I'm a React app" rather than the business domain, harming discoverability and onboarding
  — [Martin, 2011](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html); [Kettmann/Profy.dev](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25)
- FSD's migration guide treats type-based structure ("components/hooks/utils") as the thing to migrate *away
  from*, replacing file-type grouping with purpose segments (`ui`, `api`, `model`, `lib`, `config`)
  — [FSD, migration from a custom architecture](https://feature-sliced.design/docs/guides/migration/from-custom)

**Failure mode: Atomic Design at scale**
- Frost himself preempts the two failure modes: teams treating the stages as a linear process, and treating the
  taxonomy as "rigid dogma" instead of adapting the vocabulary
  — [Brad Frost, Ch.2](https://atomicdesign.bradfrost.com/chapter-2/)
- The classification boundary is genuinely soft in the source definitions: molecules are "relatively simple"
  and organisms "relatively complex" — qualitative, so "is this a molecule or an organism?" has no decidable
  answer — [Brad Frost, Ch.2](https://atomicdesign.bradfrost.com/chapter-2/)

**Failure mode: FSD at scale (and at small scale)**
- FSD's own gate: "The most important question to ask your team when considering to switch to Feature-Sliced
  Design is — *do you really need it?*" and "some projects are perfectly fine without it". Valid triggers are
  hard onboarding, frequent unintended breakage in unrelated code, and cognitive overhead when adding features
  — [FSD, migration guide](https://feature-sliced.design/docs/guides/migration/from-custom)
- Social prerequisite: "Avoid switching to FSD against the will of your teammates, even if you are the lead";
  management buy-in matters because the benefits don't show up in velocity metrics
  — [FSD, migration guide](https://feature-sliced.design/docs/guides/migration/from-custom)
- Index-file proliferation is an acknowledged scaling problem: many index files "can slow down the development
  server"; mitigations are per-component index files in `shared/ui`/`shared/lib`, no index files in layered
  segments, and monorepo splitting for large projects — [FSD, Public API](https://feature-sliced.design/docs/reference/public-api)
- Reported adoption friction (⚠️ third-party, search-synthesis level, not FSD-official): difficulty naming
  slices, difficulty deciding between `lib` and `model`, productivity loss during the learning phase, a higher
  skill floor than "classic" architecture, and a tendency to invent custom layers when the real problem is poor
  decomposition (FSD's guidance being: if you think you need a new layer, you probably need better decomposition)
  — [dev.to, "Feature-Sliced Design Review"](https://dev.to/algoorgoal/feature-sliced-design-review-22k0); [codecentric, "Feature-Sliced Design and good frontend architecture"](https://www.codecentric.de/en/knowledge-hub/blog/feature-sliced-design-and-good-frontend-architecture)
- `Processes` layer deprecation is a concrete scaling lesson from FSD's own history: a layer for "complex
  inter-page scenarios" was specified and then retired — [FSD Overview](https://feature-sliced.design/docs/get-started/overview)

**Failure mode: Bulletproof React at scale**
- Per-feature isolation requires an ESLint zone *per feature*, hand-written
  — [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- The repo itself declines to be a standard: "not supposed to be a template, boilerplate or a framework… decide
  what works best for you and your team" — [bulletproof-react README](https://github.com/alan2207/bulletproof-react)

**The 2025–2026 structural axis: the server/client boundary (React 19 / RSC era)**
- `"use client"` "is used to declare a boundary between the Server and Client module graphs (trees)"; once a file
  is marked, all of its imports and directly rendered components are included in the client bundle
  — [Next.js docs, Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- Because Server Components cannot be imported *into* Client Components, the documented composition pattern is to
  pass server-rendered content down as `children` or named props (`header`, `footer`) — which is an architectural
  constraint on component *composition*, and therefore on where components can live
  — [Next.js docs](https://nextjs.org/docs/app/getting-started/server-and-client-components); [Nazar Boyko, "The Server/Client Boundary In Modern React Apps"](https://www.nazarboyko.com/articles/the-server-client-boundary-in-modern-react-apps)
- The emerging 2026 folder convention this produces: `/lib` as the application core (actions, queries, schemas)
  importing nothing from `/components` or `/app`; `/hooks` and `/stores` treated as explicitly client-side so
  that "any file in these directories implicitly requires `use client` in whatever imports them" — keeping the
  boundary visible in the filesystem — ⚠️ this is a secondary/low-authority formulation from a 2026 blog post,
  not an official convention — [groovyweb, "Next.js Folder Structure: Best Practices for 2026"](https://www.groovyweb.co/blog/nextjs-project-structure-full-stack)
- Vercel-adjacent framing of the same rule: components are Server Components by default; add `use client` only
  for browser APIs, hooks or interactivity; keep large UI on the server and isolate interactive leaves
  — [Next.js docs](https://nextjs.org/docs/app/getting-started/server-and-client-components); [builder.io, "5 Misconceptions about React Server Components"](https://www.builder.io/blog/nextjs-react-server-components)

### Inferences
- The server/client boundary is the one genuinely *new* structural force since 2023, and none of the named
  methodologies were designed for it. FSD's layer rules, Bulletproof's zones and Atomic Design's taxonomy are
  all silent on `"use client"`. A 2026 report should say so plainly: the established methodologies predate the
  constraint that now most strongly shapes file placement in Next.js apps.
- Because `"use client"` is transitive through imports, it behaves like an *additional*, invisible layer boundary
  cutting across whatever folder structure you chose. That is a strong argument for making it visible in the
  filesystem (the `/hooks` + `/stores` convention above) — but the argument is currently made by low-authority
  sources only.

### Gaps
- No official React 19 / react.dev guidance on project structure exists at all; the official statement is still
  the archived legacy FAQ. This is a genuine hole in the primary-source record, not a search failure.
- No authoritative source ties FSD or Bulletproof React to RSC/`"use client"` boundaries. If the report claims a
  reconciliation, it must be flagged as the report's own synthesis.
- "Modular monolith / DDD folder layouts" for frontend: I found no primary or authoritative frontend-specific
  source under that name. The closest rigorous equivalents in the React world are FSD (Entities layer ≈ DDD
  entities) and Screaming Architecture. Treat "modular monolith" as a backend term being borrowed, with no
  citable React canon behind it.

---

## Annotated Source List (PRIMARY DELIVERABLE)

Authority ratings: **official docs** · **recognized expert** · **community consensus** · **low**

### Official documentation

1. **Project structure and organization** — Next.js / Vercel — docs v16.3.7, lastUpdated **2026-07-21** —
   <https://nextjs.org/docs/app/getting-started/project-structure> — **official docs**.
   The only *current* first-party framework doc on the question. Unique contribution: the three named
   organization strategies, the guarantee that colocation in `app/` is routing-safe, private `_folder` and
   `(group)` conventions, and an explicit refusal to be opinionated.

2. **Getting Started: Server and Client Components** — Next.js / Vercel — current docs (fetched 2026-09-29) —
   <https://nextjs.org/docs/app/getting-started/server-and-client-components> — **official docs**.
   Establishes `"use client"` as a module-graph boundary and the children/named-prop composition pattern —
   the 2025–2026 structural constraint none of the named methodologies cover.

3. **File Structure (FAQ)** — React team — **legacy.reactjs.org (archived)** —
   <https://legacy.reactjs.org/docs/faq-structure.html> — **official docs, but LEGACY**.
   The only official React position: two approaches (by feature/route, by file type), the 3–4 folder nesting cap,
   and "don't spend more than five minutes on choosing a file structure." Flag as archived: react.dev has no
   successor page, so this remains the official word by default rather than by endorsement.

4. **Feature-Sliced Design — Overview** — feature-sliced.design maintainers — continuously updated (fetched
   2026-09-29) — <https://feature-sliced.design/docs/get-started/overview> — **official docs** (for FSD).
   Defines the layer stack (App/Processes-deprecated/Pages/Widgets/Features/Entities/Shared), slices, segments,
   the strictly-below import rule, and FSD's four stated goals.

5. **Feature-Sliced Design — Layers reference** — feature-sliced.design maintainers — current —
   <https://feature-sliced.design/docs/reference/layers> — **official docs**.
   The precise rules: "A module (file) in a slice can only import other slices when they are located on layers
   strictly below"; same-layer slice isolation; App/Shared as layer-and-slice with freely-importing segments; and
   the `@x` cross-import notation with a worked artist/song example.

6. **Feature-Sliced Design — Public API reference** — feature-sliced.design maintainers — current —
   <https://feature-sliced.design/docs/reference/public-api> — **official docs**.
   Uniquely valuable because FSD here *concedes the opposing side*: it cites TkDodo's anti-barrel post by name,
   admits many index files slow the dev server, prescribes mitigations, and bans wildcard re-exports outright.

7. **Feature-Sliced Design — Migration from a custom architecture** — feature-sliced.design maintainers —
   current — <https://feature-sliced.design/docs/guides/migration/from-custom> — **official docs**.
   The anti-adoption section: "do you really need it?", "some projects are perfectly fine without it", the three
   legitimate triggers, and the social prerequisite ("avoid switching to FSD against the will of your teammates").

### Recognized experts / canonical primary texts

8. **docs/project-structure.md, bulletproof-react** — Alan Alickovic (alan2207) — repo has 35.9k stars, MIT,
   ~271 commits on master; **file has no stated last-updated date** —
   <https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md> — **community consensus
   / recognized expert**.
   The de-facto reference feature-first layout: exact top-level and per-feature folder lists, the three rules
   (no barrels, no cross-feature imports, unidirectional shared→features→app), and a copy-pasteable
   `import/no-restricted-paths` zone config. The single most actionable source in this topic.

9. **bulletproof-react README** — Alan Alickovic — <https://github.com/alan2207/bulletproof-react> —
   **community consensus**.
   Supplies the authority signal (35.9k stars) *and* the self-limiting disclaimer: "not supposed to be a
   template, boilerplate or a framework… It is an opinionated guide." Also lists the full docs set.

10. **Colocation** — Kent C. Dodds (author of Testing Library, Epic React; long-standing React educator) —
    **2019-06-17** — <https://kentcdodds.com/blog/colocation> — **recognized expert**.
    The canonical statement of the principle ("Place code as close to where it's relevant as possible"), the
    anti-decay argument by analogy to code comments, and the only explicit *limits* on record: E2E tests and
    system-wide docs. Pre-RSC.

11. **Please Stop Using Barrel Files** — Dominik Dorfmeister / TkDodo (TanStack Query maintainer) —
    **2024-07-26** — <https://tkdodo.eu/blog/please-stop-using-barrel-files> — **recognized expert**.
    The strongest anti-barrel case with a measurement (11k → 3.5k modules in a Next.js app, ~68% fewer), the
    circular-import mechanism, the `optimizePackageImports` purity caveat, and the one sanctioned exception
    (library public APIs).

12. **Speeding up the JavaScript ecosystem — The barrel file debacle** — Marvin Hagemeister (Preact core team;
    JS tooling performance researcher) — **2023-10-08** —
    <https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/> — **recognized expert**.
    The quantitative backbone: module-count → load-time table (500→0.15s … 50,000→48.44s), extrapolated Jest and
    linter overheads (~1m18s / ~7min / ~20min), and the 60–80% improvement claim. Explains *why* per-file tools
    (Jest, ESLint) pay the cost repeatedly.

13. **Screaming Architecture** — Robert C. Martin (Uncle Bob) — **2011-09-30** —
    <https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html> — **recognized expert /
    canonical**.
    The origin of the term and the test frontend people quote: "When you look at the top level directory
    structure … do they scream: Health Care System, or Accounting System?" plus "Architectures should not be
    *supplied* by frameworks." Not React-specific; 2011; still the cited authority for feature-first naming.

14. **Atomic Design, Chapter 2** — Brad Frost — book published **2016** —
    <https://atomicdesign.bradfrost.com/chapter-2/> — **recognized expert / canonical, but DATED for app
    architecture**.
    Verbatim definitions of atoms/molecules/organisms/templates/pages, and — crucially for a balanced report —
    Frost's own caveats that it "is not a linear process", is "not rigid dogma", and that renaming the taxonomy
    (GE Design's Principles/Basics/Components/Templates/Features/Applications) is fine. Says nothing about hooks,
    data fetching, or server/client boundaries.

15. **React Folder Structure Best Practices [2026]** — Robin Wieruch (author of *The Road to React*; long-running
    React educator) — **last updated 2026-05-05** — <https://www.robinwieruch.de/react-folder-structure/> —
    **recognized expert**.
    The best "grow into it" source: the four-stage progression with concrete trees, the ~10–15-components
    threshold for introducing domain folders, the argument for keeping BOTH technical and domain folders, and a
    plain-language statement of unidirectional flow. Actively maintained into 2026.

16. **Delightful React File/Directory Structure** — Josh W. Comeau (author of *CSS for JS Devs*; widely followed
    React educator) — published **2022-03-15**, last updated **2025-12-03** —
    <https://www.joshwcomeau.com/react/file-structure/> — **recognized expert**.
    The most credible *pro-barrel* and *pro-flat* dissent: folder-per-component with `index.ts`, `.helpers.ts`
    and `.types.ts`; function-based flat top level (`components`, `hooks`, `helpers`, `utils`, `constants`) rather
    than features; and a direct rebuttal of the anti-barrel movement ("less than 1% of the modules that the
    bundler encounters will be barrel files"). Updated *after* TkDodo's post, so it is a considered position.

17. **Screaming Architecture — Evolution of a React folder structure** — Johannes Kettmann (Profy.dev) —
    **2022-02-25** — <https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25>
    — **recognized expert / community consensus**.
    The most concrete worked *migration* narrative: five stages from group-by-type to feature folders, the
    "used on multiple pages" promotion criterion with a real example, and three conventions (absolute imports via
    aliases, `index.js` as module public API, kebab-case to avoid OS case-sensitivity bugs). Pre-App-Router.

### Tooling sources

18. **Taking Frontend Architecture Serious With Dependency-cruiser** — Xebia (consultancy engineering blog) —
    date not captured — <https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/> —
    **community consensus**.
    Establishes dependency-cruiser as the CI-side enforcement option and the kinds of rules it expresses
    ("UI cannot import backend", "feature modules cannot depend on each other", no cycles).

19. **Avoid Cross Module Dependencies with Dependency Cruiser** — Jakub Andrzejewski (dev.to) — date not
    captured — <https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b> —
    **community consensus**.
    Practical framing of cross-module prohibition as a lintable rule.

20. **6 Tools for Enforcing Good Web Architecture** — J. Mulholland — date not captured —
    <https://jmulholland.com/architecture-tools/> — **low / community**.
    Only contribution used: the division of labour — ESLint plugin for instant IDE feedback vs dependency-cruiser
    for holistic CI validation and graphs.

21. **eslint-plugin-boundaries** — project overview page + npm metadata (v6.0.2) —
    <https://open-awesome.com/projects/eslint-plugin-boundaries> · <https://libraries.io/npm/eslint-plugin-boundaries>
    — **low (aggregator pages, not the project's own docs)**.
    Establishes the plugin exists and what it enforces. ⚠️ The project's own README/docs were not fetched; verify
    before quoting specifics.

### Secondary / weak sources — use with caution, attribution required

22. **Feature-Sliced Design Review** — "algoorgoal" (dev.to) —
    <https://dev.to/algoorgoal/feature-sliced-design-review-22k0> — **low**.
    Source of the FSD adoption-friction criticisms (slice naming, `lib` vs `model` ambiguity, learning-curve
    productivity loss). ⚠️ Only reached via search summary, not directly fetched.

23. **Feature-Sliced Design and good frontend architecture** — codecentric knowledge hub (German consultancy) —
    <https://www.codecentric.de/en/knowledge-hub/blog/feature-sliced-design-and-good-frontend-architecture> —
    **community consensus**.
    Independent (non-maintainer) assessment of FSD. ⚠️ Reached via search summary only; not directly fetched.

24. **"Move files around until it feels right"** — Dan Abramov, original tweet **deleted**; preserved second-hand
    — <https://dev.to/dance2die/move-files-around-until-it-feels-right-2lek> ·
    <https://sung.codes/blog/2018/11/18/move-files-around-until-it-feels-right/> — **low provenance, high
    influence**.
    ⚠️ The primary source no longer exists. If the report uses the quote, it must say the tweet was deleted and
    that the surviving attribution is second-hand. The same secondary sources also record the standard
    objection: in a team, "different things will feel right for different persons", making the advice
    unactionable professionally.

25. **Next.js Folder Structure: Best Practices for 2026** — groovyweb (agency blog) —
    <https://www.groovyweb.co/blog/nextjs-project-structure-full-stack> — **low**.
    Only contribution used: the emerging `/lib`-as-core + `/hooks`,`/stores`-as-explicitly-client convention that
    makes the `"use client"` boundary visible in the filesystem. ⚠️ Agency SEO content; the convention is
    plausible and useful but is NOT an official or expert-endorsed pattern. Attribute as emergent practice only.

26. **5 Misconceptions about React Server Components** — Builder.io — <https://www.builder.io/blog/nextjs-react-server-components>
    — **community consensus**.
    Corroborates the server-by-default / isolate-interactive-leaves guidance. Vendor blog; used only where it
    agrees with the official Next.js docs.

27. **The Server/Client Boundary In Modern React Apps** — Nazar Boyko — <https://www.nazarboyko.com/articles/the-server-client-boundary-in-modern-react-apps>
    — **low**.
    Corroborating restatement of the children/named-props composition pattern. ⚠️ Reached via search summary only.

### Sources deliberately NOT used
- Medium/dev.to listicles titled "the best architecture" (e.g. "Feature-Sliced Design is the best architecture.
  Prove me wrong!") were excluded as advocacy without evidence.
- Barrel-file Medium reposts (multiple near-identical "Barrel Files: Why index.ts Re-Exports Hurt Tree Shaking"
  articles across medium.com / dev.to / reactuse.com) were excluded as derivative of TkDodo and Hagemeister;
  their bundle-size claims (e.g. "85% reduction to 200 KB") are unverified and out of architectural scope anyway.

### Notable absences in the source record (report-relevant)
- **No react.dev (React 19) page on project structure exists.** The official statement is the archived legacy
  FAQ. This should be stated in the report as a finding, not glossed.
- **No first-party engineering-blog source from Vercel, Shopify, Airbnb or Spotify on React folder taxonomy** was
  found. Do not imply big-tech endorsement of any named methodology.
- **No authoritative "rule of three" for React component promotion.** The rule of three is a general refactoring
  maxim; the React structure literature states "second consumer" or "used on multiple pages" instead.
- **`steiger` (the reputed official FSD linter) could not be verified** in this research pass.
- **No widely-cited conference talk or RFC** specifically on React project structure surfaced. React's RFC
  process has not addressed file organization.
