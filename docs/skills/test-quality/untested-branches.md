---
name: untested-branches
description: Use when a PR adds or changes production code together with its tests. Flag every new or changed branch in the production code — if/else, switch case, early return, throw, catch, fallback — that no test in the diff drives, especially when the tests exercise only the happy path.
type: rubric
---

For each production function the diff adds or changes, list its branches and map each one to the
test that drives it. A branch is covered only when a test **reaches it and asserts its outcome** —
calling the function on the happy path does not cover its error path.

Look for:

- **Happy-path-only tests** — every test feeds valid input and asserts success, while the code
  also has a validation failure, a not-found case, a permission check or a `catch`.
- **Error paths** — `throw`, `reject`, error status returns, `catch` blocks and retries no test
  triggers. Asserting only that "something threw" is weak coverage.
- **Guards and early returns** — `if (!x) return …`, feature flags, empty-input short-circuits.
- **Each arm of a switch, lookup or ternary**, including `default`.
- **Fallbacks** — `??`, `||`, default parameters, "use the cached value if present".
- **A new branch in existing code** whose existing tests were not extended.

Report one finding per uncovered branch (or per function when several share a cause). Cite
`file:line` of the **untested branch in the production code** from the diff, name the test file
that should cover it, and state the input that reaches the branch and what could break unnoticed.

Severity:
- **CRITICAL** — the branch guards security, money, data integrity or a public contract, and a
  defect in it would ship with every test green.
- **WARNING** — any other untested error path, guard or arm that carries real behaviour.
- **SUGGESTION** — a trivial branch (logging, a defensive `default` that only rethrows).

Do not flag branches in code the diff did not touch, generated code or type declarations.
