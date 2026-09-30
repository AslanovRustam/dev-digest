// Phase 2 — deterministic repo invariants. No LLM, no judgement calls.
//
// Every rule here is a flat auto-fail taken from AGENTS.md or the onion-architecture skill.
// Documented for humans in references/invariants.md — keep the two in sync.

import { basename, join } from 'node:path';

import { outDir, parseArgs, parsePatch, readJson, repoRoot, writeJson } from './lib.mjs';

// ---------------------------------------------------------------- secrets
//
// There is no scanner to reuse: server/src/adapters/secrets/local.ts is a key STORE
// (LocalSecretsProvider), not a detector.

export const SECRET_PATTERNS = [
  { id: 'openai-key', label: 'OpenAI-style API key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'github-token', label: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { id: 'github-pat', label: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { id: 'aws-access-key', label: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'private-key', label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'anthropic-key', label: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
];

const ENV_FILE = /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/;
const ENV_FILE_SAFE = /(^|\/)\.env\.(example|sample|template|dist)$/;

/** Never echo a live credential into a report that may be pasted into a PR. */
export function maskSecret(match) {
  const s = String(match);
  if (s.length <= 10) return `${s.slice(0, 3)}…`;
  return `${s.slice(0, 6)}…${s.slice(-2)} (${s.length} chars)`;
}

// ---------------------------------------------------------------- CI reach

const CI_TRIGGER_GLOBS = [/^client\//, /^server\//, /^reviewer-core\//, /^e2e\//, /^\.github\/workflows\//];

// ---------------------------------------------------------------- helpers

function finding({ ruleId, severity, title, file, line = 0, rationale, suggestion = null, kind = 'hook', category = 'bug' }) {
  return {
    id: `${ruleId}:${file}:${line}`,
    rule_id: ruleId,
    source_skill: 'pr-self-review/invariants',
    severity,
    category,
    kind,
    title,
    file,
    start_line: line,
    end_line: line,
    rationale,
    suggestion,
    confidence: 1,
    deterministic: true,
  };
}

/** Net line delta per file, straight off the raw patch (parsePatch only tracks additions). */
export function netDelta(patch, targetPath) {
  let inFile = false;
  let added = 0;
  let removed = 0;
  for (const raw of String(patch).split('\n')) {
    if (raw.startsWith('+++ ')) {
      inFile = raw.slice(4).trim().replace(/^b\//, '') === targetPath;
      continue;
    }
    if (!inFile) continue;
    if (raw.startsWith('diff --git ')) {
      inFile = false;
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) added++;
    else if (raw.startsWith('-') && !raw.startsWith('---')) removed++;
  }
  return { added, removed, net: added - removed };
}

function vendoredSkills(root) {
  const lock = readJson(join(root, 'skills-lock.json'), null);
  return new Set(Object.keys(lock?.skills ?? {}));
}

// ---------------------------------------------------------------- rules

export function runInvariants(plan, patch, { root = repoRoot() } = {}) {
  const out = [];
  const files = plan.files ?? [];
  const paths = files.map((f) => f.path);
  const parsed = parsePatch(patch);

  // INV-MIGRATION — generated migrations may be ADDED (pnpm db:generate); editing or deleting
  // an existing one is the violation.
  for (const f of files) {
    if (!/^server\/src\/db\/migrations\//.test(f.path)) continue;
    if (f.status === 'A') continue;
    out.push(
      finding({
        ruleId: 'INV-MIGRATION',
        severity: 'CRITICAL',
        title: 'A committed migration was edited by hand',
        file: f.path,
        rationale:
          'AGENTS.md: `server/src/db/migrations/**` is generated — never hand-edited. An edited migration silently diverges from what other environments already applied.',
        suggestion: 'Revert this file and express the change as a NEW migration: edit `src/db/schema/*.ts`, then `pnpm db:generate`.',
      }),
    );
  }

  // INV-ARCH-DEBT — the dependency-cruiser ledger may only shrink.
  const ledger = 'server/.dependency-cruiser-known-violations.json';
  const ledgerFile = files.find((f) => f.path === ledger);
  if (ledgerFile) {
    const d = netDelta(patch, ledger);
    const firstBaseline = ledgerFile.status === 'A';
    if (d.net > 0) {
      out.push(
        finding({
          ruleId: 'INV-ARCH-DEBT',
          // Creating the ledger for the first time RECORDS existing debt, it does not add any.
          // Only growth of an existing ledger is the rejectable act.
          severity: firstBaseline ? 'WARNING' : 'CRITICAL',
          title: firstBaseline
            ? `Initial architecture debt baseline (${d.net} lines) is being committed`
            : `Architecture debt ledger grew by ${d.net} line(s)`,
          file: ledger,
          rationale: firstBaseline
            ? 'This is the first baseline, so it records debt that already exists rather than adding new debt. From here on the ledger may only shrink.'
            : 'onion-architecture: the known-violations ledger only shrinks. A PR that adds a baseline entry is rejected — it records a NEW layering violation as permitted.',
          suggestion: firstBaseline
            ? 'Confirm the baseline was generated (`pnpm arch:baseline`) and not hand-written, then land it as its own commit.'
            : 'Fix the layering instead: move the SQL into the module repository, or the SDK call into `adapters/`. Then `pnpm arch` passes without a new entry.',
        }),
      );
    }
  }

  // INV-SHARED-DRIFT — the two @devdigest/shared copies must move together.
  const rel = (p, prefix) => p.slice(prefix.length);
  const serverShared = new Set(
    paths.filter((p) => p.startsWith('server/src/vendor/shared/')).map((p) => rel(p, 'server/src/vendor/shared/')),
  );
  const clientShared = new Set(
    paths.filter((p) => p.startsWith('client/src/vendor/shared/')).map((p) => rel(p, 'client/src/vendor/shared/')),
  );
  for (const [side, mine, theirs, myPrefix, theirPrefix] of [
    ['server', serverShared, clientShared, 'server/src/vendor/shared/', 'client/src/vendor/shared/'],
    ['client', clientShared, serverShared, 'client/src/vendor/shared/', 'server/src/vendor/shared/'],
  ]) {
    for (const r of mine) {
      if (theirs.has(r)) continue;
      out.push(
        finding({
          ruleId: 'INV-SHARED-DRIFT',
          severity: 'CRITICAL',
          title: `Contract changed on the ${side} side only: \`${r}\``,
          file: `${myPrefix}${r}`,
          rationale:
            'AGENTS.md: `@devdigest/shared` exists as TWO separate copies. A contract edited on one side only makes the API and the UI disagree at runtime, and nothing type-checks the gap.',
          suggestion: `Apply the same change to \`${theirPrefix}${r}\`, or suppress with a reason if this field is deliberately server-only.`,
        }),
      );
    }
  }

  // INV-VENDORED-SKILL — vendored skills are managed by skills-lock.json, not edited here.
  const vendored = vendoredSkills(root);
  for (const p of paths) {
    const m = /^\.claude\/skills\/([^/]+)\//.exec(p);
    if (!m || !vendored.has(m[1])) continue;
    out.push(
      finding({
        ruleId: 'INV-VENDORED-SKILL',
        severity: 'CRITICAL',
        title: `Vendored skill \`${m[1]}\` was edited in place`,
        file: p,
        rationale:
          'AGENTS.md: skills listed in `skills-lock.json` are vendored — the next sync overwrites local edits, so the change is silently lost.',
        suggestion: 'Upstream the change, or fork the skill under a new project-owned name with no lock entry.',
      }),
    );
  }

  // INV-RUNTIME-DATA — runtime data and the vendored design system are not source.
  for (const p of paths) {
    if (!/^server\/clones\//.test(p) && !/^client\/src\/vendor\/ui\//.test(p)) continue;
    out.push(
      finding({
        ruleId: 'INV-RUNTIME-DATA',
        severity: 'CRITICAL',
        title: /^server\/clones\//.test(p) ? 'Runtime clone data is in the diff' : 'The vendored design system was edited',
        file: p,
        rationale:
          'AGENTS.md "Do not touch": `server/clones/**` is runtime data and `client/src/vendor/ui/**` is the vendored `@devdigest/ui` copy.',
        suggestion: /^server\/clones\//.test(p)
          ? 'Remove it from the change set and add the path to `.gitignore` if it keeps showing up.'
          : 'Change the consumer in `client/src/**` instead, or upstream the change to the design system.',
      }),
    );
  }

  // INV-SECRET — added lines only. Zero cost, highest consequence.
  for (const [path, info] of parsed) {
    const f = files.find((x) => x.path === path);
    if (f && (f.noise || f.binary)) continue;
    for (const { line, text } of info.added) {
      for (const pat of SECRET_PATTERNS) {
        const m = pat.re.exec(text);
        if (!m) continue;
        out.push(
          finding({
            ruleId: 'INV-SECRET',
            severity: 'CRITICAL',
            category: 'security',
            kind: 'secret_leak',
            title: `Possible ${pat.label} in an added line`,
            file: path,
            line,
            rationale: `An added line matches the ${pat.label} pattern: \`${maskSecret(m[0])}\`. Once pushed it is public history — rotating the key is the only real fix.`,
            suggestion: 'Move it to the secrets store (`LocalSecretsProvider` / env), remove the line, and rotate the credential.',
          }),
        );
        break; // one finding per line is enough
      }
    }
  }
  for (const f of files) {
    if (f.status === 'D') continue;
    if (!ENV_FILE.test(f.path) || ENV_FILE_SAFE.test(f.path)) continue;
    out.push(
      finding({
        ruleId: 'INV-SECRET',
        severity: 'CRITICAL',
        category: 'security',
        kind: 'secret_leak',
        title: `\`${basename(f.path)}\` is about to be committed`,
        file: f.path,
        rationale: 'Root `.gitignore` lists `.env` for a reason — these files hold live credentials.',
        suggestion: 'Remove it from the change set (`git rm --cached`) and keep only a `.env.example`.',
      }),
    );
  }

  // INV-CI-BLIND — advisory: nothing in this change set triggers a CI workflow.
  const reached = paths.some((p) => CI_TRIGGER_GLOBS.some((re) => re.test(p)));
  if (paths.length > 0 && !reached) {
    out.push(
      finding({
        ruleId: 'INV-CI-BLIND',
        severity: 'WARNING',
        title: 'No CI workflow is triggered by this change set',
        file: '.',
        rationale:
          'All five workflows are path-filtered to `client/**`, `server/**`, `reviewer-core/**`, `e2e/**` and `.github/workflows/**`. Paths like `.claude/**`, `docs/**`, `specs/**` and root `*.md` run no checks at all.',
        suggestion: 'This self-review is the only gate for this PR — read the diff once more before merging.',
      }),
    );
  }

  return out;
}

if (process.argv[1]?.endsWith('invariants.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const dir = outDir();
  const plan = readJson(join(dir, 'plan.json'));
  if (!plan) {
    process.stderr.write('plan.json not found — run collect.mjs first\n');
    process.exit(2);
  }
  const { readFileSync } = await import('node:fs');
  const patch = readFileSync(join(dir, 'diff.patch'), 'utf8');
  const findings = runInvariants(plan, patch);
  writeJson(join(dir, 'invariant-findings.json'), findings);
  if (!args.quiet) {
    process.stdout.write(
      `${JSON.stringify(
        { count: findings.length, by_rule: tally(findings), findings: findings.map((f) => `${f.severity} ${f.rule_id} ${f.file}:${f.start_line} — ${f.title}`) },
        null,
        2,
      )}\n`,
    );
  }
}

function tally(findings) {
  const t = {};
  for (const f of findings) t[f.rule_id] = (t[f.rule_id] ?? 0) + 1;
  return t;
}
