# flaky-tests — reference notes

Extra material that travels with the skill folder. It is **not** part of the skill body.

When this folder is zipped and imported into DevDigest, only `SKILL.md` becomes the skill. The
importer lists this file as *extra markdown — not imported*, and `scripts/detect-flaky.sh` as
*executable — not run*. The `allowed-tools` key in the `SKILL.md` frontmatter is dropped with a
warning: in a coding agent it would grant a tool; in DevDigest a skill is prompt text only.

Further reading on flaky tests:

- Google Testing Blog — "Flaky Tests at Google and How We Mitigate Them".
- Martin Fowler — "Eradicating Non-Determinism in Tests".
