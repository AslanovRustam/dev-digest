// Phase 6 — PreToolUse gate on `gh pr create` / `gh pr merge` (and optionally `git push`).
//
// Fails OPEN on every error: a broken hook must never paralyse the repo. Same posture as
// engineering-insights/scripts/stop-check.mjs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildDiff, diffHash, gitSafe, outDir, readConfig, readJson, shortHash } from './lib.mjs';

const RUN = '`/pr-self-review`';

/**
 * The skill has `disable-model-invocation: true`: only the user can start it. Every denial must
 * therefore tell the agent to ASK the user, not to run it — an agent told to "run /pr-self-review"
 * tries the Skill tool, fails, and starts improvising the steps by hand.
 */
const CANNOT_INVOKE = `${RUN} has auto-invocation disabled, so you cannot invoke it yourself`;

/**
 * Split a shell line into statements, with quoted spans blanked out first.
 *
 * Matching the bare substring anywhere is wrong: it denies `echo "gh pr create"` and any command
 * that merely writes documentation mentioning the command. Only a statement that BEGINS with the
 * invocation counts.
 *
 * Also used by `.claude/hooks/implementer-guard.mjs` — keep the signature stable.
 */
export function statements(command) {
  const masked = String(command ?? '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, (m) => ' '.repeat(m.length));
  return masked.split(/&&|\|\||[;\n|]/);
}

export function classify(command, { gateOnPush = false } = {}) {
  for (const raw of statements(command)) {
    // strip grouping and leading `VAR=value` assignments
    const s = raw.trim().replace(/^[({\s]+/, '').replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');
    if (/^gh\s+pr\s+create\b/.test(s)) return 'pr-create';
    if (/^gh\s+pr\s+merge\b/.test(s)) return 'pr-merge';
    if (gateOnPush && /^git\s+push\b/.test(s)) return 'push';
  }
  return null;
}

/** Body text as `gh` will see it: inline `--body`, or the contents of `--body-file`/`-F`. */
export function bodyText(command, readFile) {
  const c = String(command ?? '');
  let text = c;
  const re = /(?:--body-file|-F)[=\s]+("([^"]+)"|'([^']+)'|(\S+))/g;
  let m;
  while ((m = re.exec(c)) !== null) {
    const path = m[2] ?? m[3] ?? m[4];
    try {
      text += `\n${readFile(path)}`;
    } catch {
      /* unreadable → the marker simply will not be found */
    }
  }
  return text;
}

/**
 * Pure decision, so gate.test.mjs can exercise every branch without touching git.
 * @returns {{deny:boolean, reason?:string}}
 */
export function decide({ action, command, report, currentDiffHash, readFile }) {
  if (!action) return { deny: false };

  if (!report) {
    return {
      deny: true,
      reason: `No self-review report found (.devdigest/pr-self-review/report.json). Ask the user to run ${RUN}, then retry this command — ${CANNOT_INVOKE}.`,
    };
  }

  if (currentDiffHash && report.diff_hash && currentDiffHash !== report.diff_hash) {
    return {
      deny: true,
      reason: `The self-review report is stale: the change set moved since it was written (report ${shortHash(report.diff_hash)}, current ${shortHash(currentDiffHash)}). Ask the user to re-run ${RUN}, then retry this command — ${CANNOT_INVOKE}.`,
    };
  }

  if (report.checks_skipped) {
    return {
      deny: true,
      reason: `The last self-review skipped the verification commands (\`checks.mjs --skip\` / \`report.mjs --checks-skipped\`), so the report cannot be a PASS. Ask the user to re-run ${RUN} with the checks enabled — ${CANNOT_INVOKE}.`,
    };
  }

  if (report.verdict === 'BLOCKED' && !report.overridden) {
    // `blocking` is set by report.mjs against the configured threshold, so this stays correct
    // for `fail_on: warning` / `any` too.
    const blockers = (report.findings ?? [])
      .filter((f) => (f.blocking ?? f.severity === 'CRITICAL') && !f.suppressed)
      .map((f) => `  • ${f.file}:${f.start_line} — ${f.title}`)
      .join('\n');
    return {
      deny: true,
      reason:
        `Self-review is BLOCKED by ${report.blockers_count ?? 'one or more'} critical finding(s):\n${blockers}\n\n` +
        `Fix them, then ask the user to re-run ${RUN} (${CANNOT_INVOKE}). If a finding is wrong, ` +
        `either suppress it inline (\`// pr-self-review-ignore: <rule_id> — <reason>\`) or ask the ` +
        `user to re-run ${RUN} with \`--override "<reason>"\` — the override is recorded in the PR body.`,
    };
  }

  if (action === 'pr-create') {
    const marker = `<!-- pr-self-review:${shortHash(report.diff_hash)} -->`;
    if (!bodyText(command, readFile).includes(marker)) {
      return {
        deny: true,
        reason:
          `The PR body must carry the self-review section. Insert the contents of ` +
          `.devdigest/pr-self-review/pr-body-section.md into the body (it starts with \`${marker}\`), ` +
          `e.g. \`gh pr create --body-file .devdigest/pr-self-review/pr-body-section.md\` or append it to your own body file.`,
      };
    }
  }

  return { deny: false };
}

function emitDeny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  if (input?.tool_name !== 'Bash') process.exit(0);

  const config = readConfig();
  const action = classify(input?.tool_input?.command, { gateOnPush: !!config.gate_on_push });
  if (!action) process.exit(0);

  const dir = outDir();
  const report = readJson(join(dir, 'report.json'), null);

  let currentDiffHash = null;
  if (report?.merge_base) {
    const head = gitSafe(['rev-parse', 'HEAD']);
    if (head.ok) currentDiffHash = diffHash(buildDiff(report.merge_base), head.out.trim());
  }

  const verdict = decide({
    action,
    command: input?.tool_input?.command,
    report,
    currentDiffHash,
    readFile: (p) => readFileSync(p, 'utf8'),
  });

  if (verdict.deny) emitDeny(verdict.reason);
  process.exit(0);
}

if (process.argv[1]?.endsWith('gate.mjs')) {
  try {
    main();
  } catch {
    process.exit(0); // fail open, always
  }
}
