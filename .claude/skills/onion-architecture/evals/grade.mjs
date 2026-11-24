#!/usr/bin/env node
// Programmatic grader for evals that have an entry in graders.json.
//
//   node .claude/skills/onion-architecture/evals/grade.mjs <iterationDir>
//
// For every <iterationDir>/eval-<id>-*/<config>/run-<n>/outputs/review.md it writes grading.json
// next to the outputs folder. The review is split at the "Checked and OK" heading: a `find` check
// passes when its regexes co-occur within WINDOW characters in the part BEFORE that heading (a real
// finding); an `absent` check passes when they do NOT co-occur there (a legal look-alike was not
// reported). Keyword matching is a heuristic: read a few reviews by hand before trusting a number.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const evals = JSON.parse(readFileSync(join(here, 'evals.json'), 'utf8')).evals;
const graders = JSON.parse(readFileSync(join(here, 'graders.json'), 'utf8'));
const WINDOW = 700;

function split(review) {
  const m = review.match(/^#{1,4}\s*(checked and ok|looks suspicious)/im) ?? review.match(/^\*\*checked and ok/im);
  return m ? { findings: review.slice(0, m.index), ok: review.slice(m.index) } : { findings: review, ok: '' };
}

function cooccur(text, patterns) {
  const [head, ...rest] = patterns.map((p) => new RegExp(p, 'gi'));
  for (const m of text.matchAll(head)) {
    const lo = Math.max(0, m.index - WINDOW);
    const hi = Math.min(text.length, m.index + WINDOW);
    const win = text.slice(lo, hi);
    if (rest.every((r) => new RegExp(r.source, 'i').test(win))) return win.replace(/\s+/g, ' ').slice(0, 160);
  }
  return null;
}

export function gradeReview(evalId, review) {
  const spec = graders[String(evalId)];
  const assertions = evals.find((e) => e.id === Number(evalId)).assertions;
  const { findings } = split(review);
  const expectations = spec.map((c, i) => {
    if (c.find) {
      const hit = cooccur(findings, c.find);
      return { text: assertions[i], passed: !!hit, evidence: hit ? `matched: ...${hit}...` : 'no finding matches' };
    }
    // absent: a legal look-alike counts as wrongly reported only when ONE line of the findings part
    // names it together with a negative verdict and no 'allowed/legal' wording.
    const unless = c.unless ? new RegExp(c.unless, 'i') : null;
    const rx = c.absent.map((x) => new RegExp(x, 'i'));
    const line = findings.split(/\r?\n/).find((l) => rx.every((r) => r.test(l)) && !(unless && unless.test(l)));
    return {
      text: assertions[i],
      passed: !line,
      evidence: line ? `reported as a finding: ${line.trim().slice(0, 160)}` : 'not reported as a violation',
    };
  });
  const passed = expectations.filter((e) => e.passed).length;
  return {
    expectations,
    summary: {
      passed,
      failed: expectations.length - passed,
      total: expectations.length,
      pass_rate: Math.round((passed / expectations.length) * 100) / 100,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: grade.mjs <iterationDir>');
    process.exit(2);
  }
  let n = 0;
  for (const ev of readdirSync(dir).filter((d) => /^eval-\d+-/.test(d))) {
    const id = ev.split('-')[1];
    if (!graders[id]) continue;
    for (const cfg of readdirSync(join(dir, ev))) {
      const cfgDir = join(dir, ev, cfg);
      if (!existsSync(cfgDir) || !readdirSync(cfgDir).some((r) => r.startsWith('run-'))) continue;
      for (const run of readdirSync(cfgDir).filter((r) => r.startsWith('run-'))) {
        const file = join(cfgDir, run, 'outputs', 'review.md');
        if (!existsSync(file)) continue;
        writeFileSync(
          join(cfgDir, run, 'grading.json'),
          JSON.stringify(gradeReview(id, readFileSync(file, 'utf8')), null, 2) + '\n',
        );
        n += 1;
      }
    }
  }
  console.log(`graded ${n} runs`);
}
