# Where non-component code belongs: constants, utils/helpers, types, config (React + TypeScript, 2025–2026)

Scope note: architecture and organization only. Performance, tree-shaking and bundle-size arguments are
deliberately excluded, even where a cited source raises them (e.g. Bulletproof React's barrel-file rule is
motivated by Vite tree-shaking — recorded here only because it is a *structural* rule about `index.ts` files).

---

## 1. CONSTANTS: global `constants.ts`, feature-local, or colocated?

### Takeaway
No authoritative source endorses a single global `constants.ts`. The consistent prescription across
authoritative and expert sources is: colocate by default, promote to the narrowest shared scope only on the
second consumer, and name the module after its *domain* (`routes`, `queryKeys`, `config`) rather than after the
category "constants". For TypeScript specifically, the official handbook now points away from `enum` toward
`as const` objects / literal unions.

### Cited Findings

**Placement**
- Kent C. Dodds' colocation principle: "Place code as close to where it's relevant as possible", and Dan
  Abramov's maxim "Things that change together should be located as close as reasonable". He argues explicitly
  against premature extraction into a shared `utils/` folder, with the failure mode that an extracted helper
  (and its tests) outlives the component it was extracted from and is never deleted —
  [Colocation, Kent C. Dodds, 2019-06-17](https://kentcdodds.com/blog/colocation)
- Robin Wieruch's rule for promotion: feature-specific utilities stay inside the feature folder until "two or
  more features need it", at which point they are promoted to a shared `utils/`; "Only reusable hooks end up in
  the new hooks/ folder" — [React Folder Structure Best Practices, Robin Wieruch, updated 2026-05-05](https://www.robinwieruch.de/react-folder-structure/)
- Bulletproof React keeps a top-level `config` folder for "Global configurations and environment variables",
  and each feature folder may contain its own `api`, `components`, `hooks`, `stores`, `types`, `utils` — with
  the instruction to "include only necessary folders per feature" —
  [Project Structure, Bulletproof React (alan2207)](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- FSD gives constants a *purpose-named* home rather than a category-named one: `shared/config` holds
  "environment variables, global feature flags, and app-wide configuration", and `shared/routes` holds "route
  constants/patterns"; `<slice>/config` holds "configuration files and feature flags" for that slice —
  [Layers, Feature-Sliced Design](https://feature-sliced.design/docs/reference/layers) and
  [Slices and segments, FSD](https://feature-sliced.design/docs/reference/slices-segments)

**Query keys (a concrete constants case)**
- TkDodo (Dominik Dorfmeister, TanStack Query maintainer): "I don't believe that storing all your Query Keys
  globally in `/src/utils/queryKeys.ts` will make things better." He recommends keys colocated next to their
  queries in a feature directory (`/src/features/Todos/queries.ts`), one *query key factory per feature*,
  ordered most-generic → most-specific, and cites Kent C. Dodds' colocation as the rationale —
  [Effective React Query Keys, TkDodo, 2021-06-13 (upd. 2022-04-23)](https://tkdodo.eu/blog/effective-react-query-keys)

**Magic numbers/strings → named constants**
- Martin Fowler's refactoring catalog contains "Replace Magic Literal" (formerly "Replace Magic Number with
  Symbolic Constant"): the unexplained literal `9.81` becomes the named constant `STANDARD_GRAVITY` —
  [Replace Magic Literal, refactoring.com (Martin Fowler)](https://refactoring.com/catalog/replaceMagicLiteral.html)
- Naming: Google's style guide restricts `CONSTANT_CASE` to module-level symbols — "Only symbols declared on
  the module level, static fields of module level classes, and values of module level enums, *may* use
  `CONST_CASE`" — and frames it as an *intent* signal: it "indicates that a value is *intended* to not be
  changed, and *may* be used for values that can technically be modified" —
  [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- Airbnb is stricter and narrower: uppercase is permitted only when the variable is exported, is `const`, and
  "the programmer can trust it (and its nested properties) to never change"; rationale — "UPPERCASE_VARIABLES
  are letting the programmer know that they can trust the variable (and its properties) not to change."
  Nested properties inside an exported object stay lowercase (rule 23.10) —
  [Airbnb JavaScript Style Guide](https://javascript.airbnb.tech/)

**enum vs const object vs union (TypeScript 5.x)**
- Official handbook, "Objects vs Enums": "In modern TypeScript, you may not need an enum when an object with
  `as const` could suffice." Rationale given: "The biggest argument in favour of this format over TypeScript's
  `enum` is that it keeps your codebase aligned with the state of JavaScript, and when/if enums are added to
  JavaScript then you can move to the additional syntax." The documented extraction idiom is
  `type Direction = typeof ODirection[keyof typeof ODirection]` —
  [Handbook: Enums, TypeScript (site shows last-updated 2026-09-28)](https://www.typescriptlang.org/docs/handbook/enums.html)
- Google **forbids** `const enum` but keeps plain `enum`: "Code *must not* use `const enum`; use plain `enum`
  instead" — because `const enum` makes the declaration invisible to JavaScript consumers —
  [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- Stefan Baumgartner's "Tidy TypeScript" argues for literal unions over enums on three grounds: enums emit
  runtime code and "work exceptionally different than any other type in TypeScript"; numeric enums leak type
  safety ("a function that takes a direction also takes any number value"); string enums are *nominally* typed,
  which "contradicts TypeScript's structural type system". For enum-like ergonomics he proposes
  `const Status = {...} as const` plus `type Values<T> = T[keyof T]` —
  [Tidy TypeScript: Prefer union types over enums, fettblog.eu, 2020-11-19](https://fettblog.eu/tidy-typescript-avoid-enums/)
  (fettblog.eu is Stefan Baumgartner's blog — author of *TypeScript in 50 Lessons*; the page footer links
  oida.dev / @deadparrot, his other properties. Recognized expert, but the post predates TS 5.x.)

### Inferences
- The two mainstream positions on enums are compatible with each other in practice: the handbook and community
  experts steer toward `as const` + derived union; Google's guide keeps `enum` legal but bans `const enum`.
  There is no source that *requires* enums. For a 2026 codebase, `as const` object + `typeof X[keyof typeof X]`
  is the safest default, with literal unions where no runtime object is needed.
- Because `CONSTANT_CASE` is (per both Google and Airbnb) reserved for module-level exported immutables, a
  file full of `CONSTANT_CASE` names is itself a smell that the file is a category bucket rather than a module.
- The strongest defensible rule for route paths and query keys is FSD's: a purpose-named module
  (`shared/routes`, `features/x/queries.ts`), not `constants/`.

### Gaps
- No authoritative source found that explicitly rules on "route path constants: central vs per-feature" for
  React Router / Next.js App Router. FSD's `shared/routes` is the closest prescription; Next.js file-system
  routing makes the question partly moot but no official Next.js guidance on a route-constants module was found.
- No official source found stating a threshold ("used in N places") for extracting a constant; Wieruch's "two
  or more features" is the only concrete number, and it is his own convention.

---

## 2. UTILS vs HELPERS: real distinction or folklore?

### Takeaway
**Folklore.** After targeted searching, *no* official documentation, style guide, or recognized-expert source
endorses a semantic `utils/` (generic) vs `helpers/` (domain-specific) split. The distinction traces to blog
posts and forum answers only. Meanwhile the *counter-argument* — that such folders are junk drawers and a
naming failure — is backed by named, high-standing authors (Martin Fowler, Dave Cheney) and by FSD's official
documentation.

### Cited Findings

**The claimed distinction, and its actual provenance**
- The widely repeated formulation is "A helper is something specific to a given project, while a utility is a
  generic function that accomplishes an abstract task" — a personal blog post, no authoritative citation —
  [utils vs helpers, Stephen Charles Weiss](https://stephencharlesweiss.com/utils-vs-helpers/) (fetch returned
  HTTP 503 at time of research; the formulation is quoted from search-result text, so treat the exact wording
  as unverified). Same claim restated, also without authority, in
  [Exploring the Contrast: Helpers and Utils Demystified, dev.to](https://dev.to/victor1890/exploring-the-contrast-helpers-and-utils-demystified-47bo)
  and in a 2016 GitHub issue thread asking the question outright —
  [What's the differences between helpers and utils? #808, react-redux-universal-hot-example](https://github.com/erikras/react-redux-universal-hot-example/issues/808)
- The framing appears in Q&A/aggregator content too ("Some teams split these: utils/ is generic and
  copy-pasteable across projects, helpers/ is project-specific"), e.g.
  [Difference between helpers and utils, oscarmromero.com, 2024-01-21](https://oscarmromero.com/tip/2024/01/21/method_types.html)
  and [Libs vs Utils vs Services Folders, Medium](https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f).
  Authority: low in every case.

**The counter-argument (the strong side)**
- Martin Fowler, on the word itself: "Usually I treat the word 'helper' on a class as a red flag as it usually
  indicates a poorly thought out abstraction." (He allows one narrow exception — an *embedment helper* that
  exists only as support to a host template file.) —
  [bliki: Embedment Helper, Martin Fowler, 2007-03-26](https://martinfowler.com/bliki/EmbedmentHelper.html)
- Dave Cheney: packages named `utils`, `helpers`, `base`, `common` "describe what a package *contains* rather
  than what it *provides*" and are a design failure. Two origins: extracting helpers to break import cycles
  (producing "junk drawers"), and extracting commonality between related components (an artificial
  abstraction). His remedies: move the function into the calling package (accepting duplication — he quotes
  Sandi Metz, "duplication is far cheaper than the wrong abstraction"), or create several focused packages with
  descriptive names, citing `net/http` as the exemplar —
  [Avoid package names like base, util, or common, Dave Cheney, 2019-01-08](https://dave.cheney.net/2019/01/08/avoid-package-names-like-base-util-or-common)
- FSD documentation states it directly: lib folders "should not be treated as helpers or utilities" — it links
  out to why such folders "often turn into a dump", requires each `shared/lib` library to have "one area of
  focus, for example, dates, colors, text manipulation, etc.", and asks teams to document each library's
  purpose in a README —
  [Layers, Feature-Sliced Design](https://feature-sliced.design/docs/reference/layers)
- Kent C. Dodds' concrete decay mechanism for `utils/`: the extracted function and its test survive the
  deletion of the only component that used it —
  [Colocation, Kent C. Dodds, 2019-06-17](https://kentcdodds.com/blog/colocation)
- Community-level restatements of the anti-pattern, useful as corroboration but not as authority: the
  "dunghill anti-pattern" (utils/helpers as an accumulating pile of unrelated functions) —
  [Dunghill Anti-Pattern, Matti Lehtinen](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/);
  "Anti-Patterns and Worst Practices — Utils Class" —
  [Chris Missal, Los Techies, 2009-06-01](https://lostechies.com/chrismissal/2009/06/01/anti-patterns-and-worst-practices-utils-class/);
  "The utility module antipattern" (proposes splitting the module and naming each submodule) —
  [Yang Lin Zhao](https://www.yanglinzhao.com/posts/utils-antipattern/);
  "Utils classes considered harmful and how to do better" —
  [Jerome Thibaud](https://www.jeromethibaud.com/en/blog/utils-considered-harmful/);
  [OOP Anti-Patterns: Utility or Helper Classes, ralin.io](http://ralin.io/blog/oop-anti-patterns-utility-or-helper-classes.html);
  and a directory-naming variant of the same argument —
  [Application directories named as architectural patterns antipattern, teotti.com](https://teotti.com/application-directories-named-as-architectural-patterns-antipattern/)

**Where sources DISAGREE**
- Bulletproof React and Robin Wieruch both keep a `utils/` folder as a normal part of the structure (Wieruch
  organizes inside it by function, e.g. `utils/format/date-time/`) —
  [Bulletproof React project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md);
  [Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/). FSD explicitly rejects that naming
  approach, requiring segment names that "describe the purpose of the content, not its essence" and calling
  `components`, `hooks` and `types` "bad segment names" —
  [Slices and segments, FSD](https://feature-sliced.design/docs/reference/slices-segments)
- Note the partial reconciliation: Wieruch's `utils/format/date-time/` and FSD's "one area of focus… dates,
  colors, text manipulation" describe the *same* internal organization; they disagree only on whether the
  outer folder may be called `utils`.

### Inferences
- The honest answer for a style guide: the utils/helpers semantic split is a team convention with no
  authoritative backing. If a codebase has both folders, the boundary will not survive contact with new
  developers; picking one name and enforcing *internal* domain submodules is the defensible position.
- All the anti-pattern arguments reduce to one testable rule: a module's name must let you predict its
  contents. `utils` fails; `formatCurrency`/`date`/`colors` pass. This is the bridge to question 3.

### Gaps
- No source was found that *defends* the utils-vs-helpers distinction from a position of authority (official
  docs, framework maintainer, or named style guide). If the report needs a "strongest pro" source, the best
  available is a personal blog — that asymmetry should be stated plainly in the report.

---

## 3. Naming modules by what they DO vs by category

### Takeaway
This is the one point where official docs, style guides and experts converge: name the module after its
purpose/capability (`formatCurrency.ts`, `date.ts`, `routes.ts`, `queries.ts`), not after the kind of thing
inside it (`utils.ts`, `helpers.ts`, `types.ts`, `constants.ts`).

### Cited Findings
- FSD, normatively: "Make sure that the name of these segments describes the purpose of the content, not its
  essence. For example, `components`, `hooks`, and `types` are bad segment names because they aren't that
  helpful when you're looking for code." —
  [Slices and segments, Feature-Sliced Design](https://feature-sliced.design/docs/reference/slices-segments)
- Dave Cheney: name packages "after their purpose and what they enable users to do"; `net/http` uses
  descriptive *filenames* inside one cohesive package instead of `client`/`server` packages —
  [Dave Cheney, 2019-01-08](https://dave.cheney.net/2019/01/08/avoid-package-names-like-base-util-or-common)
- Airbnb ties the filename to the export, which mechanically produces do-named files: "A base filename should
  exactly match the name of its default export" (23.6); "Use camelCase when you export-default a function. Your
  filename should be identical to your function's name" (23.7) — i.e. `makeStyleGuide()` lives in
  `makeStyleGuide.js`; "Use PascalCase when you export a constructor / class / singleton / function library /
  bare object" (23.8) — [Airbnb JavaScript Style Guide](https://javascript.airbnb.tech/)
- Bulletproof React enforces mechanical consistency instead, via `eslint-plugin-check-file`: all `*.{ts,tsx}`
  files `KEBAB_CASE`, all folders under `src` (except `__tests__`) `KEBAB_CASE`, "This can help you to keep
  your codebase consistent and easier to navigate" —
  [Project Standards, Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)
- React's official docs apply the same "name for purpose" idea to hooks: good custom hooks are "named after
  their purpose" (`useChatRoom`, `useImpressionLog`, `useOnlineStatus`), while `useMount` / `useEffectOnce` /
  `useUpdateEffect` are called out as bad because they wrap the API rather than a use case —
  [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)

### Inferences
- Airbnb's filename-matches-export rule and FSD's purpose-over-essence rule conflict with each other only on
  *case* (camelCase vs kebab-case), not on substance. A project must pick a case convention; kebab-case +
  ESLint enforcement (Bulletproof React) is the more common 2025–2026 choice in React codebases and avoids
  case-insensitive-filesystem problems on Windows/macOS.

### Gaps
- No source found that quantifies a limit (e.g. max functions per module) before a do-named module should split.

---

## 4. TYPES: colocated, `types.ts` per feature, global `types/`, or derived from schemas?

### Takeaway
The dominant expert prescription is a three-tier rule: inline/colocate single-use types → move shared types to
the *narrowest* shared file → move cross-package types to a shared package. A global `src/types/` folder is
tolerated by Bulletproof React (for genuinely app-wide types) but is explicitly *not* what "shared location"
means for Matt Pocock, and FSD names `types` a bad segment name.

### Cited Findings
- Matt Pocock's three rules (Total TypeScript): (1) "When a type is used in only one place, put it in the same
  file where it's used" — he argues against separate `*.types.ts` files for single-use types because editing a
  component and its types together becomes harder, and encourages inlining types into signatures; (2) "Types
  that are used in more than one place should be moved to a shared location" — a `*.types.ts` file at the
  *smallest scope needed*; (3) "Types that are used in more than one package in a monorepo should be moved to a
  shared package" (he references Turborepo internal packages) —
  [Where To Put Your Types in Application Code, Matt Pocock](https://www.totaltypescript.com/where-to-put-your-types-in-application-code)
  (no publication date shown on the page). Search-result summaries of the same article add that "a 'shared
  location' does not mean a `src/types/` folder, but rather the narrowest boundary that contains all
  consumers", e.g. a feature-level file when a type is used by a service, a Server Action and components of the
  same feature — that specific phrasing came from search snippets, not from the fetched body, so treat it as
  a paraphrase.
- Bulletproof React keeps both levels: top-level `types` = "Shared TypeScript types", plus a per-feature
  `types` folder for "Feature-specific TypeScript types" —
  [Project Structure, Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Wieruch: types live "in feature-level `types.ts` files or a top-level `types/` folder" —
  [Robin Wieruch, updated 2026-05-05](https://www.robinwieruch.de/react-folder-structure/)
- FSD places types by purpose, not in a `types` bucket: `api` holds "request functions, data types, mappers",
  `model` holds "schemas, interfaces, stores, and business logic"; and `types` is explicitly listed as a bad
  segment name —
  [Layers](https://feature-sliced.design/docs/reference/layers);
  [Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- Derivation from schemas: "Zod infers a static type from your schema definitions. You can extract this type
  with the `z.infer<>` utility"; `z.input<>` / `z.output<>` exist separately for schemas with transforms
  (current line: Zod 4.x) — [Zod basics, zod.dev](https://zod.dev/basics)
- Barrel files: Bulletproof React recommends against them — "It can cause issues for Vite to do tree shaking
  and can lead to performance issues. Therefore, it is recommended to import the files directly." (Recorded as
  a structural rule; the stated motivation is out of this report's scope.) —
  [Project Structure, Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Type-only import/export syntax (relevant to type modules): Google permits but does not require it — "You may
  use `import type {...}` when you use the imported symbol only as a type. Use regular imports for values",
  both `import type {Foo} from './foo'` and `import {type Foo, Bar} from './foo'` are acceptable, and "Use
  `export type` when re-exporting a type" —
  [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- Interfaces vs type aliases for objects — Google: "when declaring types for objects, use interfaces instead of
  a type alias for the object literal expression", justified as variation reduction: "These forms are nearly
  equivalent, so under the principle of just choosing one out of two forms to prevent variation, we should
  choose one." — [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

### Where sources DISAGREE
- Global `types/` folder: Bulletproof React and Wieruch keep one; FSD forbids the name; Pocock's rule 2 points
  to the narrowest scope instead. No source claims a global `types/` is *required*.
- Google prescribes `interface` for object types; Matt Pocock's rules are silent on interface-vs-type and
  concern *location* only — these are orthogonal, not contradictory, but a style guide must decide both.

### Inferences
- The schema-derivation pattern (`z.infer`) resolves the client/server type-sharing question structurally: the
  shared artifact is the *schema module*, and both sides derive types from it, so there is no parallel
  hand-written type to drift. This matches Pocock's rule 3 (cross-package types live in a shared package) —
  the shared package simply exports schemas rather than bare types.
- Because Zod is a runtime value, a schema module cannot be a type-only module; it belongs in a purpose-named
  module (FSD `api`/`model`, or a shared contracts package), not in `types/`.

### Gaps
- No official Zod documentation statement found that recommends schemas as the *single source of truth* for
  types, or that discusses client/server schema sharing — the inference capability is documented, the
  architectural recommendation is not.
- No authoritative source found for or against `types/index.ts` barrel files *specifically* (as opposed to
  barrels generally).
- Matt Pocock's article carries no visible publication/update date, so its currency relative to TS 5.x cannot
  be confirmed from the page.

---

## 5. CONFIG and environment variables

### Takeaway
Both major structural methodologies give configuration its own purpose-named home (`src/config` in Bulletproof
React, `shared/config` in FSD), and the 2025–2026 convention is a single boundary module that validates
`process.env` against a Zod schema at startup and exports a typed object, with hard client/server separation.

### Cited Findings
- Bulletproof React: top-level `config` = "Global configurations and environment variables" —
  [Project Structure, Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- FSD: `shared/config` = "environment variables, global feature flags, and app-wide configuration"; slice-level
  `config` = "configuration files and feature flags" —
  [Layers](https://feature-sliced.design/docs/reference/layers);
  [Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
- t3-env states the problem it exists to solve: "Forgetting environment variables during build can be a hassle
  and difficult to debug if a bug is caused by a missing environment variable." Pattern: define a schema,
  parse `process.env` against it, and (for the manual approach) extend `NodeJS.ProcessEnv` for autocomplete —
  [Introduction, t3-env (env.t3.gg)](https://env.t3.gg/docs/introduction)
- t3-env's client/server rule, enforced at runtime via a Proxy + safe parsing: "Your server variables will be
  undefined on the client, and attempting to access one will throw a descriptive error message to ease
  debugging." — [t3-env docs](https://env.t3.gg/docs/introduction)
- The mechanism is Zod's inference: a validated env object is typed by `z.infer` from the same schema —
  [Zod basics](https://zod.dev/basics)
- Absolute imports as part of the config story: Bulletproof React sets `baseUrl: "."` and
  `paths: { "@/*": ["./src/*"] }` so that `src/components/my-component` is `@/components/my-component` instead
  of `../../../components/my-component` —
  [Project Standards, Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)

### Inferences
- The validated-env module is the clearest counter-example to the "constants folder" habit: it is a *boundary*
  module (parses untrusted input, fails fast at startup) rather than a bag of values, which is why every source
  gives it a dedicated purpose-named location.
- t3-env's guarantee only holds if nothing else in the app reads `process.env` directly; enforcing that
  (e.g. an ESLint restriction on `process.env` outside `config/env.ts`) is the architectural corollary. No
  source found states this rule explicitly — flagged as inference, not citation.

### Gaps
- The fetched t3-env introduction does not say where the env module should live on disk (`src/env.ts` vs
  `src/config/env.ts`); no official statement found.
- No date/version information is exposed on the t3-env docs page fetched.

---

## 6. What the methodologies prescribe, precisely

### Takeaway
Bulletproof React = feature folders + a fixed list of shared top-level folders + ESLint-enforced unidirectional
imports. FSD = a fixed layer hierarchy, business-domain slices, and a fixed set of purpose-named *segments*
(`ui`, `api`, `model`, `lib`, `config`) that replace category folders entirely.

### Cited Findings

**Bulletproof React**
- `src/` top level: `app` (routes, main component, provider, router), `assets`, `components` (shared
  components), `config` (global config + env vars), `features` (primary organization), `hooks` (app-wide shared
  hooks), `lib` ("Preconfigured reusable libraries"), `stores` (global state), `testing` (test utils + mocks),
  `types` (shared types), `utils` (shared utility functions) —
  [Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- `src/features/[feature-name]/`: `api`, `assets`, `components`, `hooks`, `stores`, `types`, `utils`; "Include
  only necessary folders per feature." — same source
- Unidirectional rule, quoted: "the code should flow in one direction, from shared parts of the code to the
  application (shared -> features -> app)" — same source
- Enforced by `import/no-restricted-paths` with (a) one zone per feature banning cross-feature imports
  (`target: './src/features/auth', from: './src/features', except: ['./auth']`, repeated for comments,
  discussions, teams, users) and (b) two unidirectional zones:
  `{ target: './src/features', from: './src/app' }` and
  `{ target: ['./src/components','./src/hooks','./src/lib','./src/types','./src/utils'], from: ['./src/features','./src/app'] }`
  — i.e. the shared set is exactly components/hooks/lib/types/utils — same source
- Naming/tooling: kebab-case files and folders via `check-file/filename-naming-convention` and
  `check-file/folder-naming-convention`; `@/*` absolute imports; barrel files discouraged in favour of direct
  imports —
  [Project Standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md),
  [Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

**Feature-Sliced Design — the segment model, precisely**
- Five standardized segments, verbatim definitions: `ui` — "everything related to UI display: UI components,
  date formatters, styles, etc."; `api` — "backend interactions: request functions, data types, mappers, etc.";
  `model` — "the data model: schemas, interfaces, stores, and business logic"; `lib` — "library code that other
  modules on this slice need"; `config` — "configuration files and feature flags" —
  [Slices and segments, FSD](https://feature-sliced.design/docs/reference/slices-segments)
- Hierarchy: slices (business domains) sit *above* segments (technical nature); custom segments are allowed,
  especially in the App and Shared layers where business slices don't apply, but must still be purpose-named —
  same source
- Shared layer specifics: it "does not contain slices", files inside may reference each other freely, and it is
  organized into segments by purpose. `shared/api` = backend client + endpoint request functions;
  `shared/ui` = the UI kit, no business logic (business-themed assets like logos and UI-logic components like
  autocomplete are acceptable); `shared/lib` = a *collection of focused internal libraries*, each with "one
  area of focus, for example, dates, colors, text manipulation, etc."; `shared/config` = env vars, global
  feature flags, app-wide config; also `shared/routes` (route constants/patterns) and `shared/i18n`
  (translation setup) — [Layers, FSD](https://feature-sliced.design/docs/reference/layers)
- Governance requirement, unique to FSD: lib folders "should not be treated as helpers or utilities"; teams
  must set explicit inclusion criteria and document each library's purpose in a README — same source

### Inferences
- The two methodologies disagree on exactly one thing relevant to this report: Bulletproof React keeps
  category-named shared folders (`utils`, `types`, `hooks`, `components`) and makes them safe by *enforcing
  direction* with ESLint; FSD forbids those names and makes them safe by *enforcing purpose*. A project can
  adopt FSD naming inside Bulletproof React's enforcement mechanism — the ESLint zone approach is orthogonal to
  segment naming.
- Bulletproof React's `lib` ("preconfigured reusable libraries") and FSD's `shared/lib` ("focused internal
  libraries") are the same concept under the same name, and in both cases `lib` means *configured third-party
  integration or a real internal library*, not a bag of functions. This is the one non-folklore distinction
  available between `lib` and `utils`.

### Gaps
- FSD's docs link out to an external article explaining why lib folders "turn into a dump"; that target article
  was not fetched, so its author/argument is unverified here.
- Bulletproof React's docs carry no publication or last-updated dates in the markdown files themselves
  (repository `master` branch as of 2026-09); currency was not independently verified.

---

## 7. When should a helper become a custom hook — or a method on a domain model?

### Takeaway
For hooks there is an unambiguous official answer from react.dev: a function becomes a hook only if it calls
hooks; otherwise it must stay a plain function without the `use` prefix. For "helper → method on a domain
model" there is classic OO guidance (Fowler, Cheney) but no React/TypeScript-specific authoritative rule.

### Cited Findings
- react.dev, explicit: "If your function doesn't call any Hooks, avoid the `use` prefix. Instead, write it as a
  regular function *without* the `use` prefix." Illustrated with `useSorted(items)` (🔴) → `getSorted(items)`
  (✅). Stated benefit: a plain function can be called conditionally, a hook cannot —
  [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Naming rule: "Hook names must start with `use` followed by a capital letter"; "Hooks may return arbitrary
  values." — same source
- When to extract: "Whenever you write an Effect, consider whether it would be clearer to also wrap it in a
  custom Hook. You shouldn't need Effects very often, so if you're writing one, it means that you need to 'step
  outside React' to synchronize with some external system…" — same source
- Design constraint: "Keep custom Hooks focused on concrete high-level use cases. Avoid creating and using
  custom 'lifecycle' Hooks that act as alternatives and convenience wrappers for the `useEffect` API itself"
  (`useMount`, `useEffectOnce`, `useUpdateEffect` named as 🔴); "A good custom Hook makes the calling code more
  declarative by constraining what it does." — same source
- Toward domain models: Fowler's red flag on "helper" class names "usually indicates a poorly thought out
  abstraction" — i.e. the helper is a symptom that behaviour belongs on a real abstraction —
  [bliki: Embedment Helper, Martin Fowler, 2007-03-26](https://martinfowler.com/bliki/EmbedmentHelper.html)
- Cheney's remedy is the procedural version of the same move: put the function in the package that calls it,
  or create a focused, descriptively named package —
  [Dave Cheney, 2019-01-08](https://dave.cheney.net/2019/01/08/avoid-package-names-like-base-util-or-common)
- FSD's `model` segment is where domain behaviour is supposed to live: "schemas, interfaces, stores, and
  business logic" — [Slices and segments, FSD](https://feature-sliced.design/docs/reference/slices-segments)

### Inferences
- Combining react.dev with FSD gives a usable decision tree: does it call hooks / need React state or an
  external-system subscription → custom hook, named for the use case; is it pure and domain-specific →
  `model` (or the feature's purpose-named module); is it pure and domain-agnostic with a single area of focus →
  `shared/lib/<focus>`; is it a configured third-party integration → `lib`.
- react.dev's "constrain what it does" criterion is the same criterion as FSD's purpose-over-essence naming
  rule, applied to functions instead of folders.

### Gaps
- No authoritative React/TypeScript source found that discusses converting helper functions into methods on a
  domain class/model (the classic OO guidance is from Fowler's Java/Ruby-era writing, 2007, and Cheney's Go
  writing, 2019). Anyone making that recommendation for a React codebase is extrapolating.
- No official source found on when a helper should become a *server-side* concern instead (e.g. moved behind an
  API boundary); out of the searched scope.

---

## Annotated source list (primary deliverable)

Authority ratings: **Official docs** · **Recognized expert** · **Community consensus** · **Low**

| # | Source | Author / Org | Date | Authority | Unique contribution |
|---|---|---|---|---|---|
| 1 | [Handbook: Enums](https://www.typescriptlang.org/docs/handbook/enums.html) | Microsoft / TypeScript team | site shows last-updated 2026-09-28 (build date) | Official docs | The only *official* statement steering away from `enum`: "you may not need an enum when an object with `as const` could suffice", plus the `typeof X[keyof typeof X]` extraction idiom. |
| 2 | [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) | Google | living document, undated | Official docs (org-internal standard) | Normative `CONSTANT_CASE` scoping, the hard ban "Code must not use `const enum`", interface-over-type-alias for objects, and `import type` / `export type` rules. |
| 3 | [Airbnb JavaScript Style Guide](https://javascript.airbnb.tech/) | Airbnb | living document; note `airbnb.io/javascript` now 301-redirects to `javascript.airbnb.tech` | Community consensus (de-facto standard) | Filename-matches-default-export rules (23.6–23.8) and the narrow three-condition test for UPPERCASE constants (23.10). |
| 4 | [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Alan Alickovic (alan2207) | repo `master`, files undated | Community consensus (widely cited reference architecture) | The exact shared-folder list, the per-feature folder list, the "shared → features → app" rule, the full `import/no-restricted-paths` zones, and the anti-barrel-file rule. |
| 5 | [Bulletproof React — Project Standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) | Alan Alickovic | undated | Community consensus | Machine-enforced kebab-case file/folder naming via `eslint-plugin-check-file`, and the `@/*` absolute-import config. |
| 6 | [FSD — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) | Feature-Sliced Design team | living docs (v2.1 era) | Official docs (of the methodology) | Verbatim definitions of the five segments (`ui`, `api`, `model`, `lib`, `config`) and the normative "purpose, not essence" naming rule that calls `components`/`hooks`/`types` bad names. |
| 7 | [FSD — Layers](https://feature-sliced.design/docs/reference/layers) | Feature-Sliced Design team | living docs | Official docs (of the methodology) | The Shared layer in detail (`shared/api`, `shared/ui`, `shared/lib`, `shared/config`, `shared/routes`, `shared/i18n`), "Shared does not contain slices", and the explicit rule that lib folders "should not be treated as helpers or utilities". |
| 8 | [Colocation](https://kentcdodds.com/blog/colocation) | Kent C. Dodds (Testing Library author, Epic React) | 2019-06-17 | Recognized expert | The foundational colocation argument and the concrete decay story of an orphaned `utils/` function outliving its only consumer. |
| 9 | [React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) | Robin Wieruch (React author/educator) | updated 2026-05-05 | Recognized expert | The only concrete promotion threshold found ("two or more features need it"), and the progressive small → feature → monorepo structures; keeps `utils/` but organizes it by function (`utils/format/date-time/`). |
| 10 | [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | Dominik Dorfmeister (TkDodo), TanStack Query maintainer | 2021-06-13, upd. 2022-04-23 | Recognized expert (maintainer) | Direct rejection of a global `src/utils/queryKeys.ts` in favour of one feature-local query-key factory; the cleanest worked example of "constants belong with their domain". |
| 11 | [Where To Put Your Types in Application Code](https://www.totaltypescript.com/where-to-put-your-types-in-application-code) | Matt Pocock (Total TypeScript) | no date on page | Recognized expert | The three-tier type-placement rule (colocate single-use → narrowest shared file → shared package) and the argument against `*.types.ts` for single-use types. |
| 12 | [Tidy TypeScript: Prefer union types over enums](https://fettblog.eu/tidy-typescript-avoid-enums/) | Stefan Baumgartner (*TypeScript in 50 Lessons*) | 2020-11-19 | Recognized expert (pre-TS 5.x — mark as older but still-current advice, corroborated by source #1) | The three concrete failure modes of enums (runtime emission, numeric-enum type hole, nominal string enums vs structural typing) and the `as const` + `Values<T>` pattern. |
| 13 | [bliki: Embedment Helper](https://martinfowler.com/bliki/EmbedmentHelper.html) | Martin Fowler | 2007-03-26 | Recognized expert (highest standing on this question) | The single most authoritative statement on "helpers": "I treat the word 'helper' on a class as a red flag as it usually indicates a poorly thought out abstraction" — with one narrow, explicitly-scoped exception. Age is not a problem: it is a naming/design judgement, not technology advice. |
| 14 | [Replace Magic Literal](https://refactoring.com/catalog/replaceMagicLiteral.html) | Martin Fowler (refactoring catalog) | catalog entry, undated (Refactoring 2nd ed. lineage) | Recognized expert / canonical catalog | The canonical named-constant refactoring (`9.81` → `STANDARD_GRAVITY`); the citable origin for "no magic numbers". |
| 15 | [Avoid package names like base, util, or common](https://dave.cheney.net/2019/01/08/avoid-package-names-like-base-util-or-common) | Dave Cheney (Go core contributor) | 2019-01-08 | Recognized expert (Go, but the argument is language-agnostic) | The sharpest formulation of the counter-argument: such names "describe what a package contains rather than what it provides"; two named origins (import-cycle breaking, false commonality); remedies incl. Sandi Metz's "duplication is far cheaper than the wrong abstraction". |
| 16 | [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | React team (react.dev) | living official docs | Official docs | The definitive helper-vs-hook rule ("If your function doesn't call any Hooks, avoid the `use` prefix"), purpose-based hook naming, and the ban on lifecycle-wrapper hooks. |
| 17 | [Zod — Basics](https://zod.dev/basics) | Colin McDonnell / Zod (v4.x, 4.6 current) | living official docs | Official docs | `z.infer<>` as the documented way to derive types from schemas, and `z.input<>`/`z.output<>` for transforming schemas — the mechanism behind schema-as-source-of-truth. |
| 18 | [t3-env — Introduction](https://env.t3.gg/docs/introduction) | t3-oss | living official docs, undated | Official docs (of the library) | States the problem (build-time missing env vars) and the enforced client/server split: server vars are `undefined` on the client and throw a descriptive error on access. |
| 19 | [utils vs helpers](https://stephencharlesweiss.com/utils-vs-helpers/) | Stephen Charles Weiss (personal blog) | undated in retrieved text; **fetch returned HTTP 503** | Low | The most-circulated formulation of the claimed distinction ("a helper is something specific to a given project, while a utility is a generic function"). Cited here as *evidence of the folklore's provenance*, not as support for it. Wording taken from search snippets — unverified. |
| 20 | [Exploring the Contrast: Helpers and Utils Demystified](https://dev.to/victor1890/exploring-the-contrast-helpers-and-utils-demystified-47bo) | victor1890, DEV Community | undated | Low | Restates the utils/helpers split with no cited authority — a second data point that the claim propagates without a source. |
| 21 | [What's the differences between helpers and utils? #808](https://github.com/erikras/react-redux-universal-hot-example/issues/808) | community issue thread | 2016 era | Low | Shows the question being asked inside a popular boilerplate with no canonical answer given — historical evidence that the distinction was never specified. |
| 22 | [Difference between helpers and utils](https://oscarmromero.com/tip/2024/01/21/method_types.html) | Oscar M. Romero | 2024-01-21 | Low | Recent restatement of the same unsourced split; useful only to show the folklore is still current in 2024+. |
| 23 | [Libs vs Utils vs Services Folders](https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f) | A. M. Housen, Medium | undated | Low | Extends the folklore to a three-way `libs`/`utils`/`services` split; no authority. Contrast with #4/#7 where `lib` has a defined meaning. |
| 24 | [Dunghill Anti-Pattern: Why Utility Classes and Modules Smell](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/) | Matti Lehtinen | undated | Low (corroborating) | Coins/uses "dunghill anti-pattern" for utils/helpers directories that accumulate unrelated functions. |
| 25 | [Anti-Patterns and Worst Practices — Utils Class](https://lostechies.com/chrismissal/2009/06/01/anti-patterns-and-worst-practices-utils-class/) | Chris Missal, Los Techies | 2009-06-01 | Low (corroborating) | Early, frequently-cited statement that a Utils class "gives everyone in the team the green light to start sending their junk methods into it". |
| 26 | [The utility module antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/) | Yang Lin Zhao | undated | Low (corroborating) | Proposes the concrete remedy: split the utils module and give each submodule a good name. |
| 27 | [Utils classes considered harmful and how to do better](https://www.jeromethibaud.com/en/blog/utils-considered-harmful/) | Jerome Thibaud | undated | Low (corroborating) | "Qualifying something as 'Utils' … is akin to saying 'Miscellaneous'." |
| 28 | [OOP Anti-Patterns: Utility or Helper Classes](http://ralin.io/blog/oop-anti-patterns-utility-or-helper-classes.html) | ralin.io | undated | Low (corroborating) | Frames utility classes as "a clear sign that someone has failed to find a good name and a good place for that piece of functionality". |
| 29 | [Application directories named as architectural patterns antipattern](https://teotti.com/application-directories-named-as-architectural-patterns-antipattern/) | Sebastian Teotti | undated | Low (corroborating) | Applies the same critique to *directory* names (the folder-level version of the argument), which is the form the question takes in React projects. |
| 30 | [bliki: Duck Interface](https://martinfowler.com/bliki/DuckInterface.html) | Martin Fowler (quoting Charles Miller) | undated bliki entry | Recognized expert (tangential) | Notes that static utility methods on helper classes are a *language affordance* of Java, not a universal design ideal — useful for explaining why the pattern was imported into JS by convention rather than by reasoning. |

### Cross-source disagreement summary (for the report writer)
1. **`utils/` as a folder name.** Kept: Bulletproof React (#4), Wieruch (#9). Rejected: FSD (#6, #7), Cheney
   (#15), and — for the word "helper" specifically — Fowler (#13). No source rejects the *functions*; the
   dispute is entirely about the folder name and the governance it implies.
2. **utils vs helpers semantics.** Asserted only by low-authority sources (#19–#23). **No official
   documentation, no named style guide, and no recognized expert endorses the distinction.** State this
   plainly: it is a team convention, not a standard. The strongest pro-side artifact is a personal blog post
   that was returning 503 at time of research.
3. **Global `src/types/` folder.** Kept: Bulletproof React (#4), Wieruch (#9). Avoided/rejected: FSD (#6),
   Pocock (#11, who directs shared types to the narrowest containing scope).
4. **enum.** Handbook (#1) and Baumgartner (#12) steer away from `enum`; Google (#2) keeps plain `enum` and
   bans only `const enum`. No source mandates enums.
5. **File case.** Airbnb (#3) → filename matches the export identifier (camelCase/PascalCase); Bulletproof
   React (#5) → kebab-case for everything, ESLint-enforced. Genuine, unresolvable-by-authority conflict;
   pick one.

### Outdated-advice flags
- Baumgartner (#12, 2020) and Missal (#25, 2009) predate TS 5.x / modern React, but their claims are
  corroborated by current official docs (#1) and by structural-design reasoning respectively — treat as still
  valid, not stale.
- Fowler (#13, 2007) and Cheney (#15, 2019) are design-judgement sources; age does not degrade them.
- `airbnb.io/javascript` is now a 301 redirect to `javascript.airbnb.tech` — cite the new host (#3).
- TkDodo (#10) last updated 2022; it predates TanStack Query v5 API changes, so its *key-factory placement*
  advice is current while any v4-era API snippets should not be quoted as current API.
