---
name: corner-cases
description: Use when a PR adds or changes tests for code that takes inputs — numbers, strings, collections, dates, pages, concurrent calls. Flag the boundary and corner inputs the code handles (or should handle) that no test in the diff exercises.
type: rubric
---

For each changed function under test, read its inputs and conditions, then check that a test pins
the behaviour **at and just past each boundary**. One "typical" value per parameter says nothing
about the edges.

Corner inputs, where they apply:

- **Empty / absent** — `[]`, `''`, `{}`, `null`, `undefined`, a missing optional field.
- **Zero and negatives** — `0`, `-1`, negative amounts, `NaN`, `Infinity`.
- **Maximum** — the largest allowed value and one past it, very long strings, huge collections.
- **Off-by-one** — `<` vs `<=`, first and last element, exactly `limit` items, a page boundary,
  inclusive vs exclusive range ends.
- **Text** — unicode, emoji, combining characters, whitespace-only, case and trailing spaces.
- **Time** — timezones, DST transitions, month and year ends, leap days.
- **Duplicates and ordering** — repeated keys, unsorted input.
- **Concurrency** — two calls racing on one record, a retry after a partial write.

Report only corners the code **actually has**: a comparison, a limit, a parse, a date operation or
a collection it iterates. Name the missing input and the behaviour it would pin. Cite `file:line`
from the diff — the condition or parameter in the production code — and the test file that should
cover it.

Severity:
- **CRITICAL** — an untested boundary on money, auth, quotas or data integrity where an
  off-by-one or empty input corrupts data or grants access, with every test green.
- **WARNING** — a real, reachable boundary with no test.
- **SUGGESTION** — an unlikely corner (exotic unicode in an internal id).

One test per distinct boundary is enough; do not demand an exhaustive matrix.
