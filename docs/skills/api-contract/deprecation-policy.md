---
name: deprecation-policy
description: Use when a PR removes, renames or replaces a route, a request param, a response field or an enum value. Flag silent removal — the old surface must first be marked deprecated (annotation, schema description, Deprecation/Sunset headers, docs) and keep working for a deprecation window before it is deleted.
type: convention
---

Clients cannot react to a change they were never told about. Removing a public surface is a two-step
process: **deprecate** (it keeps working and says it is going away), then **remove** in a later,
major release.

When the diff removes or replaces a contract element, check for:

- **Marked, not deleted** — the old route/field/param still works and is marked: a `@deprecated`
  JSDoc with the replacement, a schema `.describe('Deprecated: use …')`, `deprecated: true` in the
  OpenAPI operation or property.
- **Runtime signal** — responses of a deprecated route carry `Deprecation: true` (or a date) and a
  `Sunset: <http-date>` header, optionally a `Link: <…>; rel="successor-version"`.
- **A replacement exists** — the new surface ships in the same PR or already exists, and the
  deprecation note names it.
- **A window** — removal happens only after the announced sunset, in a major version, with a
  CHANGELOG line.

**Bad** — the field disappears in one step; clients learn about it from a crash:

```ts
  export const Repo = z.object({
    id: z.string(),
-   default_branch: z.string(),
  });
```

**Good** — the field stays, is marked, and the route tells clients when it goes:

```ts
  export const Repo = z.object({
    id: z.string(),
    /** @deprecated use `branches.default`; removed after 2026-12-31 (v3). */
    default_branch: z.string().describe('Deprecated: use branches.default'),
    branches: z.object({ default: z.string() }),
  });
  reply.header('Deprecation', 'true').header('Sunset', 'Thu, 31 Dec 2026 23:59:59 GMT');
```

Removing something that was **already** deprecated with a passed sunset date, in a major version,
is correct — do not flag it.

Severity: **CRITICAL** — a public route, param or field removed or renamed with no prior
deprecation and no alias in the diff. **WARNING** — deprecated but with no replacement named, no
sunset date or no runtime signal. **SUGGESTION** — a deprecation note that could name its
successor more clearly. Cite `file:line` of the removed or newly deprecated element in the diff.
