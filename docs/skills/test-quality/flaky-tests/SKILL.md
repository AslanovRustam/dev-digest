---
name: flaky-tests
description: Use when a PR adds or changes tests. Flag tests whose result can change between runs without a code change — real time, randomness, ordering, shared state, network, or waits on timing instead of on a condition.
type: rubric
allowed-tools: Bash(bash scripts/detect-flaky.sh)
---

A flaky test fails sometimes for reasons unrelated to the code. It teaches the team to re-run CI
and ignore red, which hides real failures. For each changed test, ask: **is every input fixed and
every wait tied to a condition?**

Look for:

- **Real time** — `Date.now()`, `new Date()`, expiry checks, or formatting that depends on the
  machine's timezone or locale. Use a fake clock and a fixed timezone.
- **Sleeps instead of waits** — `sleep(500)`, `await delay(100)`, `waitForTimeout` before an
  assertion. Wait for the condition instead.
- **Randomness** — `Math.random`, random ids or unseeded fake data feeding an assertion.
- **Order dependence** — shared module state, rows left by a previous test, a singleton not
  reset, `beforeAll` data mutated by one test and read by another; asserting the order of an
  unordered query result.
- **Unawaited async** — a missing `await` on an assertion or setup step, a floating promise that
  fails after the test ends.
- **External dependencies** — real network or third-party APIs, a shared database, a fixed port,
  environment variables set by another test.
- **Tight timeouts** — close to the operation's normal duration, so they fail under CI load.

Cite `file:line` of the nondeterministic call or the wait in the diff, name the source of
nondeterminism, and give the deterministic replacement.

Severity:
- **WARNING** — a test whose outcome can realistically differ between runs.
- **SUGGESTION** — a latent risk (a generous sleep that could become a condition wait).
- **CRITICAL** — only when the flakiness masks a real failure, e.g. a race that lets the only
  test of critical logic pass while the logic is broken.
