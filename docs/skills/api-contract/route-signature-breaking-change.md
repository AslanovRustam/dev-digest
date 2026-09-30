---
name: route-signature-breaking-change
description: Use when a PR adds, removes or edits an HTTP route, its handler registration or its request schema. Flag any change that makes a request a correct existing client already sends fail — renamed or removed paths, changed methods, renamed or retyped params, newly required inputs, stricter validation or new auth requirements.
type: rubric
---

Compare each touched route's request contract **before and after** the diff: would a request that
succeeded yesterday still succeed, with the same meaning?

Breaking changes:

- **Path** — renamed, moved under a new prefix, removed, or segments reordered
  (`/repos/:id/pulls` → `/pulls/:repoId`).
- **Method** — `POST` → `PUT`, `GET` → `POST`, or a method removed from a path.
- **Path params** — renamed (`:id` → `:repoId`), narrowed (any string → uuid), or re-meant
  (internal id ↔ external number).
- **Query params** — renamed, removed, retyped, newly required, or a changed default.
- **Request body** — a field renamed, removed or retyped; a **new required field**; optional made
  required; stricter validation (lower max, narrower enum, rejecting extra keys clients send).
- **Headers and auth** — a new required header, a public route now requiring auth, a new role or
  scope check, a changed content type.

Not breaking: a new route, a new **optional** param or field, relaxed validation.

Before reporting, look for evidence the break is handled — callers updated in the same PR, a
versioned route beside the old one, a deprecation alias — and lower the severity if so.

Cite `file:line` of the changed route registration or schema in the diff. Show the old and new
signature and one concrete request that now fails, with its status.

Severity:
- **CRITICAL** — an existing client request now fails or changes meaning, with no version, alias
  or caller update in the diff.
- **WARNING** — callers are updated in this PR but external clients may exist, or behaviour
  changed behind an unchanged signature (a changed default).
- **SUGGESTION** — naming or consistency of a new route.
