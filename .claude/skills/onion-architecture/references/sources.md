# Sources

Where the rules in `SKILL.md` come from, and what each source actually contributes.
Every link was fetched when this skill was written (2026-09-29).

## Onion / Clean Architecture

- **[The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)** —
  Jeffrey Palermo, 2008, the original. The dependency rule in one sentence:
  *"All code can depend on layers more central, but code cannot depend on layers
  further out from the core."* And the consequence we lean on: *"The Domain Model
  is the very center, and since all coupling is toward the center, the Domain
  Model is only coupled to itself."*
  Parts [2](https://jeffreypalermo.com/blog/the-onion-architecture-part-2/),
  [3](https://jeffreypalermo.com/blog/the-onion-architecture-part-3/),
  [4 — After Four Years](https://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/).

- **[Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)** —
  Herberto Graça. Places the onion between Layered and Ports & Adapters. Source of
  the rule that we do NOT require pass-through layers: *"the layers above can use
  any layer beneath them, not just the layer immediately beneath"* — which is why
  a `routes.ts` may call `container.jobs` directly instead of proxying everything
  through its service.

- **[Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/)** —
  NDepend. The four rings, the ORM-leakage pitfall (*frameworks like Entity
  Framework shouldn't appear in domain layers*) — our `sql-only-in-repository` and
  `domain-files-are-pure` rules — and the honest caveat that the pattern is
  *"overkill"* for small CRUD, which is why `SKILL.md` has a "do not fix these"
  section.

- **[The Dependency Rule in Clean Architecture](https://milanjovanovic.tech/blog/dependency-rule-clean-architecture)** —
  Milan Jovanović. Practical framing of inward-only dependencies.

- **[Do you know the layers of the onion architecture?](https://www.ssw.com.au/rules/do-you-know-the-layers-of-the-onion-architecture)** —
  SSW. Short checklist version.

## Node / Fastify

- **[Fastify — Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/)** —
  the encapsulation model this server's composition root relies on: *"register
  creates a new Fastify context… those changes will not be reflected in the
  context's ancestors"* and *"encapsulation applies to the ancestors and siblings,
  but not the children"*. That is exactly why `app.decorate('container', …)` and
  the error handler are registered in `app.ts` **before** the module loop — module
  plugins are children and inherit both.
  Also [Plugins Reference](https://fastify.dev/docs/latest/Reference/Plugins/).

- **[Yet another vision of Clean Architecture](https://borjatur.com/2023/03/07/yet-another-vision-of-clean-architecture/)**
  + **[clean-architecture-fastify-mongodb](https://github.com/borjatur/clean-architecture-fastify-mongodb)** —
  a worked Fastify + clean-architecture layout.

- **[marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate)** —
  Fastify 5 with Clean Architecture / DDD / CQRS. Useful as a contrast: it splits
  layers by top-level folder, where DevDigest keeps vertical slices. Both satisfy
  the dependency rule; the rule is what matters, not the folder shape.

- **[The Ultimate Clean Architecture Template for TypeScript Projects](https://medium.com/better-programming/the-ultimate-clean-architecture-template-for-typescript-projects-e53936269bb9)**

## Repository pattern / Drizzle

- **[Repository Pattern — Cosmic Python](https://www.cosmicpython.com/book/chapter_02_repository)** —
  the canonical statement of the inversion: *your domain models should have no
  dependencies and the ORM should depend on your domain models*, not the reverse.

- **[Drizzle ORM Best Practices](https://blog.paulserban.eu/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)** —
  wrap Drizzle queries in a per-resource repository module; keep query logic out
  of route handlers.

- **[Repository Pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)** —
  on type leakage: if repository methods return Drizzle query builders or expose
  DB-specific error types, the business logic becomes dependent on Drizzle's API.
  This is why our repositories return rows and the module maps them to DTOs.

## Zod / the system boundary

- **[Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)** —
  Alexis King. *"Push the burden of proof upward as far as possible, but no
  further… Ideally, this should happen at the boundary of your system, before any
  of the data is acted upon."* The reason validation lives in the route `schema`
  and never as `Schema.parse(req.body)` halfway down a handler: once past ring 4,
  the value is already the right type and nothing re-checks it.

- **[Zod — Basics](https://zod.dev/basics)** ·
  **[Best Practices with Zod](https://stevekinney.com/courses/full-stack-typescript/zod-best-practices)** —
  *schemas guard the perimeter, types guard the interior.*

## Enforcing it mechanically

- **[dependency-cruiser — rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)** —
  the `forbidden` rule shape, `pathNot`, `dependencyTypesNot`, `viaNot`, and `$1`
  backreferences. All used in `server/.dependency-cruiser.cjs`.

- **[How to maintain clean architecture with dependency rules](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)** ·
  **[Dependency Cruiser: Restrict Imports in JavaScript](https://spin.atomicobject.com/dependency-cruiser-imports/)** ·
  **[Validate Dependencies According to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)** —
  prior art for encoding layer rules as a depcruise config and running it in CI.
