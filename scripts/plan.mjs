#!/usr/bin/env node
// Plan tools for the agent pipeline: one parser for the Implementation Plan format of
// `.claude/agents/implementation-planner.md`, three read-only commands that print to stdout.
//
//   node scripts/plan.mjs slice <plan> [<phase>]                  what ONE implementer phase reads
//   node scripts/plan.mjs lint  <plan> [--spec <path>] [--max-kb 24]
//   node scripts/plan.mjs files <plan> <diff-index>               files the steps name vs files changed
//
// Why `slice`: `Read` returns the whole file, so the `<!-- RATIONALE -->` marker never shrank what an
// implementer phase read — the 07 / 08 plans (40–50 KB) were re-sent on every turn of every phase.
// Why `lint`: the planner's "body ≤ ~20 KB" and "one §7 row per AC" were prompt rules nothing checked.
// Why `files`: plan-verifier's file rows are mechanical; a script answers them instead of an LLM.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MARKER = '<!-- RATIONALE -->';
export const TARGET_KB = 20;
export const MAX_KB = 24;

/** Sections an implementer and the reviewers never need: the caller's summary, the reviewer hand-off, notes. */
const DROP = [/^Summary for the caller\b/i, /^\d+\.\s*Handoff to reviewers\b/i, /^Worth recording in INSIGHTS\b/i, /^Appendix\b/i];

const FENCE = /^\s*(?:```|~~~)/;
const PHASE = /^### Phase\s+([A-Za-z0-9][\w.-]*)/;
/** `S3`, `S2b`; and amendment steps `F1.2` / `V1.1` that /run-plan appends for fix rounds. */
const STEP = /^#{3,4} (S\d+[a-z]?|[A-Z]\d+\.\d+)(?=[\s:—-]|$)/;

export function normalise(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

/** The plan above the RATIONALE marker — the only part agents act on. */
export function body(text) {
  const t = normalise(text);
  const i = t.indexOf(MARKER);
  return `${(i >= 0 ? t.slice(0, i) : t).replace(/\s+$/, '')}\n`;
}

export function phaseId(line) {
  const m = PHASE.exec(line);
  return m ? m[1].replace(/[.-]+$/, '') : null;
}

/** Level-2 sections; the first one (title null) is the preamble: `PLAN: READY` and the `# title`. */
export function sections(md) {
  const out = [{ title: null, lines: [] }];
  let fence = false;
  for (const line of md.split('\n')) {
    if (FENCE.test(line)) fence = !fence;
    if (!fence && line.startsWith('## ')) out.push({ title: line.slice(3).trim(), lines: [line] });
    else out.at(-1).lines.push(line);
  }
  return out;
}

/**
 * `###` blocks of a section, each tagged with the phase it belongs to. A `### Phase <id>` heading opens
 * a phase; the steps after it belong to it until the next phase heading or the end of the section.
 * Content before a section's first phase heading has phase null and is shared by every phase.
 */
export function blocks(section) {
  const out = [{ heading: null, phase: null, lines: [] }];
  let phase = null;
  let fence = false;
  for (const line of section.lines) {
    if (FENCE.test(line)) fence = !fence;
    if (!fence && line.startsWith('### ')) {
      phase = phaseId(line) ?? phase;
      out.push({ heading: line, phase, lines: [line] });
    } else {
      out.at(-1).lines.push(line);
    }
  }
  return out;
}

export function phases(md) {
  const ids = [];
  for (const s of sections(md)) for (const b of blocks(s)) if (b.phase && !ids.includes(b.phase)) ids.push(b.phase);
  return ids;
}

/** `### S<n>` steps, and `#### S<n>` steps nested under a `### Phase` heading (older plans). */
export function steps(md) {
  const out = [];
  for (const s of sections(md)) {
    for (const b of blocks(s)) {
      const chunks = [[]];
      for (const line of b.lines) {
        if (line.startsWith('#### ') && chunks.at(-1).length) chunks.push([]);
        chunks.at(-1).push(line);
      }
      for (const chunk of chunks) {
        const m = STEP.exec(chunk[0] ?? '');
        if (m) out.push({ id: m[1], phase: b.phase, section: s.title, text: chunk.join('\n') });
      }
    }
  }
  return out;
}

/** Phases whose own heading or intro (before the first step) carries a "Done when". */
function phasesWithDoneWhen(md) {
  const ids = new Set();
  for (const s of sections(md)) {
    for (const b of blocks(s)) {
      if (!b.heading || !phaseId(b.heading)) continue;
      const intro = [];
      for (const line of b.lines) {
        if (intro.length && line.startsWith('#### ')) break;
        intro.push(line);
      }
      if (/done when/i.test(intro.join('\n'))) ids.add(b.phase);
    }
  }
  return ids;
}

/**
 * The plan one phase needs: every section except the dropped ones, with the steps of other phases cut.
 * No phase → every phase (the plan-verifier view). Throws when the phase does not exist.
 */
export function slice(text, phase = null, { source = 'plan' } = {}) {
  const md = body(text);
  const all = phases(md);
  const want = phase ? all.find((p) => p.toLowerCase() === phase.toLowerCase()) : null;
  if (phase && !want) throw new Error(`phase ${phase} is not in ${source}; phases: ${all.join(', ') || 'none'}`);

  const kept = [];
  for (const s of sections(md)) {
    if (s.title && DROP.some((re) => re.test(s.title))) continue;
    for (const b of blocks(s)) if (!want || b.phase === null || b.phase === want) kept.push(...b.lines);
  }
  const lines = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '').split('\n');
  const total = Buffer.byteLength(normalise(text), 'utf8');
  const note =
    `<!-- plan.mjs slice of ${source} · phase ${want ?? 'all'} · ${Buffer.byteLength(lines.join('\n'), 'utf8')} of ${total} bytes — ` +
    'other phases, the summary, the reviewer hand-off and the appendix are cut -->';
  return [lines[0], note, ...lines.slice(1)].join('\n') + '\n';
}

function sectionText(md, re) {
  const s = sections(md).find((x) => x.title && re.test(x.title));
  return s ? s.lines.join('\n') : null;
}

/** The spec named in §0 Scope (`Source:`), if any. */
export function specPathFrom(md) {
  const scope = sectionText(md, /^0\.\s*Scope\b/i) ?? '';
  const m = scope.match(/((?:[\w-]+\/)*specs\/[\w./-]+\.md)/);
  return m ? m[1] : null;
}

/** AC-n / NFR-n defined in a spec (bold), minus the dropped ones (`~~AC-4~~`). */
export function specIds(specText) {
  const t = normalise(specText);
  const dropped = new Set([...t.matchAll(/~~((?:AC|NFR)-\d+)~~/g)].map((m) => m[1]));
  const ids = [...t.matchAll(/\*\*((?:AC|NFR)-\d+)\*\*/g)].map((m) => m[1]);
  return [...new Set(ids)].filter((id) => !dropped.has(id));
}

const WHOLE_LANE = /vitest run (?:--exclude|\.it\.test)|\bpnpm (?:run )?test\b|\bnpm test\b(?! -- )/;

export function lint(text, { specText = null, specPath = null, maxKb = MAX_KB, targetKb = TARGET_KB } = {}) {
  const errors = [];
  const warnings = [];
  const md = body(text);
  const kb = Buffer.byteLength(md, 'utf8') / 1024;

  if (md.split('\n').find((l) => l.trim()) !== 'PLAN: READY') errors.push(['L-READY', 'the first line is not `PLAN: READY`']);
  if (kb > maxKb) {
    errors.push(['L-SIZE', `body is ${kb.toFixed(1)} KB, limit ${maxKb} KB (target ${targetKb}) — §1 as pointers, rationale below ${MARKER}`]);
  } else if (kb > targetKb) {
    warnings.push(['L-SIZE', `body is ${kb.toFixed(1)} KB, target ${targetKb} KB`]);
  }

  const ph = phases(md);
  const st = steps(md);
  if (!ph.length) errors.push(['L-PHASE', 'no `### Phase <id>` heading — group the steps into phases, even a single one']);
  const phaseDone = phasesWithDoneWhen(md);
  for (const s of st) {
    if (s.phase === null) {
      warnings.push(['L-ORPHAN', `${s.id} belongs to no phase — no implementer run executes it`]);
      continue;
    }
    if (!/done when/i.test(s.text)) {
      if (!phaseDone.has(s.phase)) errors.push(['L-DONE', `${s.id} has no "Done when", and neither has phase ${s.phase}`]);
      continue;
    }
    const dw = s.text.split('\n').find((l) => /done when/i.test(l)) ?? '';
    if (WHOLE_LANE.test(dw)) {
      warnings.push(['L-LANE', `${s.id} runs a whole test lane in its "Done when" — a step runs its own test files; lanes belong to the phase`]);
    }
  }
  const short = [...new Set(plannedFiles(md).filter((f) => !isRooted(f.path)).map((f) => `${f.step} \`${f.path}\``))];
  if (short.length) {
    warnings.push(['L-PATH', `write "Files:" paths from the repo root — plan-verifier matches them against the diff: ${short.join(', ')}`]);
  }
  if (!/Execution mode:/i.test(sectionText(md, /^0\.\s*Scope\b/i) ?? '')) {
    warnings.push(['L-MODE', '§0 has no "Execution mode:" line']);
  }

  let trace = null;
  if (specText != null) {
    const ids = specIds(specText);
    const tests = sectionText(md, /^7\.\s*Test plan\b/i);
    if (!ids.length) {
      warnings.push(['L-TRACE', `${specPath ?? 'the spec'} defines no **AC-n** / **NFR-n** — coverage not checked`]);
    } else if (tests == null) {
      errors.push(['L-TRACE', 'no `## 7. Test plan` section, so no AC / NFR is mapped to a test']);
    } else {
      const missing = ids.filter((id) => !new RegExp(`\\b${id}(?!\\d)`).test(tests));
      trace = { covered: ids.length - missing.length, total: ids.length };
      if (missing.length) errors.push(['L-TRACE', `§7 has no row for ${missing.join(', ')}`]);
    }
  } else if (specPath) {
    warnings.push(['L-TRACE', `§0 names ${specPath}, but the file was not found — coverage not checked`]);
  }

  return { errors, warnings, stats: { kb, phases: ph, steps: st.length, trace } };
}

export function renderLint({ errors, warnings, stats }, specPath) {
  const head = [
    `plan-lint: ${errors.length ? 'FAIL' : 'OK'}`,
    `${errors.length} error(s), ${warnings.length} warning(s)`,
    `body ${stats.kb.toFixed(1)} KB`,
    `${stats.phases.length} phase(s) [${stats.phases.join(', ')}]`,
    `${stats.steps} step(s)`,
  ];
  if (stats.trace) head.push(`spec ${specPath}: ${stats.trace.covered}/${stats.trace.total} AC/NFR in §7`);
  return [head.join(' · '), ...errors.map(([c, m]) => `ERROR ${c} ${m}`), ...warnings.map(([c, m]) => `WARN  ${c} ${m}`)].join('\n');
}

function expandBraces(p) {
  const m = p.match(/\{([^{}]+)\}/);
  if (!m) return [p];
  return m[1].split(',').flatMap((alt) => expandBraces(p.replace(m[0], alt.trim())));
}

const ROOTED = /^(?:server|client|reviewer-core|mcp|e2e|scripts|docs|specs|\.github|\.claude)\/|^[\w.-]+\.(?:md|json|ya?ml)$/;

/** A path as the plan should write it: from the repo root, not `.../x.tsx` or `hooks/x.ts`. */
export function isRooted(path) {
  return ROOTED.test(path);
}

/** Paths named on the `Files:` bullet of every step (continuation lines included). */
export function plannedFiles(md) {
  const out = [];
  for (const s of steps(body(md))) {
    const lines = s.text.split('\n');
    const start = lines.findIndex((l) => /^\s*-\s*Files:/i.test(l));
    if (start < 0) continue;
    const chunk = [lines[start]];
    for (const l of lines.slice(start + 1)) {
      if (!l.trim() || /^\s*-\s/.test(l) || /^#/.test(l)) break;
      chunk.push(l);
    }
    for (const [, tok] of chunk.join(' ').matchAll(/`([^`]+)`/g)) {
      const clean = tok.trim().replace(/:\d+(?:-\d+)?$/, '');
      // code on the bullet (`api.get<T>(`, `key = [...]`) is not a path
      if (/[\s<>=$"'`]|\($/.test(clean) || !/[/.]/.test(clean)) continue;
      for (const path of expandBraces(clean)) out.push({ step: s.id, path });
    }
  }
  // `## Accepted extras` — files a review round accepted although no step names them (`- \`path\` — why`)
  const extras = sections(body(md)).find((s) => s.title && /^Accepted extras\b/i.test(s.title));
  for (const line of extras?.lines ?? []) {
    const m = line.match(/^\s*-\s*`([^`]+)`/);
    if (m) out.push({ step: 'accepted', path: m[1] });
  }
  return out;
}

/** File paths listed in a `scripts/diff-index.mjs` output (package sections only). */
export function diffIndexFiles(text) {
  const t = normalise(text);
  const cut = t.indexOf('\n## Architecture scope');
  const files = [...(cut >= 0 ? t.slice(0, cut) : t).matchAll(/^- `([^`]+)` — /gm)].map((m) => m[1]);
  return [...new Set(files)];
}

function matcher(planned) {
  if (!isRooted(planned)) {
    const tail = `/${planned.replace(/^(?:\.\.\.|…)\//, '')}`;
    return (p) => p.endsWith(tail);
  }
  if (planned.endsWith('/')) return (p) => p.startsWith(planned);
  if (planned.includes('*')) {
    const re = new RegExp(
      `^${planned.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`,
    );
    return (p) => re.test(p);
  }
  return (p) => p === planned;
}

export function filesVsDiff(planText, diffIndexText) {
  const planned = plannedFiles(planText);
  const changed = diffIndexFiles(diffIndexText);
  const rows = planned.map(({ step, path }) => ({ step, path, touched: changed.some(matcher(path)), short: !isRooted(path) }));
  const extra = changed.filter((c) => !planned.some(({ path }) => matcher(path)(c)));
  return { rows, extra };
}

export function renderFiles({ rows, extra }) {
  return [
    `## Files the steps name (${rows.length}) — ${rows.filter((r) => !r.touched).length} not touched`,
    '| step | file | status |',
    '|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.step} | \`${r.path}\` | ${r.touched ? 'touched' : 'NOT TOUCHED'}${r.short ? ' (short path, matched by suffix — check by hand)' : ''} |`,
    ),
    '',
    `## Changed, named by no step (${extra.length}) — EXTRA candidates: tests the plan implies, docs, pre-existing work`,
    ...extra.map((p) => `- \`${p}\``),
  ].join('\n');
}

function main(argv) {
  const [cmd, planPath, arg] = argv;
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i > 0 ? argv[i + 1] : undefined;
  };
  if (!cmd || !planPath || !['slice', 'lint', 'files'].includes(cmd)) {
    process.stderr.write('usage: node scripts/plan.mjs slice|lint|files <plan> [<phase> | --spec <path> | <diff-index>]\n');
    return 2;
  }
  const text = readFileSync(planPath, 'utf8');
  if (cmd === 'slice') {
    process.stdout.write(slice(text, arg && !arg.startsWith('--') ? arg : null, { source: planPath }));
    return 0;
  }
  if (cmd === 'lint') {
    const specPath = flag('--spec') ?? specPathFrom(body(text));
    const specText = specPath && existsSync(specPath) ? readFileSync(specPath, 'utf8') : null;
    const maxKb = Number(flag('--max-kb') ?? MAX_KB);
    const res = lint(text, { specText, specPath, maxKb });
    process.stdout.write(`${renderLint(res, specPath)}\n`);
    return res.errors.length ? 1 : 0;
  }
  if (!arg) {
    process.stderr.write('usage: node scripts/plan.mjs files <plan> <diff-index>\n');
    return 2;
  }
  process.stdout.write(`${renderFiles(filesVsDiff(text, readFileSync(arg, 'utf8')))}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`plan.mjs: ${err.message}\n`);
    process.exitCode = 1;
  }
}
