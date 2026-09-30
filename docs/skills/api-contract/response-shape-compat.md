---
name: response-shape-compat
description: Use when a PR changes what an endpoint returns — a response schema, a serializer, a DTO mapper, a shared contract type or the query feeding a response. Flag removed, renamed or retyped fields, changed nullability, narrowed or extended enums and changed nesting that existing clients read.
type: rubric
---

A client parses the response it was written against. Compare each touched response shape **before
and after** the diff, field by field, including nested objects and list items.

Breaking changes:

- **Removed or renamed field** — `created_at` → `createdAt`, a field dropped or moved into a
  nested object.
- **Retyped field** — number → string (ids, money), a single value → array, a date's format
  changed (ISO string → epoch).
- **Nullability** — an always-present field becomes nullable or optional, or `null` is replaced
  by an omitted key.
- **Enums** — a value removed or renamed; also a **new value** in an enum clients switch over
  exhaustively.
- **Collections** — an array wrapped into `{ items, total }`, pagination added to a complete
  list, ordering changed where clients relied on it.
- **Same name, new meaning** — units changed (seconds → ms, cents → units), a count that now
  excludes some rows.
- **Contract drift** — the schema or shared type promises one shape while the handler or mapper
  returns another.

Not breaking: a new optional field.

Where the repo keeps shared contracts, check that every copy and every consumer in the diff moved
together. Cite `file:line` of the changed schema, type or mapper in the diff; show the old and new
shape and the client read that now fails.

Severity:
- **CRITICAL** — a field clients read is removed, renamed or retyped, or its nullability or enum
  changes, with no versioning or consumer update in the diff.
- **WARNING** — consumers updated in this PR but external clients possible; an enum extension; a
  new meaning under the same name.
- **SUGGESTION** — naming or consistency of a new field.
