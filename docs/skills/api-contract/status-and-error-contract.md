---
name: status-and-error-contract
description: Use when a PR changes route handlers, error handling, validation, pagination or API versioning. Flag changed success or error status codes, a changed error envelope, broken pagination semantics, lost idempotency, and removals without a deprecation path.
type: convention
---

Clients branch on status codes and parse error bodies as much as success bodies. Treat both as
contract and compare them **before and after** the diff.

Flag:

- **Success status** — `200` ↔ `201` ↔ `204`, or a body removed by switching to `204`.
- **Error status** — not-found turned into `400` or `500`, validation moved between `400` and
  `422`, `401` ↔ `403`, a conflict that now returns `200`, or a path that now **leaks a raw
  `500`** where a typed 4xx was returned.
- **Error envelope** — the error body's shape changed (`{ error }` → `{ message, code }`), a
  machine-readable `code` renamed, or a handler using a different envelope from the rest.
- **Pagination** — cursor ↔ offset, a changed page-size default or maximum, `next` / `total`
  removed, or unstable ordering that duplicates or skips items across pages.
- **Idempotency** — a `PUT` or `DELETE` that stops being idempotent, a retry-safe `POST` that now
  creates duplicates, a dropped idempotency-key check.
- **Deprecation** — a route or field removed, or a version prefix changed, with no deprecation
  period.

Cite `file:line` in the diff where the status, error shape or pagination logic changed, and name
the client behaviour that breaks — a retry loop, an error parser, a "load more" cursor.

Severity:
- **CRITICAL** — a status code, error envelope or pagination contract clients branch on changes
  with no versioning, or a retried request can now duplicate or lose data.
- **WARNING** — an inconsistent new error shape, a new reachable raw `500`, or a break with
  callers updated in this PR.
- **SUGGESTION** — a more precise status or error code for a new endpoint.
