---
name: semver-discipline
description: Use when a PR changes a public API contract and also when it touches a version marker — package.json version, an API version prefix (/v1), OpenAPI info.version, a CHANGELOG or release notes. Flag a breaking change shipped without a major bump, a major bump with no breaking change, and a version marker that disagrees with what the diff actually does.
type: rubric
---

The version number is a promise about compatibility. Classify the diff, then check that every
version marker it touches says the same thing.

Classify the contract change:

- **MAJOR** — anything a correct existing client can trip over: a removed or renamed route, field,
  param or enum value; a retyped field; a new required input; a changed status code or error
  envelope; a default that changes behaviour.
- **MINOR** — backwards-compatible additions: a new route, a new optional field or param, a new
  enum value clients are documented to tolerate.
- **PATCH** — no contract change: bug fixes that keep the documented behaviour.

Then check the markers:

- a MAJOR change with only a minor/patch bump of the published package or API version;
- a MAJOR change to a versioned prefix (`/v1/...`) made **in place** instead of under `/v2`;
- OpenAPI `info.version`, `package.json` and the CHANGELOG disagreeing with each other;
- a CHANGELOG entry missing for a contract change, or listing a break under "Fixed".

**Bad** — a removed field shipped as a patch:

```diff
- "version": "2.4.1",
+ "version": "2.4.2",
  ...
- amount_cents: z.number(),
```

**Good** — the break carries a major bump and a changelog line that tells clients what to do:

```diff
- "version": "2.4.1",
+ "version": "3.0.0",
+ ## 3.0.0 — BREAKING: `amount_cents` removed; read `amount.minor` instead.
```

If the repo has no version marker at all, do not invent one — report the break under the other
skills and mention the missing version only as a SUGGESTION.

Severity: **CRITICAL** — a breaking change published under a non-major version, or an in-place
change of a versioned route. **WARNING** — markers that disagree with each other; a break with no
CHANGELOG entry. **SUGGESTION** — a needless major bump. Cite `file:line` of the version marker or
the breaking line in the diff.
