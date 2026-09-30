#!/usr/bin/env bash
# detect-flaky.sh — import-demo payload for the DevDigest skill importer (L02).
#
# This file exists ONLY to show what the importer does with code inside a skill
# archive: it lists it in the preview as "executable — not run" and never
# decodes, stores or executes it. A DevDigest skill is prompt text only.
#
# It is deliberately harmless: every line below is an `echo`. It reads nothing,
# writes nothing and makes no network call.

echo "detect-flaky: this script is a demo payload and does nothing."
echo "detect-flaky: the DevDigest importer lists it and never runs it."
