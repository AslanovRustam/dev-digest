---
name: breaking-change
description: Use when a PR adds, removes or edits an HTTP route, its handler registration, its request schema or the status codes it returns. Flag any change or removal of the public contract that makes a request an existing client already sends fail or mean something else — renamed or removed paths, changed methods, renamed or retyped params, newly required inputs, stricter validation, new auth, changed status codes.
type: rubric
---

For every touched route, compare the request contract **before and after** the diff and ask: would
a request that succeeded yesterday still succeed, with the same meaning and the same status?

Breaking:

- **Path / method** — renamed, moved under a new prefix, removed, segments reordered;
  `POST` → `PUT`; a method dropped from a path.
- **Params** — path param renamed (`:id` → `:repoId`) or narrowed (any string → uuid); query param
  renamed, removed, retyped, newly required, or its default changed.
- **Body** — field renamed, removed or retyped; a **new required field**; optional made required;
  stricter validation (lower max, narrower enum, rejecting keys clients send).
- **Auth / headers** — a public route now needs auth, a new role or scope, a new required header.
- **Status** — success `200` ↔ `201` ↔ `204`; an error class moved (`404` → `400`, `400` ↔ `422`,
  `401` ↔ `403`); a typed 4xx that now leaks a raw `500`.

Not breaking: a new route, a new **optional** param or field, relaxed validation.

**Bad** — renames the param and the path in place; every existing caller now gets 404:

```ts
- app.get('/repos/:id/pulls', { schema: { params: IdParams } }, list);
+ app.get('/pulls/:repoId', { schema: { params: RepoIdParams } }, list);
```

**Good** — the new route ships beside the old one, which stays until a deprecation window ends:

```ts
app.get('/v2/pulls/:repoId', { schema: { params: RepoIdParams } }, list);
app.get('/repos/:id/pulls', { schema: { params: IdParams }, onSend: markDeprecated }, list);
```

Before reporting, look for evidence the break is handled — callers updated in the same PR, a
versioned route beside the old one, a deprecation alias — and lower the severity if so.

Severity: **CRITICAL** — an existing client call fails or changes meaning and the diff has no
version or alias. **WARNING** — callers in this PR updated but external clients possible.
**SUGGESTION** — naming of a new route. Cite `file:line` of the changed registration or schema in
the diff; show the old and new signature and one concrete request that now fails, with its status.
