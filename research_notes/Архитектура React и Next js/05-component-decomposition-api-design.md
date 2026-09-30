# Component Design and Decomposition in React: When to Split, and How to Design the API

Scope note: architecture and design only. Performance (memoization, re-render counts, bundle size,
virtualization) is deliberately excluded, except where a cited source itself frames a design rule in
performance terms — in those cases the performance clause is flagged as out of scope and not used as
a design argument.

---

## WHEN TO SPLIT: documented criteria for extracting a sub-component

### Takeaway
The only *official* criterion react.dev gives is separation of concerns ("a component should ideally
only be concerned with one thing... if it ends up growing, it should be decomposed") plus a second,
more actionable heuristic: make the component tree mirror the shape of the data model. No
authoritative source prescribes a line count; the documented triggers are (a) a component is
concerned with more than one thing, (b) visible duplication of markup, (c) a layer is only passing
data through, (d) you are writing an Effect.

### Cited Findings
- react.dev's "Thinking in React" Step 1 gives three lenses for drawing boundaries — **Programming**:
  "use the same techniques for deciding if you should create a new function or object. One such
  technique is the separation of concerns, that is, a component should ideally only be concerned with
  one thing. If it ends up growing, it should be decomposed into smaller subcomponents."; **CSS**:
  "consider what you would make class selectors for. (However, components are a bit less granular.)";
  **Design**: "consider how you would organize the design's layers." — [Thinking in React, react.dev](https://react.dev/learn/thinking-in-react)
- The data-model criterion, stated as the primary structural guide: "If your JSON is well-structured,
  you'll often find that it naturally maps to the component structure of your UI. That's because UI
  and data models often have the same information architecture — that is, the same shape. **Separate
  your UI into components, where each component matches one piece of your data model.**" —
  [Thinking in React, react.dev](https://react.dev/learn/thinking-in-react)
- Thinking in React also fixes the direction of dependency: the top component "will take your data
  model as a prop... This is called *one-way data flow* because the data flows down from the top-level
  component to the ones at the bottom of the tree." — [Thinking in React, react.dev](https://react.dev/learn/thinking-in-react)
- Duplication-driven extraction is the trigger used in the official exercises: "Extract a `Profile`
  component out of it to reduce the duplication. You'll need to choose what props to pass to it." —
  [Passing Props to a Component, react.dev](https://react.dev/learn/passing-props-to-a-component)
- A distinct, explicitly named trigger: a pass-through layer means you missed an extraction. "If you
  pass some data through many layers of intermediate components that don't use that data (and only
  pass it further down), this often means that you forgot to extract some components along the way.
  For example, maybe you pass data props like `posts` to visual components that don't use them
  directly, like `<Layout posts={posts} />`. Instead, make `Layout` take `children` as a prop, and
  render `<Layout><Posts posts={posts} /></Layout>`." — [Passing Data Deeply with Context, react.dev](https://react.dev/learn/passing-data-deeply-with-context)
- For *logic* rather than markup, react.dev's trigger is the presence of an Effect: "whenever you
  write an Effect, consider whether it would be clearer to also wrap it in a custom Hook... Wrapping
  it into a custom Hook lets you precisely communicate your intent and how the data flows through
  it." — [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Reuse-driven extraction across *visually different* components is the canonical motivation given for
  a hook rather than a component: "even though they have different *visual appearance*, you want to
  reuse the logic between them" (`StatusBar` and `SaveButton` both needing online status →
  `useOnlineStatus()`). — [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)
- The hard boundary that decides component-vs-hook: "**Custom Hooks let you share *stateful logic*
  but not *state itself*. Each call to a Hook is completely independent from every other call to the
  same Hook.**" — [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)

### Inferences
- react.dev supports *comprehension-driven* extraction ("concerned with one thing", "if it ends up
  growing") and *reuse-driven* extraction (the duplication exercise) as separate, independently
  sufficient reasons. It never ranks them.
- The "shape of the data model" rule is the most testable criterion in the official docs and is a
  better decomposition heuristic than line count: it yields boundaries that stay stable when the UI
  is redesigned, because the data's information architecture changes less often than its layout.
- The pass-through-layer rule effectively makes prop drilling a *detector* for a missing component
  boundary, not merely an inconvenience — i.e. drilling depth is a design smell before it is an
  ergonomics problem.

### Gaps
- I found **no authoritative source that states a line-count threshold** (e.g. "split at 200 lines").
  react.dev, MUI, Radix, Base UI and Next.js docs contain no such rule. The frequently-repeated
  "150/200/250-line component" limits appear only in low-authority blog/listicle material, which I did
  not cite. The argument *against* line count therefore has to be made from first principles plus the
  AHA/Wrong-Abstraction literature below rather than from a source that attacks line count by name.
- No official React source discusses "one component per file" or file-size rules.

---

## WHEN NOT TO SPLIT: the argument against premature abstraction

### Takeaway
The strongest documented position is not "don't split components" but "don't *deduplicate*
prematurely": Sandi Metz, Dan Abramov and Kent C. Dodds all argue that a wrong abstraction is more
expensive than the duplication it removed, because abstraction introduces coupling that is hard to
reverse. This is genuinely contested territory — the same authors do not argue against abstraction as
such, and react.dev itself continues to prescribe extraction to remove duplication.

### Cited Findings
- Sandi Metz's canonical formulation (20 Jan 2016): "**duplication is far cheaper than the wrong
  abstraction**", and "prefer duplication over the wrong abstraction". She describes an eight-step
  decay: Programmer A sees duplication → extracts a named abstraction → later requirements don't fit
  → subsequent programmers add parameters and conditionals → repeat until incomprehensible. —
  [The Wrong Abstraction, Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- Metz names the psychological trap: "the more complicated and incomprehensible the code, i.e. the
  deeper the investment in creating it, the more we feel pressure to retain it" (sunk cost). —
  [The Wrong Abstraction, Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- Metz's prescribed remedy is *re-inlining*: inline the abstracted code back into every caller; within
  each caller use the passed parameters to determine what actually executes; delete the unneeded code
  per caller. "When the abstraction is wrong, the fastest way forward is back." —
  [The Wrong Abstraction, Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- Dan Abramov (React core team at the time of writing) tells the story of deduplicating a colleague's
  shape-resizing math, halving the code — then requirements demanded "special cases and behaviors for
  different handles on different shapes", at which point the abstraction became unwieldy while in "the
  original 'messy' version such changes stayed easy as cake". He also flags the *social* failure: he
  "rewrote the code and checked it in without their input". —
  [Goodbye, Clean Code, overreacted.io](https://overreacted.io/goodbye-clean-code/)
- Abramov's conclusion: "Clean code is not a goal. It's an attempt to make some sense out of the
  immense complexity of systems we're dealing with." and the prescription "**Let clean code guide you.
  Then let it go.**" — [Goodbye, Clean Code, overreacted.io](https://overreacted.io/goodbye-clean-code/)
- Abramov's talk "The WET Codebase" (DeconstructConf 2019; page published 13 Jul 2020) is aimed at
  showing "why strict adherence to writing code that is free of duplication inevitably leads to
  **software we can't understand**". — [The WET Codebase, overreacted.io](https://overreacted.io/the-wet-codebase/)
- Kent C. Dodds' AHA Programming (22 Jun 2020) = "**Avoid Hasty Abstractions**", explicitly built on
  Metz's "prefer duplication over the wrong abstraction". His failure mode: "you just bend the code to
  fit your new use case. This goes on several times until the abstraction is basically your whole
  application in `if` statements." — [AHA Programming, kentcdodds.com](https://kentcdodds.com/blog/aha-programming)
- Dodds' concrete timing rule: "**I'm fine with code duplication until you feel pretty confident that
  you know the use cases for that duplicate code**" — wait until the commonalities "scream at you for
  abstraction" after several concrete implementations exist. Governing principle: "**Optimize for
  change first**", because future requirements are unknown. —
  [AHA Programming, kentcdodds.com](https://kentcdodds.com/blog/aha-programming)
- Dodds' own war story is React-specific: AngularJS controllers using pseudo-inheritance were "SUPER
  confusing, hard to follow" and dangerous to modify despite being theoretically reusable. —
  [AHA Programming, kentcdodds.com](https://kentcdodds.com/blog/aha-programming)
- **The counter-pressure, from the same official docs**: react.dev still instructs you to extract to
  remove duplication ("Extract a `Profile` component out of it to reduce the duplication") —
  [Passing Props to a Component, react.dev](https://react.dev/learn/passing-props-to-a-component);
  while simultaneously stating, for hooks, "**You don't need to extract a custom Hook for every little
  duplicated bit of code. Some duplication is fine.**" and that "extracting a `useFormInput` Hook to
  wrap a single `useState` call... is probably unnecessary." —
  [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)

### Inferences
- The disagreement is narrower than it looks and is best characterised as a disagreement about
  *timing and confidence*, not about whether abstraction is good. Metz/Abramov/Dodds all attack
  abstraction created from **syntactic** similarity before the **semantic** commonality is known.
  react.dev's extraction exercises are about markup that is duplicated *within one screen for one
  reason* — the semantics are already known.
- A defensible synthesis rule for component splitting: **splitting for comprehension is cheap and
  reversible; splitting for reuse is expensive and sticky.** Extracting `<ProductRow>` out of
  `<ProductTable>` in the same file changes no contracts. Extracting a shared `<DataTable>` used by
  three features creates a contract that every future requirement must negotiate with — that is the
  move the AHA literature says to delay.
- Metz's re-inlining remedy maps directly onto React: the way out of an over-parameterised shared
  component is to copy it back into each call site, delete the branches each site doesn't use, and
  only then look for a *new* seam. This is the operational counterpart to "prefer duplication".

### Gaps
- I could not retrieve a transcript of "The WET Codebase" — the overreacted.io page is a landing page
  linking to the DeconstructConf video, and the WebFetch of it returned only the framing sentence.
  Detailed quotes from the talk (the "coupling is the cost of abstraction" material, the unwinding
  demo) are therefore **not** citable from my research; do not attribute specific talk quotes to it in
  the report beyond the one sentence above.

---

## COMPOSITION PATTERNS: the named patterns and when each applies

### Takeaway
The pattern family is unified by one idea Dodds names explicitly — inversion of control: "Make your
abstraction do less stuff, and make your users do that instead." `children`-as-slot is the officially
idiomatic default; compound components and `asChild`/`render` props are the escape hatches for when
configuration props explode; render props are now a *rendering-control* tool rather than a
logic-sharing tool, and remain alive in headless libraries. HOCs appear nowhere in current official
docs.

### Cited Findings
- **`children` as a slot / "hole"** is the official default: "You can think of a component with a
  `children` prop as having a 'hole' that can be 'filled in' by its parent components with arbitrary
  JSX. You will often use the `children` prop for visual wrappers: panels, grids, etc." —
  [Passing Props to a Component, react.dev](https://react.dev/learn/passing-props-to-a-component)
- MUI states the same ranking of options for a production design system: "Using the `children` prop is
  the idiomatic way to do composition with React"; but where composition needs are limited, explicit
  props (e.g. `icon` and `label` on `Tab`) make the implementation "simpler and more performant"; and
  API consistency across components is itself a criterion. —
  [API design approach, Material UI](https://mui.com/material-ui/guides/api/)
- **The props-explosion smell that motivates the patterns** — Dodds' `filter()` example grows from a
  null check to `filterNull`, `filterUndefined`, `filterZero`, `filterEmptyString`, producing 16
  possible flag combinations for 6 real use cases. The costs he lists: more code, documentation and
  support burden, compounding branch complexity in the implementation, and an API users can't hold in
  their heads. — [Inversion of Control, kentcdodds.com](https://kentcdodds.com/blog/inversion-of-control) (18 Nov 2019)
- **Inversion of control**, quoting Wikipedia: "in traditional programming, the custom code that
  expresses the purpose of the program calls into reusable libraries... but with inversion of control,
  it is the framework that calls into the custom, or task-specific, code." Dodds' translation: "**Make
  your abstraction do less stuff, and make your users do that instead.**" The two React vehicles he
  names are **compound components** and the **state reducer** pattern (a callback that lets the
  consumer intercept and modify state transitions without a new prop per use case). —
  [Inversion of Control, kentcdodds.com](https://kentcdodds.com/blog/inversion-of-control)
- **Compound components** (18 Feb 2019): "two or more components that work together to accomplish a
  useful task", typically one parent plus children, to "provide a more expressive and flexible API".
  The canonical model is `<select>`/`<option>`: "If you were to try and use one without the other it
  wouldn't work (or make sense)". The flat-prop alternative
  (`<select options="key1:value1;key2:value2">`) is "yuck" and makes per-item attributes like
  `disabled` inexpressible. The parent shares state **implicitly** — "The `<select>` element
  implicitly stores state about the selected option and shares that with its children" — implemented
  in React with Context, "implicitly because there's nothing in our HTML code that can even access the
  state." — [Compound Components with React Hooks, kentcdodds.com](https://kentcdodds.com/blog/compound-components-with-react-hooks)
- **`asChild` (Radix)** — polymorphic composition without a `component`/`as` prop: "When `asChild` is
  set to `true`, Radix will not render a default DOM element, instead cloning the part's child and
  passing it the props and behavior required to make it functional." Contract on the consumer's
  component: it must accept and spread all props onto its underlying DOM node ("When Radix clones your
  component, it will pass its own props and event handlers to make it functional and accessible") and
  must forward refs, because "Radix will sometimes need to attach a `ref` to your component (for
  example to measure its size)." Responsibility shifts to the consumer: "If you do decide to change
  the underlying element type, it is your responsibility to ensure it remains accessible and
  functional." — [Composition, Radix Primitives](https://www.radix-ui.com/primitives/docs/guides/composition)
- **`render` prop (Base UI v1.8.0, the MUI team's successor to Radix-style primitives)** — the same
  problem solved differently: "Use the `render` prop to compose a Base UI part with your own React
  components." It accepts a React element *or* a function; "The custom component must forward the
  `ref`, and spread all the received props on its underlying DOM node." Passing a function "gives you
  complete control over spreading props and also allows you to render different content based on the
  component's state." — [Composition, Base UI](https://base-ui.com/react/handbook/composition)
- **Render props in 2025**: patterns.dev states that "in a 2025 codebase, render props are no longer
  the default tool for sharing logic — custom hooks are", and "If a wrapper component only exists to
  call `props.children(data)`, a custom hook is almost always cleaner." Remaining advantages it lists:
  no naming collisions (data passed as explicit function arguments), maximum flexibility because the
  logic-owning component doesn't dictate markup (which "headless libraries value"), and clean
  TypeScript generic inference. Costs: callback pyramids, and the cognitive load of `children`
  sometimes being a function. Libraries that pioneered render props (Apollo, React Router, Formik)
  moved to hooks-first APIs. — [Render Props Pattern, patterns.dev](https://www.patterns.dev/react/render-props-pattern/)
- **Where render props survive**: a community write-up argues hooks replaced render props for *logic
  sharing* but not for *rendering control* — headless libraries (Downshift, React Aria, TanStack
  Table) use render props / children-as-function to ship behavior without dictating markup, and a hook
  "can give you state but cannot wrap your JSX in component boundaries". It also reports that Headless
  UI v2 uses children-as-a-function as its primary API and that Base UI v1.0 (Dec 2025) chose a
  `render` prop over Radix's `asChild` citing better TypeScript inference, more explicit prop merging,
  and easier debugging. — [Render Props Are Not Dead, Maryan Mats](https://maryanmats.com/blog/render-props-are-not-dead/) (community/low-authority; the Base UI `render` prop itself is confirmed by the primary source above, the *reasons* are not)
- **Headless/behavior-only components**: React Aria (Adobe) ships behavior, ARIA semantics,
  internationalization and adaptive interaction as **hooks** rather than components across 40+
  component patterns — i.e. the same "behavior without markup" goal reached without render props. —
  reported in [Top Headless UI libraries for React in 2026, GreatFrontEnd](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026) (community)

### Inferences
- Choosing between the patterns is mostly a question of *what the consumer needs to control*:
  - needs to supply arbitrary content → `children` slot (default; official).
  - needs to supply content in several named positions → multiple JSX-typed props (named slots) or a
    compound namespace.
  - needs to control ordering/structure *and* read the parent's state → compound components + Context.
  - needs to swap the rendered element/own component while keeping behavior → `asChild` (Radix) or
    `render` (Base UI).
  - needs to alter *behavior* rather than markup → state reducer / control props.
  - needs behavior with zero markup opinions → headless hooks (React Aria style), with render props
    only when the library must own a wrapping subtree.
- `asChild` vs `render` is a live, unresolved API-design disagreement between two first-tier primitive
  libraries (Radix vs the MUI-backed Base UI). Both impose the identical consumer contract (spread all
  props, forward the ref), so the disagreement is about ergonomics and type inference, not semantics.
- HOCs: their absence is the finding. They are not present as a recommended pattern anywhere in the
  current react.dev learn/reference material I fetched; the surviving use cases are legacy wrappers
  (`connect`, `withRouter`) and they are superseded by hooks for logic and by `asChild`/`render` for
  element substitution.

### Gaps
- I did not find an *official React docs* page that names "compound components", "headless
  components" or "control props" — these are ecosystem terms. The authority for them is Dodds/Radix/
  Base UI, not react.dev.
- "Slots" as a formal API (named JSX props) is documented by MUI only as `xxxProps` / `xxxComponent`
  conventions (below), not as a first-class named pattern in official React material.

---

## PROPS API DESIGN: booleans vs variants, drilling depth, objects vs primitives, naming

### Takeaway
react.dev frames props as the component's argument list and its independence boundary; the most
concrete, citable *rules* for prop API design come from Material UI's published "API design approach"
— including an explicit boolean-vs-enum threshold (2 values → boolean, >2 or likely growth → enum).
On prop drilling, react.dev's official position is surprisingly tolerant: a dozen props through a
dozen components is acceptable, and context is the *third* option, not the first.

### Cited Findings
- Props are the component's public interface and the reason components can be reasoned about
  separately: "Props let you think about parent and child components independently... you can change
  the `person` or the `size` props inside `Profile` without having to think about how `Avatar` uses
  them. Similarly, you can change how the `Avatar` uses these props, without looking at the
  `Profile`." — [Passing Props to a Component, react.dev](https://react.dev/learn/passing-props-to-a-component)
- Props as arguments/knobs: "You can think of props like 'knobs' that you can adjust. They serve the
  same role as arguments serve for functions — in fact, props *are* the only argument to your
  component!" Props can carry "any JavaScript value... including objects, arrays, and functions." —
  [Passing Props to a Component, react.dev](https://react.dev/learn/passing-props-to-a-component)
- **Boolean vs enum threshold (MUI)**: use a **boolean** when there are 2 possible values; use an
  **enum** when there are more than 2 values *or* when future expansion is likely. —
  [API design approach, Material UI](https://mui.com/material-ui/guides/api/)
- **Boolean naming rules (MUI)**: the default should be `false` so the shorthand `<X flag />` reads
  correctly; use adjectives or nouns, not verbs, because "props describe *states* and not *actions*";
  prefer `disabled` over `enable`. — [API design approach, Material UI](https://mui.com/material-ui/guides/api/)
- **Controlled-component naming (MUI)**: most controlled components use `value` + `onChange`; some use
  `open`/`onClose`/`onOpen`; handler names go noun-first then verb (`onPageChange`). —
  [API design approach, Material UI](https://mui.com/material-ui/guides/api/)
- **Reaching into nested components (MUI)**: the documented escape hatches, in order — flatten key
  props to the root (`id`), `xxxProps` for tweaking an internal part, `xxxComponent` for injecting a
  different component, `xxxRef` for imperative access. The `ref` is forwarded to the root element
  unless the `component` prop changes the root. Undocumented props are spread onto the root element
  (e.g. `<MenuItem disableRipple />` flows through to `ButtonBase`). —
  [API design approach, Material UI](https://mui.com/material-ui/guides/api/)
- **Accepted prop-drilling depth, official**: "**Start by passing props.** If your components are not
  trivial, it's not unusual to pass a dozen props down through a dozen components. It may feel like a
  slog, but it makes it very clear which components use which data! The person maintaining your code
  will be glad you've made the data flow explicit with props." Only after that, and after trying
  `children` extraction, "consider context". —
  [Passing Data Deeply with Context, react.dev](https://react.dev/learn/passing-data-deeply-with-context)
- react.dev's characterisation of when drilling becomes a real problem: "passing props can become
  verbose and inconvenient when you need to pass some prop deeply through the tree, or if many
  components need the same prop. The nearest common ancestor could be far removed from the components
  that need data, and lifting state up that high can lead to a situation called 'prop drilling'." —
  [Passing Data Deeply with Context, react.dev](https://react.dev/learn/passing-data-deeply-with-context)
- **Object vs primitive props — the one hard constraint in the 2025 era**: props crossing the
  server/client boundary must be serializable. Server Components "can pass data and JSX as props to
  Client Components", and "In the browser, the Client Components will see output of the Server
  Components passed as props." — [Server Components, react.dev](https://react.dev/reference/rsc/server-components)
- Naming guidance for extracted *hooks* (transferable to component/prop naming): "Ideally, your custom
  Hook's name should be clear enough that even a person who doesn't write code often could have a good
  guess about what your custom Hook does, what it takes, and what it returns." Good: `useAuth()`,
  `useChatRoom(options)`, `useMediaQuery(query)`, `useIntersectionObserver(ref, options)`. —
  [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)

### Inferences
- MUI's 2-value rule is the citable basis for the common advice "replace `isPrimary`/`isDanger`/
  `isGhost` with `variant="primary" | "danger" | "ghost"`": three mutually exclusive booleans encode
  8 states for 3 legal ones, which is exactly Dodds' 16-combinations-for-6-use-cases complaint applied
  to JSX.
- Combining the two official positions yields a usable drilling rule: **depth is not the metric,
  *usage* is.** Passing a prop through ten components that all use it is explicit and fine per
  react.dev; passing it through two that don't is a missing `children` boundary. Context is justified
  by *many consumers*, not by *distance*.
- MUI's `xxxProps`/`xxxComponent`/`xxxRef` ladder is effectively an admission that a closed component
  will eventually need to be opened; compound components and `asChild`/`render` are the alternative
  answer to the same pressure, chosen by Radix/Base UI. A design system picks one of these two
  strategies; mixing them is where prop APIs become unpredictable.

### Gaps
- MUI's API-design page carries **no publication or last-updated date**, so it cannot be dated for the
  "2025-2026 era" requirement beyond being the live documentation as fetched 2026-09-29.
- No authoritative source gives a numeric limit on prop count ("more than N props means split"). Treat
  any such number in the final report as unsourced.
- I found no official guidance on passing a domain object (`user`) vs its fields (`name`, `avatarUrl`)
  as props. react.dev only confirms objects are permitted.

---

## PRESENTATIONAL vs CONNECTED: who is allowed to fetch

### Takeaway
The "container components fetch, presentational components render" rule was retracted by its own
author in 2019 in favour of hooks, and the 2025-2026 stack has pushed further in the opposite
direction: both React's official RSC docs and Next.js's current docs show data fetching happening in
whichever component needs the data, with request-level deduplication/memoization as the mechanism
that makes colocation safe. TanStack Query's maintainer makes the same argument for client components.

### Cited Findings
- **The retraction.** Dan Abramov added a 2019 update to "Presentational and Container Components"
  saying he no longer suggests splitting components this way; that the pattern can be handy if it
  feels natural but he has seen it "enforced without any necessity and with almost dogmatic fervor";
  that the reason it was useful was to separate complex stateful logic from the rest of the component;
  and that **Hooks let him do the same thing without an arbitrary division**. —
  [Presentational and Container Components, Dan Abramov](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0).
  *Caveat: medium.com returns HTTP 403 to automated fetching, so I could not read the page directly;
  the content of the 2019 update is corroborated by search-result summaries and by secondary coverage
  such as [this summary](https://medium.com/@fabbb/dan-abramov-abandoned-his-idea-of-splitting-components-into-presentational-and-container-components-c31c262a0c80).
  The report writer should treat the exact wording as paraphrase, not verbatim quote.*
- **Server Components are allowed to touch the data layer directly**: "Server Components can also run
  on a web server during a request for a page, letting you access your data layer without having to
  build an API." The docs' own example is a component doing `const note = await db.notes.get(id)` —
  i.e. a *leaf-ish* component, not a route container. —
  [Server Components, react.dev](https://react.dev/reference/rsc/server-components)
- The boundary that replaces "container vs presentational" is the **server/client** boundary, not
  fetch-vs-render: "Server Components are not sent to the browser, so they cannot use interactive APIs
  like `useState`. To add interactivity to Server Components, you can compose them with Client
  Component using the `'use client'` directive." Also the official clarification that "there is no
  directive for Server Components. The `'use server'` directive is used for Server Functions." —
  [Server Components, react.dev](https://react.dev/reference/rsc/server-components)
- **Next.js states colocation over drilling explicitly**: "Identical `fetch` requests in a React
  component tree are memoized by default, so **you can fetch data in the component that needs it
  instead of drilling props**." For non-`fetch` access (ORM/DB), wrap the function in `React.cache` so
  "Multiple components can then call the function within the same request while sharing one result."
  — [Fetching Data, Next.js docs](https://nextjs.org/docs/app/getting-started/fetching-data) (version 16.3.7, lastUpdated 2026-09-07)
- Next.js also gives a design rule for *where* to put the Suspense boundary, which is a component-
  boundary decision: "while `loading.js` works well for streaming route segments, using `<Suspense>`
  closer to the runtime or uncached data access is recommended." A fetching component becomes its own
  component precisely so it can be wrapped: `<Suspense fallback={<BlogListSkeleton />}><BlogList /></Suspense>`.
  — [Fetching Data, Next.js docs](https://nextjs.org/docs/app/getting-started/fetching-data)
- **Promise-as-prop**: a server component may start a fetch without awaiting and pass the promise into
  a client component that reads it with `use(posts)` — a new API shape for the
  "who fetches / who renders" split, where the server owns the request and the client owns the
  suspense-aware render. — [Fetching Data, Next.js docs](https://nextjs.org/docs/app/getting-started/fetching-data);
  React's own guidance on which side should resolve the promise is at [`use`, react.dev](https://react.dev/reference/react/use)
- Next.js also names the design constraint that keeps colocated server fetching safe: "Since Server
  Components are rendered on the server, credentials and query logic will not be included in the
  client bundle so you can safely make database queries using an ORM or database client. You should
  still ensure requests are properly authenticated and authorized." —
  [Fetching Data, Next.js docs](https://nextjs.org/docs/app/getting-started/fetching-data)
- **TanStack Query's maintainer (Dominik "TkDodo" Dorfmeister, TanStack Query maintainer) argues for
  colocation on the client**: "One of the best traits of React Query is that you can use a query
  wherever you want in your component tree: Your component can fetch its own data, co-located, right
  where you need it to be." And: wrapping `useQuery` in a custom hook "pays off because you can keep
  the actual data fetching out of the ui, but co-located with your `useQuery` call." Colocated queries
  make components "more independent because you can move them around freely in your app, and it will
  just work on its own." —
  [React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager) /
  [Practical React Query](https://tkdodo.eu/blog/practical-react-query)
  *(these quotes come from search-result extraction across TkDodo's posts; I did not fetch each page
  individually, so attribute to "TkDodo's React Query blog series" if the exact post matters)*
- A counter-datapoint from practice, also from TkDodo's material: one team that co-located query keys
  into feature folders hit duplicated keys and moved all keys to a global location; the recommended
  modern shape is the Query Options API with factories that colocate keys *and* options. —
  [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) / [The Query Options API](https://tkdodo.eu/blog/the-query-options-api)

### Inferences
- The old rule has inverted rather than relaxed: in 2019 fetching was pushed *up* to containers
  because each fetch cost a request and a loading state; in 2025-2026 request memoization
  (`fetch` dedupe, `React.cache`, a Query cache keyed by query key) makes a second call to the same
  data free, so the architecture pressure now points *down*, toward the component that needs the data.
- The presentational/connected distinction survives in a weaker, more useful form: **components that
  own a data dependency should be separable enough to wrap in a `<Suspense>` boundary** (server) or to
  own a `useQuery` call and its own loading/error UI (client). That is a *boundary* rule about where
  loading states live, not a rule about which folder a component sits in.
- What Server Components remove is the need for a *wrapper component* whose only job is fetching: an
  `async` component both fetches and renders, which is precisely the thing the container pattern
  forbade. The report should mark "only containers fetch" as **superseded** for RSC codebases and
  **not advocated** by its original author even for client-only codebases.
- The remaining hard rule is the serialization/`'use client'` boundary: it is now the only
  *enforced* component boundary in React, and it is enforced by the compiler rather than by
  convention.

### Gaps
- I did not find an official react.dev or Next.js statement that *prohibits* deep client components
  from fetching; the guidance is permissive plus a request-waterfall caution (preloading, parallel
  fetching with `Promise.all`). The "components that both fetch and render deeply are an anti-pattern"
  claim is therefore only supportable as a *waterfall* concern, which shades into performance and is
  out of this report's scope.
- TkDodo quotes were gathered via search extraction rather than direct page fetches; the wording is
  reliable but the exact post attribution for each sentence is not fully pinned.

---

## DESIGN SYSTEM BOUNDARY: UI primitive vs feature component

### Takeaway
Two independent bodies of guidance converge: design-system contribution criteria require a component
to be **domain-agnostic and demonstrably reused across products** before it enters the system, and
application architecture guidance (Bulletproof React) forbids **cross-feature imports** and enforces
a **unidirectional** dependency flow shared → features → app, mechanically via ESLint. Radix,
Base UI and shadcn/ui show three different answers to "how open should a primitive be".

### Cited Findings
- **Bulletproof React's structural rules.** Features live in `src/features/<feature>` with only the
  subfolders they need (`api`, `assets`, `components`, `hooks`, `stores`, `types`, `utils`); "You
  don't need all of these folders for every feature. Only include the ones that are necessary for the
  feature." Cross-feature imports are prohibited — features stay isolated and composition happens at
  the **app** level, not inside features. —
  [project-structure.md, bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- **The unidirectional rule** is `shared → features → app`: the shared layer may be used anywhere;
  features may not import from app; app composes features. It is enforced with
  `import/no-restricted-paths` ESLint rules that (1) block feature→feature imports (auth cannot import
  from comments) and (2) enforce the direction of the remaining edges. —
  [project-structure.md, bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Each feature exposes a **public API via `index.ts`**, and other features/app are only allowed to use
  what that barrel exports — though the docs also caution to "import the files directly" rather than
  rely on barrel files because barrels can impair tree-shaking. —
  [project-structure.md, bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  (the tree-shaking rationale is a bundling concern, noted only because it modifies the public-API rule)
- **Contribution criteria for entering a design system** (published government design system,
  Digital NSW): a component must address a user need shared by multiple services/products and cannot
  be accepted if it serves one project or one specific use case; it must be designed with the
  intention of being reusable in many circumstances by many teams; it must be **project agnostic —
  "not containing any proprietary logic, smartness or complexity tied to a specific project"**; it
  must not duplicate an existing component's function (extend rather than duplicate); and it should
  have been tested in a live or beta product before integration. —
  reported from [Contribution criteria, Digital NSW Design System](https://www.digital.nsw.gov.au/delivery/digital-service-toolkit/design-system/contributing/contribution-criteria)
  *(the specific URL returned 404 on direct fetch; the criteria above come from search-result
  extraction of that page plus corroborating design-system contribution literature — see Gaps)*
- **Rule-of-three reuse evidence** appears repeatedly in design-system contribution literature: a
  component should be in use in 3 or more places across different contexts/products before promotion,
  and contribution guidance should "distinguish Design System code from product-aware feature UI",
  requiring domain independence plus demonstrated reuse or clear platform-level value. — surfaced
  across [EightShapes, "I made this. Does it go in the system?"](https://medium.com/eightshapes-llc/i-made-this-does-it-go-in-the-system-3b67b9894531)
  and [Salesforce UX, "Design System Checklist: How to Screen New Components"](https://medium.com/salesforce-ux/design-system-checklist-how-to-screen-new-components-f278d3e3efa)
  (recognized practitioner publications: EightShapes is Nathan Curtis; the second is Salesforce's own
  UX org — but both are Medium posts, not versioned docs)
- **Radix's answer — behavior-only primitives you must style and may re-root**: `asChild` plus the
  consumer's obligation to spread props, forward refs and preserve accessibility if they change the
  element type. — [Composition, Radix Primitives](https://www.radix-ui.com/primitives/docs/guides/composition)
- **Primer (GitHub) anchors system components on shared primitives**: color, typography, spacing and
  layout primitives shipped as JSON from `@primer/primitives`; component guidance is to "reuse or
  extend existing patterns and primitives rather than creating overrides", including colors, spacing,
  sizes and typographic styles. — [Primer components](https://primer.style/components/) and
  [DESIGN_TOKENS_GUIDE.md, primer/primitives](https://github.com/primer/primitives/blob/main/DESIGN_TOKENS_GUIDE.md)
- **shadcn/ui's answer — reject the library boundary entirely**: "This is not a component library. It
  is how you build your component library." Components are distributed as source you own: "The top
  layer of your component code is open for modification", via "A flat-file schema and command-line
  tool". It also asserts interface uniformity as a design goal: "Every component uses a common,
  composable interface, making them predictable." — [shadcn/ui docs](https://ui.shadcn.com/docs)
- **MUI's answer — closed components with documented escape hatches** (`xxxProps`, `xxxComponent`,
  `xxxRef`, prop spreading to the root). — [API design approach, Material UI](https://mui.com/material-ui/guides/api/)

### Inferences
- The two rule sets answer different halves of the same boundary question. Contribution criteria say
  **what may be promoted upward** (generic, domain-free, reused ≥3 times, not a duplicate). Bulletproof
  React says **what may be imported sideways** (nothing: features never import features; shared code is
  the only legal sideways dependency, and it lives in the shared layer by definition). Together they
  produce the practical test: *if two features need it, it must move to shared/UI and shed its domain
  vocabulary first* — a component named `ReviewSeverityBadge` cannot be shared; `Badge` with a
  `variant` can.
- "UI primitives never contain domain logic" is best sourced as the **project-agnostic /
  no-proprietary-logic** criterion in contribution guidance rather than as a React-specific rule; no
  React-official source states it.
- The Radix / Base UI / MUI / shadcn spread shows the design-system boundary is itself a spectrum of
  how much control is inverted: behavior-only + re-rootable (Radix), behavior-only + render-prop
  (Base UI), styled + escape hatches (MUI), source-owned (shadcn). A project's "design system rules"
  should state which of these it is, because the four imply different prop APIs for the same `Button`.

### Gaps
- **Primer's component lifecycle / promotion criteria could not be retrieved**: both
  `primer.style/guides/contribute/component-lifecycle` and the landing page fetch returned navigation
  content only. Search results reference a "Component lifecycle" page at
  `primer.github.io/contribute/component-lifecycle/` — the report writer should not attribute specific
  lifecycle stages to Primer on the strength of my research.
- Atlassian Design System, Shopify Polaris and IBM Carbon **architectural** guidance (as opposed to
  per-component usage docs) was not reached within my tool budget. I have no citable Polaris/Carbon/
  Atlassian statement about feature-vs-system boundaries.
- The Digital NSW criteria page 404'd on direct fetch; treat those bullets as search-extracted and
  verify the URL before publishing it as a citation.

---

## NAMED COMPONENT-LEVEL ANTI-PATTERNS

### Takeaway
Of the anti-patterns named in the brief, three are directly sourceable to authoritative material
(boolean/options explosion, pass-through prop drilling, over-abstracted wrappers), one is sourceable
only as a *React-official hook* anti-pattern (convenience wrappers like `useMount`), and "god
component" has no authoritative citation I could find.

### Cited Findings
- **Options/boolean-prop explosion** — named and quantified: 4 boolean flags → 16 combinations for 6
  real use cases, with costs in code, docs, support, implementation branching and API comprehension. —
  [Inversion of Control, kentcdodds.com](https://kentcdodds.com/blog/inversion-of-control)
- **Configuration-as-string / flat-props instead of composition** — `<select options="key1:value1;key2:value2">`
  is the explicit "yuck" counter-example, and the tell is that per-child attributes (`disabled` on one
  option) become inexpressible. — [Compound Components with React Hooks, kentcdodds.com](https://kentcdodds.com/blog/compound-components-with-react-hooks)
- **Pass-through prop drilling as a missing-boundary smell** — "If you pass some data through many
  layers of intermediate components that don't use that data (and only pass it further down), this
  often means that you forgot to extract some components along the way", with `<Layout posts={posts} />`
  as the named bad example. — [Passing Data Deeply with Context, react.dev](https://react.dev/learn/passing-data-deeply-with-context)
- **Prop drilling caused by over-lifting state**: "The nearest common ancestor could be far removed
  from the components that need data, and lifting state up that high can lead to a situation called
  'prop drilling'." — [Passing Data Deeply with Context, react.dev](https://react.dev/learn/passing-data-deeply-with-context)
- **The abstraction-turned-`if`-statement-pile** — "you just bend the code to fit your new use case.
  This goes on several times until the abstraction is basically your whole application in `if`
  statements." — [AHA Programming, kentcdodds.com](https://kentcdodds.com/blog/aha-programming);
  same decay described step-by-step in [The Wrong Abstraction, Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
- **Over-abstracted wrappers, officially named (hooks edition)**: "🔴 Avoid: A Hook that doesn't use
  Hooks" (`useSorted(items)` returning `items.slice().sort()`), and "🔴 Avoid: Custom 'lifecycle' Hooks
  like these: `useMount(fn)`, `useEffectOnce(fn)`, `useUpdateEffect(fn)`" — with the rationale that
  such wrappers "don't fit well into the React paradigm" and defeat the lint rules: "The linter won't
  warn you about it because the linter only checks direct `useEffect` calls. It won't know about your
  Hook." Positive rule: "**Keep custom Hooks focused on concrete high-level use cases.** Avoid creating
  and using custom 'lifecycle' Hooks that act as alternatives and convenience wrappers for the
  `useEffect` API itself." — [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)
- **Premature extraction, officially permitted duplication**: "You don't need to extract a custom Hook
  for every little duplicated bit of code. Some duplication is fine." —
  [Reusing Logic with Custom Hooks, react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks)
- **Cross-feature coupling**, enforced as an anti-pattern by lint rather than prose: feature→feature
  imports and feature→app imports are blocked by `import/no-restricted-paths`. —
  [project-structure.md, bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- **Refactoring without the author** — Abramov lists it as a first-class failure alongside the
  technical one: he "rewrote the code and checked it in without their input". —
  [Goodbye, Clean Code, overreacted.io](https://overreacted.io/goodbye-clean-code/)

### Inferences
- The `useMount` guidance generalizes to components: a wrapper whose only job is to rename or
  slightly re-shape a built-in (or another component's) API is an anti-pattern for the same reason —
  it hides the thing lint and readers know how to check, and buys nothing.
- "God component" is best presented in the report as the *composite* of sourced smells (many
  unrelated concerns in one component per Thinking in React's separation-of-concerns rule, plus flag
  explosion, plus internal branching) rather than as a cited term of art.

### Gaps
- **No authoritative source names "god component"**, and none gives a numeric size threshold for one.
- I found no authoritative source explicitly naming "components that both fetch and render deeply" as
  an anti-pattern; current official guidance (react.dev RSC, Next.js) actively endorses fetching in
  the component that needs the data. The only sourced caution is about request waterfalls
  (sequential fetching, preloading) — a performance topic excluded from this report's scope.

---

## ANNOTATED SOURCE LIST (primary deliverable)

### Takeaway
15 usable sources: 6 official docs (react.dev ×4, Next.js, plus the RSC reference), 5
recognized-expert posts (Metz, Abramov ×2, Dodds ×2), 4 design-system/library primary docs (Radix,
Base UI, MUI, shadcn/ui), plus Bulletproof React (community consensus) and a small set of
lower-authority corroborating items flagged as such.

### Cited Findings

**Official documentation (authority: official docs)**
- **Thinking in React** — React team, react.dev, current docs (no per-page date; fetched 2026-09-29) —
  [https://react.dev/learn/thinking-in-react](https://react.dev/learn/thinking-in-react) — The only
  official prescription for drawing component boundaries: separation of concerns, CSS/design lenses,
  and "each component matches one piece of your data model". Unique contribution: the data-shape
  criterion and one-way data flow.
- **Passing Props to a Component** — React team, react.dev —
  [https://react.dev/learn/passing-props-to-a-component](https://react.dev/learn/passing-props-to-a-component)
  — Props as the component's only argument / "knobs", the `children` "hole" metaphor for visual
  wrappers, and duplication as the extraction trigger. Unique contribution: the official framing of
  props as the independence boundary between parent and child.
- **Passing Data Deeply with Context** — React team, react.dev —
  [https://react.dev/learn/passing-data-deeply-with-context](https://react.dev/learn/passing-data-deeply-with-context)
  — The "Before you use context" ladder: pass props (a dozen through a dozen is fine) → extract
  components and pass JSX as `children` → only then context. Unique contribution: the officially
  sanctioned tolerance for prop drilling, and drilling-as-missing-boundary.
- **Reusing Logic with Custom Hooks** — React team, react.dev —
  [https://react.dev/learn/reusing-logic-with-custom-hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
  — "Custom Hooks share stateful logic but not state itself"; "Some duplication is fine"; the
  `useMount`/`useSorted` anti-pattern list; naming guidance. Unique contribution: the only *official*
  anti-abstraction guidance and the official hook-vs-component decision rule.
- **Server Components (reference)** — React team, react.dev —
  [https://react.dev/reference/rsc/server-components](https://react.dev/reference/rsc/server-components)
  — Server Components render ahead of bundling, may read the database directly "without having to
  build an API", cannot use `useState`, compose with `'use client'`, and pass data and JSX as props.
  Unique contribution: the authoritative statement that a rendering component may own its data access.
- **`use` (reference)** — React team, react.dev — [https://react.dev/reference/react/use](https://react.dev/reference/react/use)
  — Cited by Next.js as the guidance on whether a promise should be resolved on the server or in a
  client component. Unique contribution: the React 19 promise-as-prop contract.
- **Fetching Data (App Router)** — Vercel / Next.js docs, version 16.3.7, lastUpdated **2026-09-07** —
  [https://nextjs.org/docs/app/getting-started/fetching-data](https://nextjs.org/docs/app/getting-started/fetching-data)
  — The clearest era-marking statement in this research: "you can fetch data in the component that
  needs it instead of drilling props", `React.cache` for ORM dedupe, `<Suspense>` placed close to the
  data access, promise-as-prop + `use()`, and the note that credentials/query logic stay out of the
  client bundle. Unique contribution: the current framework-level position on where fetching lives.

**Recognized experts (authority: recognized expert)**
- **The Wrong Abstraction** — Sandi Metz (author of *Practical Object-Oriented Design in Ruby*;
  originator of the phrase), **20 Jan 2016** —
  [https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
  — The eight-step decay of an abstraction, "duplication is far cheaper than the wrong abstraction",
  the sunk-cost trap, and the re-inlining remedy. Unique contribution: the *remedy* — how to reverse a
  bad abstraction, which almost no other source supplies.
- **Goodbye, Clean Code** — Dan Abramov (React core team at time of writing; co-author of Redux),
  overreacted.io —
  [https://overreacted.io/goodbye-clean-code/](https://overreacted.io/goodbye-clean-code/) — A concrete
  React-adjacent failure: deduplicated shape-resizing math that halved the code and then obstructed
  per-shape special cases; "Let clean code guide you. Then let it go." Unique contribution: the social
  dimension (refactoring someone's code without them) alongside the technical one.
- **The WET Codebase** — Dan Abramov, overreacted.io, **13 Jul 2020** (talk given at DeconstructConf
  2019) — [https://overreacted.io/the-wet-codebase/](https://overreacted.io/the-wet-codebase/) — Framed
  as showing "why strict adherence to writing code that is free of duplication inevitably leads to
  software we can't understand". Unique contribution: the canonical talk reference — but the page is a
  video landing page, not a transcript (see Gaps).
- **AHA Programming** — Kent C. Dodds (creator of Testing Library; long-running React educator),
  **22 Jun 2020** — [https://kentcdodds.com/blog/aha-programming](https://kentcdodds.com/blog/aha-programming)
  — "Avoid Hasty Abstractions"; abstraction becomes "your whole application in `if` statements"; be
  fine with duplication "until you feel pretty confident that you know the use cases"; "Optimize for
  change first". Unique contribution: an actionable *timing* rule (wait for confidence in the use
  cases) rather than a slogan.
- **Inversion of Control** — Kent C. Dodds, **18 Nov 2019** —
  [https://kentcdodds.com/blog/inversion-of-control](https://kentcdodds.com/blog/inversion-of-control)
  — The boolean-flag/options-explosion arithmetic (16 combinations for 6 use cases), IoC defined, and
  the two React vehicles: compound components and the state reducer. Unique contribution: the
  strongest single framing of *why* composition beats configuration.
- **Compound Components with React Hooks** — Kent C. Dodds, **18 Feb 2019** —
  [https://kentcdodds.com/blog/compound-components-with-react-hooks](https://kentcdodds.com/blog/compound-components-with-react-hooks)
  — Definition, the `<select>`/`<option>` analogy, why flat config props fail on per-child attributes,
  and Context as the implicit-state mechanism. Unique contribution: the canonical definition of the
  `<Select><Select.Option/></Select>` pattern.
- **Presentational and Container Components** — Dan Abramov, 2015 with a **2019 update** retracting
  the recommendation —
  [https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
  — The origin *and* the retraction of the pattern; hooks remove the need for the "arbitrary
  division". Unique contribution: the author's own withdrawal, which is the key fact for the
  presentational-vs-connected question. **Caveat: medium.com returns 403 to automated fetching; the
  update's wording here is paraphrase from search extraction, not verbatim.**
- **React Query blog series** (React Query as a State Manager / Practical React Query / Effective
  React Query Keys / The Query Options API) — Dominik Dorfmeister (TkDodo), TanStack Query maintainer —
  [https://tkdodo.eu/blog/react-query-as-a-state-manager](https://tkdodo.eu/blog/react-query-as-a-state-manager),
  [https://tkdodo.eu/blog/practical-react-query](https://tkdodo.eu/blog/practical-react-query),
  [https://tkdodo.eu/blog/effective-react-query-keys](https://tkdodo.eu/blog/effective-react-query-keys),
  [https://tkdodo.eu/blog/the-query-options-api](https://tkdodo.eu/blog/the-query-options-api) — The
  client-side case for colocated fetching: a component "can fetch its own data, co-located, right
  where you need it", wrapped in a custom hook to keep fetching out of the UI; colocation makes
  components movable. Unique contribution: the argument that a cache (not a container) is what makes
  colocated fetching safe. **Quotes gathered via search extraction, not direct page fetches.**

**Design-system / library primary docs (authority: official docs for that library)**
- **Composition (asChild)** — Radix Primitives, WorkOS/Radix team —
  [https://www.radix-ui.com/primitives/docs/guides/composition](https://www.radix-ui.com/primitives/docs/guides/composition)
  — `asChild` clones the child and passes it the props/behavior; consumer must spread props and
  forward refs; changing the element type makes accessibility the consumer's responsibility. Unique
  contribution: the polymorphism-by-composition contract, and the explicit transfer of a11y
  responsibility.
- **Composition (render prop)** — Base UI v**1.8.0** (MUI team) —
  [https://base-ui.com/react/handbook/composition](https://base-ui.com/react/handbook/composition) —
  The `render` prop accepting an element *or* a function, with the same spread-props/forward-ref
  contract; the function form "allows you to render different content based on the component's state".
  Unique contribution: evidence that render props are a deliberate 2025-era API choice in a new
  first-tier primitives library, not a legacy survival.
- **API design approach** — Material UI (MUI) — [https://mui.com/material-ui/guides/api/](https://mui.com/material-ui/guides/api/)
  — `children` is "the idiomatic way to do composition"; boolean for 2 values, enum for >2 or likely
  growth; boolean defaults `false`, named with adjectives/nouns not verbs because "props describe
  *states* and not *actions*"; controlled `value`/`onChange`, handlers noun-then-verb; nested-component
  escape hatches `xxxProps`/`xxxComponent`/`xxxRef`; undocumented props spread to the root. Unique
  contribution: the only published, rule-shaped props-API style guide I found. **No date on page.**
- **shadcn/ui docs** — shadcn (Vercel) — [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs) —
  "This is not a component library. It is how you build your component library."; "The top layer of
  your component code is open for modification."; "Every component uses a common, composable
  interface, making them predictable." Unique contribution: the source-ownership answer to the
  design-system boundary question, and interface uniformity as an explicit design goal.
- **Primer components** + **primer/primitives DESIGN_TOKENS_GUIDE** — GitHub —
  [https://primer.style/components/](https://primer.style/components/),
  [https://github.com/primer/primitives/blob/main/DESIGN_TOKENS_GUIDE.md](https://github.com/primer/primitives/blob/main/DESIGN_TOKENS_GUIDE.md)
  — System components must "reuse or extend existing patterns and primitives rather than creating
  overrides" (colors, spacing, sizes, type). Unique contribution: a real system stating the
  no-override rule for primitives. (Primer's component-lifecycle/promotion criteria were not
  retrievable — see Gaps.)

**Architecture guidance (authority: community consensus / widely-adopted reference)**
- **project-structure.md** — Bulletproof React, Alan Alickovic (alan2207) —
  [https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  — Feature folders with a public `index.ts` API, no cross-feature imports, composition at the app
  level, unidirectional `shared → features → app` enforced by `import/no-restricted-paths`. Unique
  contribution: the only source here that makes the boundary rule *machine-enforced* rather than
  advisory. Authority: community consensus (very widely cited reference architecture, not an official
  React artifact).

**Corroborating / lower-authority (use with attribution)**
- **Render Props Pattern** — patterns.dev — [https://www.patterns.dev/react/render-props-pattern/](https://www.patterns.dev/react/render-props-pattern/)
  — States that "in a 2025 codebase, render props are no longer the default tool for sharing logic —
  custom hooks are", lists pros (no naming collisions, markup freedom, TS generics) and cons (callback
  pyramids, cognitive load), and notes Apollo/React Router/Formik moved hooks-first. Authority:
  community consensus (a well-known pattern catalogue; the page did not identify its author in the
  fetched content).
- **Render Props Are Not Dead** — Maryan Mats — [https://maryanmats.com/blog/render-props-are-not-dead/](https://maryanmats.com/blog/render-props-are-not-dead/)
  — Argues hooks replaced render props for logic sharing but not for rendering control, since a hook
  "cannot wrap your JSX in component boundaries"; cites Headless UI v2's children-as-function API and
  Base UI v1.0 (Dec 2025) choosing `render` over `asChild`. Authority: low (individual blog); the Base
  UI `render` prop is independently confirmed, the *rationale* is not.
- **Top Headless UI libraries for React in 2026** — GreatFrontEnd — [https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026)
  — React Aria (Adobe) ships behavior/ARIA/i18n as **hooks** across 40+ patterns. Authority: low/
  commercial-editorial; use only for the observation that headless-as-hooks coexists with
  headless-as-render-props.
- **Design-system contribution criteria** — Digital NSW —
  [https://www.digital.nsw.gov.au/delivery/digital-service-toolkit/design-system/contributing/contribution-criteria](https://www.digital.nsw.gov.au/delivery/digital-service-toolkit/design-system/contributing/contribution-criteria)
  — Multi-product need, project-agnostic with "no proprietary logic, smartness or complexity tied to a
  specific project", uniqueness/extend-don't-duplicate, tested in live/beta first. Authority: would be
  official docs for that system, **but the URL 404'd on direct fetch** — verify before citing.
- **"I made this. Does it go in the system?"** — Nathan Curtis, EightShapes —
  [https://medium.com/eightshapes-llc/i-made-this-does-it-go-in-the-system-3b67b9894531](https://medium.com/eightshapes-llc/i-made-this-does-it-go-in-the-system-3b67b9894531);
  **"Design System Checklist: How to Screen New Components"** — Salesforce UX —
  [https://medium.com/salesforce-ux/design-system-checklist-how-to-screen-new-components-f278d3e3efa](https://medium.com/salesforce-ux/design-system-checklist-how-to-screen-new-components-f278d3e3efa)
  — Source of the rule-of-three reuse evidence and the "distinguish design-system code from
  product-aware feature UI" framing. Authority: recognized practitioner (Curtis) / corporate UX org,
  but Medium posts rather than versioned docs, and both were surfaced via search rather than fetched.

### Inferences
- Authority is lopsided by topic: *when to split* and *prop drilling* are well covered by official
  docs; *composition patterns* and *props-API rules* rest on expert blogs and library docs; the
  *design-system boundary* has the weakest sourcing of all and is the area where the report should
  hedge most.
- Where sources disagree, the disagreements worth surfacing explicitly in the report are:
  1. **Abstraction vs duplication** — Metz/Abramov/Dodds ("prefer duplication", "some duplication is
     fine", wait for confidence) vs react.dev's own extraction exercises ("extract to reduce the
     duplication") and DRY orthodoxy generally. Both positions are cited above; the reconciliation is
     timing and confidence, not principle.
  2. **`asChild` vs `render`** — Radix vs Base UI, two current first-tier libraries solving
     polymorphic composition with incompatible APIs.
  3. **Render props: legacy or not** — patterns.dev says not the default for logic sharing in 2025;
     Base UI v1.x adopts a `render` prop as a core API. Both are true because they concern different
     jobs (logic sharing vs rendering control).
  4. **Colocated fetching** — Next.js/react.dev/TkDodo endorse fetching in the component that needs
     the data; the 2015-2019 container-component orthodoxy forbade it and was retracted by its author.
  5. **Barrel files as a feature's public API** — Bulletproof React prescribes `index.ts` as the
     feature's public API *and* warns to import files directly instead; the doc contains both.

### Gaps
- Not reached within budget: Atlassian Design System, Shopify Polaris, IBM Carbon architectural/
  contribution docs; Michael Chan, Ryan Florence, Mark Erikson and Josh Comeau (no citable material
  from them in this research — do not attribute positions to them in the report).
- No transcript of "The WET Codebase" (video only).
- No authoritative source for: line-count split thresholds, prop-count thresholds, the term "god
  component", or a rule against deep components fetching.
- React 19-specific *design* guidance beyond RSC/`use` (e.g. how Actions and `<form action>` change
  where mutation logic lives, or `ref` as a prop removing `forwardRef`) was not researched; the RSC
  and `use` material above is the extent of my React 19 coverage.
