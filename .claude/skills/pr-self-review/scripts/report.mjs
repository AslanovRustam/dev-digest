// Phase 5 — aggregation, the gate, and the two artefacts the hook reads.
//
// Inputs (all under .devdigest/pr-self-review/):
//   plan.json, diff.patch, deterministic-findings.json, agent-findings.json,
//   verification.json (optional)
// Outputs: report.json, pr-body-section.md

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FAIL_ON_MIN_RANK,
  FULL_FILE_KINDS,
  SEV_EMOJI,
  SEV_RANK,
  countBlockers,
  ensureOut,
  gateTriggered,
  outDir,
  parseArgs,
  parsePatch,
  readConfig,
  readJson,
  repoRoot,
  shortHash,
  writeJson,
  writeText,
} from './lib.mjs';

// `—` is the documented separator; `--` is accepted because an em dash is awkward to type.
// The reason is mandatory: a bare directive must NOT parse.
const IGNORE_RE = /pr-self-review-ignore:\s*([A-Za-z0-9._:-]+)\s*(?:—|--)\s*(\S.*?)\s*$/;

/** Placement / naming / barrels / import direction belong to frontend-ui-architecture. */
const PRECEDENCE = ['pr-self-review/invariants', 'pr-self-review/checks', 'pr-self-review/preflight', 'frontend-ui-architecture'];

const normalizeTitle = (t) =>
  String(t ?? '')
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function normalize(f, i) {
  const severity = String(f.severity ?? '').toUpperCase();
  return {
    id: f.id ?? `F${i}`,
    rule_id: f.rule_id ?? null,
    source_skill: f.source_skill ?? 'unknown',
    severity: SEV_RANK[severity] ? severity : 'SUGGESTION',
    category: f.category ?? 'bug',
    kind: f.kind ?? 'finding',
    title: String(f.title ?? '(untitled)'),
    file: String(f.file ?? '.'),
    start_line: Number.isFinite(f.start_line) ? f.start_line : 0,
    end_line: Number.isFinite(f.end_line) ? f.end_line : Number.isFinite(f.start_line) ? f.start_line : 0,
    rationale: String(f.rationale ?? ''),
    suggestion: f.suggestion ?? null,
    failure_scenario: f.failure_scenario ?? null,
    confidence: typeof f.confidence === 'number' ? f.confidence : 0.6,
    deterministic: f.deterministic === true,
  };
}

/**
 * Citation grounding. A diff-finding survives only if its line range intersects a real hunk.
 *
 * EXCEPTION — full-file scanner kinds ground against the FILE being in the diff, not a hunk.
 * MIRROR of reviewer-core/src/grounding.ts:16. Without this branch a naive filter deletes
 * every secret-leak finding silently.
 */
export function ground(findings, lineIndex, filesInDiff) {
  const kept = [];
  const dropped = [];
  for (const f of findings) {
    if (f.deterministic) {
      kept.push(f);
      continue;
    }
    if (!filesInDiff.has(f.file)) {
      dropped.push({ finding: f, reason: 'file not in the diff' });
      continue;
    }
    if (FULL_FILE_KINDS.has(f.kind)) {
      kept.push(f);
      continue;
    }
    const lines = lineIndex.get(f.file);
    if (!lines || lines.size === 0) {
      dropped.push({ finding: f, reason: 'no hunk lines for this file' });
      continue;
    }
    const lo = Math.min(f.start_line, f.end_line);
    const hi = Math.max(f.start_line, f.end_line);
    let hit = false;
    for (let n = lo; n <= hi; n++) {
      if (lines.has(n)) {
        hit = true;
        break;
      }
    }
    if (hit) kept.push(f);
    else dropped.push({ finding: f, reason: `lines ${lo}-${hi} do not intersect any hunk` });
  }
  return { kept, dropped };
}

/** Inline suppression, on the finding's own line or the line directly above it. */
export function applySuppression(findings, root) {
  const cache = new Map();
  const readLines = (file) => {
    if (!cache.has(file)) {
      try {
        cache.set(file, readFileSync(join(root, file), 'utf8').split('\n'));
      } catch {
        cache.set(file, null);
      }
    }
    return cache.get(file);
  };

  for (const f of findings) {
    if (f.deterministic && f.rule_id?.startsWith('PREFLIGHT')) continue;
    const lines = readLines(f.file);
    if (!lines) continue;
    for (const n of [f.start_line, f.start_line - 1]) {
      const text = lines[n - 1];
      if (!text) continue;
      const m = IGNORE_RE.exec(text);
      if (!m) continue;
      const [, ruleId, reason] = m;
      if (f.rule_id && ruleId !== f.rule_id && ruleId !== '*') continue;
      f.suppressed = { rule_id: ruleId, reason, line: n };
      break;
    }
  }
  return findings;
}

function dedupe(findings) {
  const out = [];
  for (const f of findings) {
    const key = normalizeTitle(f.title);
    const hit = out.find(
      (g) =>
        g.file === f.file &&
        normalizeTitle(g.title) === key &&
        Math.min(g.end_line, f.end_line) >= Math.max(g.start_line, f.start_line),
    );
    if (!hit) {
      out.push({ ...f, also_reported_by: [] });
      continue;
    }
    hit.also_reported_by.push(f.source_skill);
    const better =
      SEV_RANK[f.severity] > SEV_RANK[hit.severity] ||
      (SEV_RANK[f.severity] === SEV_RANK[hit.severity] &&
        PRECEDENCE.indexOf(f.source_skill) !== -1 &&
        (PRECEDENCE.indexOf(hit.source_skill) === -1 ||
          PRECEDENCE.indexOf(f.source_skill) < PRECEDENCE.indexOf(hit.source_skill)));
    if (better) {
      const carried = hit.also_reported_by.concat(hit.source_skill).filter((s) => s !== f.source_skill);
      Object.assign(hit, f, { also_reported_by: carried });
    }
  }
  return out;
}

function markdown(report) {
  const { counts, findings, diff_hash, fail_on, verdict, overridden } = report;
  const L = [];
  L.push(`<!-- pr-self-review:${shortHash(diff_hash)} -->`);
  L.push('## Self-review');
  L.push('');
  L.push(
    `${SEV_EMOJI.CRITICAL} **${counts.CRITICAL}** · ${SEV_EMOJI.WARNING} **${counts.WARNING}** · ${SEV_EMOJI.SUGGESTION} **${counts.SUGGESTION}** — gate \`fail_on: ${fail_on}\` → **${verdict}**`,
  );
  L.push('');

  if (overridden) {
    L.push(`> ${SEV_EMOJI.CRITICAL} **Self-review overridden:** ${overridden.reason}`);
    L.push('>');
    L.push('> Blocking findings that were accepted anyway:');
    for (const f of overridden.findings) L.push(`> - \`${f.file}:${f.start_line}\` — ${f.title}`);
    L.push('');
  }

  const visible = findings.filter((f) => !f.suppressed);
  const crit = visible.filter((f) => f.blocking);
  if (crit.length && !overridden) {
    L.push('### Blocking');
    for (const f of crit) L.push(`- ${SEV_EMOJI[f.severity]} \`${f.file}:${f.start_line}\` — **${f.title}**`);
    L.push('');
  }

  const rest = visible.filter((f) => !f.blocking);
  if (rest.length) {
    L.push('<details>');
    L.push(`<summary>${rest.length} non-blocking finding(s)</summary>`);
    L.push('');
    for (const f of rest) {
      L.push(`- ${SEV_EMOJI[f.severity]} \`${f.file}:${f.start_line}\` — **${f.title}** _(${f.source_skill})_`);
      if (f.demoted) L.push(`  - demoted from CRITICAL: ${f.demoted}`);
    }
    L.push('');
    L.push('</details>');
    L.push('');
  }

  const suppressed = findings.filter((f) => f.suppressed);
  if (suppressed.length) {
    L.push('<details>');
    L.push(`<summary>${suppressed.length} suppressed finding(s)</summary>`);
    L.push('');
    for (const f of suppressed) {
      L.push(`- \`${f.file}:${f.start_line}\` — ${f.title} — _${f.suppressed.reason}_`);
    }
    L.push('');
    L.push('</details>');
    L.push('');
  }

  if (report.stopped_at === 'deterministic') {
    L.push('> Stopped before the skill review: deterministic checks already failed.');
    L.push('');
  }
  if (report.checks_skipped) {
    L.push('> Verification commands were skipped — this report cannot be a PASS.');
    L.push('');
  }
  return `${L.join('\n')}\n`;
}

export function build({ failOn, override = null, stoppedAt = null, checksSkipped = false } = {}) {
  const root = repoRoot();
  const dir = outDir();
  const plan = readJson(join(dir, 'plan.json'));
  if (!plan) throw new Error('plan.json not found — run collect.mjs first');

  const patch = readFileSync(join(dir, 'diff.patch'), 'utf8');
  const lineIndexRaw = parsePatch(patch);
  const lineIndex = new Map([...lineIndexRaw].map(([p, v]) => [p, v.newLines]));
  const filesInDiff = new Set((plan.files ?? []).map((f) => f.path));

  const deterministic = readJson(join(dir, 'deterministic-findings.json'), null) ?? [
    ...(plan.preflight_findings ?? []),
    ...(readJson(join(dir, 'invariant-findings.json'), []) ?? []),
  ];
  const agent = readJson(join(dir, 'agent-findings.json'), []) ?? [];
  const cached = readJson(join(dir, 'cached-findings.json'), []) ?? [];
  const verification = readJson(join(dir, 'verification.json'), null);

  const all = [...deterministic, ...cached, ...agent].map(normalize);

  const { kept, dropped } = ground(all, lineIndex, filesInDiff);

  // Auto-demotion: a CRITICAL nobody can turn into "input X → wrong result Y" is not a CRITICAL.
  for (const f of kept) {
    if (f.severity !== 'CRITICAL' || f.deterministic) continue;
    if (!f.failure_scenario || !String(f.failure_scenario).trim()) {
      f.severity = 'WARNING';
      f.demoted = 'no concrete failure_scenario was given';
    }
  }

  applySuppression(kept, root);
  const merged = dedupe(kept);

  // Adversarial verification verdicts, when they have been collected.
  const verdictsById = new Map();
  if (Array.isArray(verification)) for (const v of verification) verdictsById.set(v.id, v);
  for (const f of merged) {
    if (f.severity !== 'CRITICAL' || f.deterministic) continue;
    const v = verdictsById.get(f.id);
    if (!v) continue;
    f.verified = v.real === true;
    if (v.real === true) {
      if (v.failure_scenario) f.failure_scenario = v.failure_scenario;
    } else {
      f.severity = 'WARNING';
      f.demoted = `verification could not reproduce it: ${v.reason ?? 'no mechanism given'}`;
    }
  }

  const pendingVerification = merged.filter((f) => f.severity === 'CRITICAL' && !f.deterministic && f.verified !== true);

  const active = merged.filter((f) => !f.suppressed);
  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of active) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  const blocked = gateTriggered(active, failOn);
  // Blocking is defined by the configured threshold, not by CRITICAL — `fail_on: warning`
  // makes WARNINGs blockers too, and they must appear in the override record.
  const minRank = FAIL_ON_MIN_RANK[failOn];
  const blockers = active.filter((f) => (SEV_RANK[f.severity] ?? 0) >= minRank);
  for (const f of blockers) f.blocking = true;

  let verdict = blocked ? 'BLOCKED' : 'PASS';
  let overridden = null;
  if (blocked && override) {
    overridden = {
      reason: override,
      at: new Date().toISOString(),
      findings: blockers.map((f) => ({ file: f.file, start_line: f.start_line, title: f.title, rule_id: f.rule_id })),
    };
  }
  // Skipped verification commands can never be a PASS — the gate has not actually been run.
  if (!blocked && checksSkipped) verdict = 'BLOCKED';

  const report = {
    verdict,
    fail_on: failOn,
    generated_at: new Date().toISOString(),
    branch: plan.branch,
    base_ref: plan.base_ref,
    merge_base: plan.merge_base,
    head_sha: plan.head_sha,
    diff_hash: plan.diff_hash,
    checks_skipped: checksSkipped,
    stopped_at: stoppedAt,
    overridden,
    counts,
    blockers_count: countBlockers(active, failOn),
    pending_verification: pendingVerification.map((f) => f.id),
    dropped_by_grounding: dropped.map((d) => ({ id: d.finding.id, file: d.finding.file, reason: d.reason })),
    stats: plan.stats,
    findings: merged,
  };
  return report;
}

if (process.argv[1]?.endsWith('report.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const cfg = readConfig();
  const failOn = typeof args['fail-on'] === 'string' ? args['fail-on'] : cfg.fail_on;

  if (!(failOn in { never: 1, critical: 1, warning: 1, any: 1 })) {
    process.stderr.write(`Unknown --fail-on "${failOn}" (never|critical|warning|any)\n`);
    process.exit(2);
  }
  const override = typeof args.override === 'string' ? args.override.trim() : null;
  if (args.override === true || (override !== null && override.length === 0)) {
    process.stderr.write('--override requires a non-empty reason: --override "why this is acceptable"\n');
    process.exit(2);
  }

  const dir = ensureOut();
  const report = build({
    failOn,
    override,
    stoppedAt: typeof args['stopped-at'] === 'string' ? args['stopped-at'] : null,
    checksSkipped: !!args['checks-skipped'],
  });

  writeJson(join(dir, 'report.json'), report);
  writeText(join(dir, 'pr-body-section.md'), markdown(report));

  const c = report.counts;
  const head =
    report.verdict === 'BLOCKED'
      ? `PR self-review: BLOCKED — ${report.blockers_count} blocking${report.overridden ? ' (overridden)' : ''}`
      : `PR self-review: PASS — ${c.CRITICAL} ${SEV_EMOJI.CRITICAL} · ${c.WARNING} ${SEV_EMOJI.WARNING} · ${c.SUGGESTION} ${SEV_EMOJI.SUGGESTION}`;

  process.stdout.write(
    `${JSON.stringify(
      {
        summary: head,
        verdict: report.verdict,
        counts: c,
        pending_verification: report.pending_verification,
        dropped_by_grounding: report.dropped_by_grounding.length,
        artefacts: [join(dir, 'report.json'), join(dir, 'pr-body-section.md')],
      },
      null,
      2,
    )}\n`,
  );
  process.exit(report.verdict === 'BLOCKED' && !report.overridden ? 1 : 0);
}
