---
name: over-mocking
description: Use when a PR adds or changes tests that use mocks, stubs, spies or fakes. Flag tests that mock the code under test, mock so much that the assertion only checks the mock, or assert on call details instead of observable behaviour.
type: convention
---

A test earns its keep only if it fails when the real code is wrong; an over-mocked test passes
regardless. For each mock in a changed test, ask: **if the production code broke, would this test
notice?**

Look for:

- **Mocking the unit under test** — stubbing the function or module the test claims to verify,
  or a private helper of it, so only the stub runs.
- **Tautological assertions** — the mock returns `X` and the test asserts the result is `X`,
  with no logic in between.
- **Interaction-only assertions** — `toHaveBeenCalledWith(...)` as the sole check, pinning call
  details instead of the returned value or resulting state. They break on harmless refactors and
  miss real bugs.
- **Mocking cheap code you own** — pure functions, validators, in-memory repositories that
  could simply run for real.
- **Mocks that contradict the real contract** — a stub returning a shape the real dependency
  never returns, or succeeding where the real one throws.
- **Global patching not restored** — a module mock leaking into other tests.

Mock at real boundaries — network, clock, randomness, filesystem, third-party APIs — with fakes
that honour the real contract.

Cite `file:line` of the mock or the assertion in the diff and name the real defect the test would
miss.

Severity:
- **CRITICAL** — the only test of security-, money- or data-critical logic mocks that logic
  away, so it is effectively untested.
- **WARNING** — a test that could not fail for a plausible bug, or a mock that contradicts the
  real contract.
- **SUGGESTION** — an interaction assertion that could be a behaviour assertion.
