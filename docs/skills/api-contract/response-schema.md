---
name: response-schema
description: Use when a PR changes what an endpoint returns — a response schema, a serializer, a DTO mapper, a shared contract type or the query feeding a response. Flag removed, renamed or retyped fields, changed nullability or optionality, narrowed or extended enums, changed nesting or error envelopes that existing clients read.
type: rubric
---

A client parses the response it was written against. Compare each touched response shape **before
and after** the diff, field by field, including nested objects, list items and error bodies.

Breaking:

- **Removed or renamed field** — `created_at` → `createdAt`, a field dropped or moved into a nested
  object.
- **Retyped field** — number → string (ids, money), a value → array, ISO date → epoch.
- **Nullability / optionality** — an always-present field becomes nullable or optional, or `null`
  becomes an omitted key.
- **Enums** — a value removed or renamed; a **new value** in an enum clients switch over.
- **Collections** — an array wrapped into `{ items, total }`, pagination added to a full list.
- **Same name, new meaning** — units changed (seconds → ms, cents → units).
- **Error envelope** — `{ error: { code, message } }` → `{ message }`, a machine-readable `code`
  renamed.
- **Contract drift** — the schema promises one shape while the mapper returns another, or only one
  of two copies of a shared contract changed.

Not breaking: a new optional field.

**Bad** — the DTO renames a field every client reads; nothing else moves:

```ts
  return {
    id: row.id,
-   full_name: row.fullName,
+   fullName: row.fullName,
  };
```

**Good** — add the new name, keep the old one until the next major version:

```ts
  return {
    id: row.id,
    fullName: row.fullName,
    /** @deprecated use `fullName`; removed in v3. */
    full_name: row.fullName,
  };
```

Severity: **CRITICAL** — a field clients read is removed, renamed or retyped, or its nullability or
enum changes, with no versioning or consumer update in the diff. **WARNING** — consumers updated in
this PR but external clients possible; an enum extension; a new meaning under the same name.
**SUGGESTION** — naming or consistency of a new field. Cite `file:line` of the changed schema, type
or mapper in the diff; show the old and new shape and the client read that now fails.
