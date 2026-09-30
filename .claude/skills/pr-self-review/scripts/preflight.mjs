// Phase 0 — git preflight.
//
// Three checks, each of which silently corrupts the whole review slice if skipped.
// The nastiest is #2: a stale local `main` does not fail, it quietly reviews the wrong files.

import { gitSafe, parseArgs, readConfig } from './lib.mjs';

/** @returns {{stop:boolean, base_ref:string|null, merge_base:string|null, head_sha:string|null, branch:string|null, findings:object[]}} */
export function preflight({ base, offline = false } = {}) {
  const cfg = readConfig();
  const baseName = base ?? cfg.base;
  const findings = [];

  const headSha = gitSafe(['rev-parse', 'HEAD']);
  if (!headSha.ok) {
    return {
      stop: true,
      base_ref: null,
      merge_base: null,
      head_sha: null,
      branch: null,
      findings: [
        finding('PREFLIGHT-NO-GIT', 'CRITICAL', 'Not a git repository (or no commits yet)', 'Run this from inside the repo, on a branch with at least one commit.'),
      ],
    };
  }

  const branchRes = gitSafe(['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchRes.ok ? branchRes.out.trim() : 'HEAD';

  // 1 — are we ON the base branch? Then there is nothing to review as a PR.
  if (branch === baseName) {
    findings.push(
      finding(
        'PREFLIGHT-ON-BASE',
        'CRITICAL',
        `You are on \`${baseName}\` — there is no branch to review`,
        `Create a feature branch first: \`git switch -c feat/<name>\`.`,
      ),
    );
    return { stop: true, base_ref: null, merge_base: null, head_sha: headSha.out.trim(), branch, findings };
  }
  if (branch === 'HEAD') {
    findings.push(
      finding('PREFLIGHT-DETACHED', 'WARNING', 'Detached HEAD', 'Findings are still valid, but there is no branch to open a PR from.'),
    );
  }

  // 2 — the base MUST be origin/<base>, not the local ref. A local `main` is almost always
  //     behind, and then the diff drags in other people's commits.
  let baseRef = baseName;
  const hasOrigin = gitSafe(['remote', 'get-url', 'origin']).ok;

  if (offline || !hasOrigin) {
    findings.push(
      finding(
        'PREFLIGHT-OFFLINE',
        'WARNING',
        hasOrigin ? 'Skipped `git fetch` (--offline)' : 'No `origin` remote — using the local base',
        `Comparing against local \`${baseName}\`; if it is stale the review slice is wrong.`,
      ),
    );
  } else {
    const fetched = gitSafe(['fetch', '--quiet', 'origin', baseName], { timeout: 60_000 });
    if (!fetched.ok) {
      findings.push(
        finding('PREFLIGHT-OFFLINE', 'WARNING', `\`git fetch origin ${baseName}\` failed — using the local base`, fetched.err.trim().split('\n')[0] ?? ''),
      );
    } else if (gitSafe(['rev-parse', '--verify', `origin/${baseName}`]).ok) {
      baseRef = `origin/${baseName}`;
    }
  }

  const mb = gitSafe(['merge-base', baseRef, 'HEAD']);
  if (!mb.ok) {
    findings.push(
      finding('PREFLIGHT-NO-BASE', 'CRITICAL', `Cannot find a merge base with \`${baseRef}\``, `Does the branch \`${baseName}\` exist locally? Try \`git fetch origin ${baseName}\`.`),
    );
    return { stop: true, base_ref: baseRef, merge_base: null, head_sha: headSha.out.trim(), branch, findings };
  }

  // 3 — is the branch behind the base? Advisory only.
  const behind = gitSafe(['rev-list', '--count', `HEAD..${baseRef}`]);
  const behindN = behind.ok ? Number(behind.out.trim()) : 0;
  if (behindN > 0) {
    findings.push(
      finding(
        'PREFLIGHT-BEHIND',
        'WARNING',
        `Branch is ${behindN} commit(s) behind \`${baseRef}\``,
        `Consider \`git rebase ${baseRef}\` before opening the PR — the review is against the merge base, so newer base changes are not accounted for.`,
      ),
    );
  }

  return {
    stop: false,
    base_ref: baseRef,
    merge_base: mb.out.trim(),
    head_sha: headSha.out.trim(),
    branch,
    findings,
  };
}

function finding(ruleId, severity, title, rationale) {
  return {
    id: ruleId,
    rule_id: ruleId,
    source_skill: 'pr-self-review/preflight',
    severity,
    category: 'bug',
    kind: 'hook',
    title,
    file: '.',
    start_line: 0,
    end_line: 0,
    rationale,
    confidence: 1,
    // Facts about the repo state, not claims about a diff hunk — they bypass citation grounding.
    deterministic: true,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('preflight.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const res = preflight({ base: typeof args.base === 'string' ? args.base : undefined, offline: !!args.offline });
  process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  process.exit(res.stop ? 1 : 0);
}
