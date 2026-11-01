// node --test retro.test.mjs — synthetic transcripts only; never reads a real session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  analyze,
  bashReadPaths,
  declaredModels,
  encodeProjectDir,
  findProjectDir,
  foldSuffixPaths,
  loadRun,
  normalizeCommand,
  normalizePath,
  compareRuns,
  duration,
  previousSession,
  summarize,
  triggerKind,
  parseDeclaredModels,
  parseTranscript,
  parseWorkflowDrift,
  redact,
  renderFacts,
  sharedParagraphs,
  trendLine,
  upsertTrend,
} from './retro.mjs';

const PROJECT = 'D:\\work\\My Repo';
const T = (min) => new Date(Date.UTC(2026, 10, 1, 10, min)).toISOString();

const assistant = (id, min, content, usage = {}, model = 'claude-opus-x') => ({
  type: 'assistant',
  timestamp: T(min),
  message: {
    id,
    model,
    content,
    usage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, ...usage },
  },
});
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });
const toolError = (min, toolUseId, text) => ({
  type: 'user',
  timestamp: T(min),
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: true, content: text }] },
});
const BOILER = 'Shared rules: '.padEnd(200, 'x');

function mainRecords() {
  return [
    { type: 'user', timestamp: T(0), message: { content: 'Run the pipeline' } },
    // A streamed reply is written as two records with the same message id — counted once.
    assistant('m1', 1, [toolUse('a1', 'Agent', { subagent_type: 'planner', description: 'Plan it', prompt: 'x', run_in_background: true })]),
    assistant('m1', 1, [toolUse('a1', 'Agent', { subagent_type: 'planner', description: 'Plan it', prompt: 'x', run_in_background: true })]),
    {
      type: 'queue-operation',
      timestamp: T(20),
      content:
        '<task-notification><task-id>p1</task-id><status>completed</status><summary>Agent "Plan it" stopped at its 60-turn limit (partial)</summary></task-notification>',
    },
    assistant('m2', 21, [toolUse('s1', 'SendMessage', { to: 'p1', message: 'finish' })]),
    assistant('m3', 30, [toolUse('a2', 'Agent', { subagent_type: 'implementer', description: 'P1', prompt: 'x' })]),
    assistant('m4', 30, [toolUse('a3', 'Agent', { subagent_type: 'implementer', description: 'P2', prompt: 'x' })]),
    assistant('m5', 50, [toolUse('b1', 'Bash', { command: 'cd "D:/work/My Repo" && node scripts/verify.mjs 2>&1 | tail -5' })]),
    assistant('m6', 55, [toolUse('b2', 'Bash', { command: 'node scripts/verify.mjs' })]),
    assistant('m7', 56, [toolUse('q1', 'AskUserQuestion', { questions: [{ question: 'Which mode?' }] })]),
    assistant('m8', 57, [toolUse('r1', 'Read', { file_path: 'D:\\work\\My Repo\\docs\\plan.md' })]),
  ];
}
function sub(records, meta) {
  return { agentId: meta.id, meta: { agentType: meta.type, description: meta.description, toolUseId: meta.toolUseId, requestShape: meta.shape }, facts: parseTranscript(records) };
}

test('encodeProjectDir and findProjectDir match Claude Code folder names case-insensitively', () => {
  assert.equal(encodeProjectDir('d:\\projects\\AI Agentic Engineering\\dev-digest'), 'd--projects-AI-Agentic-Engineering-dev-digest');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retro-'));
  fs.mkdirSync(path.join(root, 'd--work-My-Repo'));
  assert.equal(findProjectDir(root, [PROJECT]), path.join(root, 'd--work-My-Repo'));
  assert.equal(findProjectDir(root, ['C:\\other']), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('redact masks credentials and leaves ordinary numbers alone', () => {
  const out = redact('token ghp_' + 'a'.repeat(36) + ' key sk-ant-' + 'b'.repeat(30) + ' password: hunter2hunter2 tokens_in: 9000');
  assert.ok(!out.includes('ghp_a') && !out.includes('sk-ant-b') && !out.includes('hunter2hunter2'));
  assert.ok(out.includes('tokens_in: 9000'));
});

test('bashReadPaths, normalizeCommand, normalizePath and foldSuffixPaths', () => {
  assert.deepEqual(bashReadPaths('cd x && sed -n 1,20p src/a.ts | grep -n foo; cat "docs/b c.md"'), ['src/a.ts', 'docs/b c.md']);
  assert.deepEqual(bashReadPaths('pnpm test'), []);
  assert.equal(normalizeCommand('cd "D:/x y" && pnpm typecheck 2>&1 | tail -5'), 'pnpm typecheck');
  assert.equal(normalizePath('D:\\work\\My Repo\\Src\\A.ts', PROJECT), 'src/a.ts');
  assert.equal(normalizePath('/d/work/My Repo/src/a.ts', PROJECT), 'src/a.ts');
  assert.equal(normalizePath('/tmp/x.tmp', PROJECT), null);
  const fold = foldSuffixPaths(['server/src/a.ts', 'src/a.ts', 'index.ts', 'a/index.ts', 'b/index.ts']);
  assert.equal(fold('src/a.ts'), 'server/src/a.ts');
  assert.equal(fold('index.ts'), 'index.ts'); // ambiguous: two longer candidates
});

test('sharedParagraphs finds boilerplate pasted into several briefs', () => {
  const found = sharedParagraphs([
    { name: 'a#1', text: `Task one\n\n${BOILER}` },
    { name: 'b#2', text: `Task two\n\n${BOILER}` },
    { name: 'c#3', text: 'Task three' },
  ]);
  assert.deepEqual(found.map((f) => f.agents), [['a#1', 'b#2']]);
});

test('analyze: dedupes streamed usage, orders launches, links turn limits, resumes, parallel runs and waste', () => {
  const planner = sub(
    [
      { type: 'user', timestamp: T(2), message: { content: `Plan the feature.\n\n${BOILER}` } },
      assistant('p-1', 3, [toolUse('pr1', 'Read', { file_path: 'docs/plan.md' })], { cache_read_input_tokens: 1000 }),
      assistant('p-2', 4, [toolUse('pb1', 'Bash', { command: 'pnpm typecheck' })]),
      toolError(4, 'pb1', 'Exit code 2\nerror TS2307'),
      assistant('p-3', 19, [toolUse('h1', 'SubagentHandback', { message: 'PLAN: READY with ghp_' + 'z'.repeat(36) })]),
    ],
    { id: 'p1', type: 'planner', description: 'Plan it', toolUseId: 'a1', shape: 'background' },
  );
  const impl1 = sub(
    [
      { type: 'user', timestamp: T(31), message: { content: `Phase P1.\n\n${BOILER}` } },
      assistant('i1-1', 32, [toolUse('ib1', 'Bash', { command: 'cd server && pnpm typecheck | tail -3' }), toolUse('ib2', 'Bash', { command: 'cat src/x.ts' })], {}, 'claude-sonnet-x'),
      assistant('i1-2', 40, [], {}, 'claude-sonnet-x'),
    ],
    { id: 'i1', type: 'implementer', description: 'P1', toolUseId: 'a2' },
  );
  const impl2 = sub(
    [
      { type: 'user', timestamp: T(31), message: { content: 'Phase P2.' } },
      assistant('i2-1', 33, [toolUse('ir1', 'Read', { file_path: 'D:\\work\\My Repo\\server\\src\\x.ts' })], {}, 'claude-opus-x'),
      assistant('i2-2', 38, [], {}, 'claude-opus-x'),
    ],
    { id: 'i2', type: 'implementer', description: 'P2', toolUseId: 'a3' },
  );
  const run = analyze({
    main: parseTranscript(mainRecords()),
    subagents: [impl2, planner, impl1],
    projectPath: PROJECT,
    sessionId: 'abcdef12-0000',
    declared: { implementer: 'sonnet' },
  });

  const main = run.agents[0];
  assert.equal(main.turns, 8); // m1 written twice, counted once
  assert.equal(main.usage.output, 80);
  assert.deepEqual(run.agents.map((a) => a.label), ['main', 'planner#1', 'implementer#2', 'implementer#3']);
  const plannerRow = run.agents[1];
  assert.equal(plannerRow.turnLimit, 60);
  assert.equal(plannerRow.resumes, 1);
  assert.equal(plannerRow.background, true);
  assert.equal(plannerRow.errors.length, 1);
  assert.equal(plannerRow.errors[0].tool, 'Bash');
  assert.equal(plannerRow.maxContext, 1007);
  assert.deepEqual(run.parallelGroups, [['implementer#2', 'implementer#3']]);
  assert.equal(run.agents[3].modelMismatch, true); // implementer#3 ran opus, declared sonnet
  assert.equal(run.agents[2].modelMismatch, false);
  assert.deepEqual(run.questions, ['Which mode?']);

  const plan = run.sharedReads.find((e) => e.path === 'docs/plan.md');
  assert.deepEqual([plan.agents, plan.reads], [2, 2]);
  const x = run.sharedReads.find((e) => e.path === 'server/src/x.ts'); // `src/x.ts` read from server/ is folded in
  assert.equal(x.agents, 2);
  const typecheck = run.repeatedCommands.find((c) => c.command === 'pnpm typecheck');
  assert.deepEqual([typecheck.times, typecheck.agents], [2, 2]);
  const verify = run.repeatedCommands.find((c) => c.command === 'node scripts/verify.mjs');
  assert.equal(verify.times, 2);
  assert.equal(run.boilerplate[0].agents.length, 2);

  const md = renderFacts(run);
  for (const heading of ['## Totals', '## Agents in launch order (3 subagents)', '## Waste signals', '## Digest per agent']) {
    assert.ok(md.includes(heading), heading);
  }
  assert.ok(md.includes('hit 60'));
  assert.ok(md.includes('Model differs from the agent definition: implementer#3'));
  assert.ok(md.includes('Ran in parallel: {implementer#2, implementer#3}'));
  assert.ok(!md.includes('ghp_zzzz'), 'secrets are masked in the digest');
});

test('loadRun reads a session and its subagents; trend lines upsert per session', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retro-'));
  const dir = path.join(root, encodeProjectDir(PROJECT));
  const subDir = path.join(dir, 'sess-1', 'subagents');
  fs.mkdirSync(subDir, { recursive: true });
  const jsonl = (recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'sess-1.jsonl'), jsonl(mainRecords()));
  fs.writeFileSync(path.join(subDir, 'agent-p1.jsonl'), jsonl([assistant('p-1', 3, [])]));
  fs.writeFileSync(path.join(subDir, 'agent-p1.meta.json'), JSON.stringify({ agentType: 'planner', description: 'Plan it', toolUseId: 'a1' }));

  const loaded = loadRun({ projectsRoot: root, projectCandidates: [PROJECT], session: 'latest' });
  assert.equal(loaded.sessionId, 'sess-1');
  assert.equal(loaded.subagents.length, 1);
  const late = loadRun({ projectsRoot: root, projectCandidates: [PROJECT], session: 'sess-1', since: T(10) });
  assert.equal(late.subagents.length, 0, '--since drops subagents that ran before it');
  assert.throws(() => loadRun({ projectsRoot: root, projectCandidates: ['C:\\nope'] }), /no transcripts folder/);

  const run = analyze({ ...loaded, projectPath: PROJECT });
  const trend = path.join(root, 'trend.jsonl');
  upsertTrend(trend, trendLine(run));
  upsertTrend(trend, trendLine(run));
  const lines = fs.readFileSync(trend, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).subagents, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('workflow drift: files committed after the run or uncommitted now, deduped; rendered in the facts', () => {
  const drift = parseWorkflowDrift(
    'AGENTS.md\n.claude/agents/plan-verifier.md\n\nAGENTS.md\n',
    ' M .claude/skills/run-plan/SKILL.md\n?? .claude/skills/workflow-retro/\nR  .claude/agents/planner.md -> .claude/agents/implementation-planner.md\n',
  );
  assert.deepEqual(drift, [
    '.claude/agents/implementation-planner.md',
    '.claude/agents/plan-verifier.md',
    '.claude/skills/run-plan/SKILL.md',
    '.claude/skills/workflow-retro/',
    'AGENTS.md',
  ]);
  const base = { main: parseTranscript(mainRecords()), subagents: [], projectPath: PROJECT, sessionId: 'abcdef12' };
  assert.ok(renderFacts(analyze({ ...base, workflowDrift: drift })).includes('Workflow files changed since this run started (5)'));
  assert.ok(renderFacts(analyze({ ...base, workflowDrift: [] })).includes('Workflow files changed since this run: none'));
  assert.ok(renderFacts(analyze({ ...base, workflowDrift: null })).includes('unknown (not a git repository)'));
});

test('declaredModels reads model: from .claude/agents frontmatter and skips inherit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retro-'));
  fs.mkdirSync(path.join(root, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'agents', 'a.md'), '---\nname: verifier\nmodel: sonnet\n---\nbody');
  fs.writeFileSync(path.join(root, '.claude', 'agents', 'b.md'), '---\nname: other\nmodel: inherit\n---\nbody');
  assert.deepEqual(declaredModels(root), { verifier: 'sonnet' });
  fs.rmSync(root, { recursive: true, force: true });
  // Same parser for definitions read from git at the run's start (`git show <rev>:<path>`).
  assert.deepEqual(parseDeclaredModels([{ file: '.claude/agents/planner.md', text: '---\nmodel: opus\n---\n' }]), {
    planner: 'opus',
  });
});

const result = (min, toolUseId) => ({
  type: 'user',
  timestamp: T(min),
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }] },
});
const prompt = (min, origin, text = 'next') => ({ type: 'user', timestamp: T(min), origin: { kind: origin }, message: { content: text } });

test('triggerKind: human, peer and task notifications by origin; text fallback for old transcripts', () => {
  assert.equal(triggerKind({ origin: { kind: 'human' } }), 'user');
  assert.equal(triggerKind({ origin: { kind: 'peer' }, isMeta: true }), 'agents');
  assert.equal(triggerKind({ turnOrigin: 'task_notification' }), 'agents');
  assert.equal(triggerKind({ origin: { kind: 'hook' } }), 'other');
  assert.equal(triggerKind({ isMeta: true, message: { content: '<system-reminder>x' } }), null);
  assert.equal(triggerKind({ message: { content: '<task-notification><task-id>a</task-id>' } }), 'agents');
  assert.equal(triggerKind({ message: { content: 'approve' } }), 'user');
});

test('time: pauses split by what ended them; questions and foreground agents are waits, not tool time', () => {
  const recs = [
    prompt(0, 'human', 'start'),
    assistant('t1', 1, []), // turn ends
    prompt(6, 'human'), // 5 min waiting for the user
    assistant('t2', 7, [toolUse('ask', 'AskUserQuestion', { questions: [{ question: 'Mode?' }] })]),
    result(9, 'ask'), // 2 min answering
    assistant('t3', 10, [toolUse('fg', 'Agent', { subagent_type: 'x', description: 'fg', prompt: 'p' })]),
    result(15, 'fg'), // 5 min blocked on a foreground agent
    assistant('t4', 16, [toolUse('bg', 'Agent', { subagent_type: 'y', description: 'bg', prompt: 'p', run_in_background: true })]),
    result(16, 'bg'),
    assistant('t5', 16, []), // turn ends, background agent runs
    prompt(20, 'peer', 'hand-back'), // 4 min waiting for agents
    assistant('t6', 21, [toolUse('b1', 'Bash', { command: 'pnpm test' })]),
    result(23, 'b1'), // 2 min tool call
    assistant('t7', 24, []),
  ];
  const run = analyze({ main: parseTranscript(recs), subagents: [], projectPath: PROJECT, sessionId: 's-time' });
  const w = run.time.waits;
  assert.deepEqual([w.user.ms, w.user.count], [5 * 60000, 1]);
  assert.deepEqual([w.questions.ms, w.questions.count], [2 * 60000, 1]);
  assert.deepEqual([w.agents.ms, w.agents.count], [9 * 60000, 2]);
  assert.equal(w.agents.longestAt, T(10));
  assert.equal(run.time.wallMs, 24 * 60000);
  assert.equal(run.time.activeMs, 8 * 60000);
  assert.deepEqual(run.time.longestTools.map((t) => [t.name, t.ms]), [['Bash', 2 * 60000], ['Agent', 0]]);
  const md = renderFacts(run);
  assert.ok(md.includes('## Time'));
  assert.ok(md.includes('- waiting for the user between turns: 5m (21%) — 1 pause(s), longest 5m'));
  assert.equal(duration(45_000), '45s');
  assert.equal(duration(65 * 60000), '1h 05m');
});

test('compare: metric and per-type deltas between two runs; previous = last other session in trend.jsonl', () => {
  const mk = (sessionId, extraAgents) =>
    analyze({
      main: parseTranscript(mainRecords()),
      subagents: extraAgents,
      projectPath: PROJECT,
      sessionId,
    });
  const agent = (id, type) => sub([assistant(`${id}-1`, 31, []), assistant(`${id}-2`, 33, [])], { id, type, description: id, toolUseId: `x-${id}` });
  const before = summarize(mk('old-session', [agent('a', 'planner'), agent('b', 'reviewer'), agent('c', 'reviewer')]));
  const now = summarize(mk('new-session', [agent('d', 'planner')]));
  const cmp = compareRuns(before, now);
  const row = (m) => cmp.rows.find((r) => r.metric === m);
  assert.deepEqual([row('subagents').before, row('subagents').now], [3, 1]);
  assert.deepEqual(
    cmp.byType.map((t) => [t.type, t.before.count, t.now.count]),
    [['reviewer', 2, 0], ['planner', 1, 1]],
  );
  const run = mk('new-session', []);
  run.comparison = { ...cmp, changedBetween: ['AGENTS.md'] };
  const md = renderFacts(run);
  assert.ok(md.includes('## Compared with old-sess'));
  assert.ok(md.includes('| subagents | 3 | 1 | -2 (-67%) |'));
  assert.ok(md.includes('Workflow files changed between the two runs (1): `AGENTS.md`'));

  const trend = ['{"session":"a"}', '{"session":"b"}', 'not json', '{"session":"c"}'].join('\n');
  assert.equal(previousSession(trend, 'c'), 'b');
  assert.equal(previousSession(trend, 'z'), 'c');
  assert.equal(previousSession('', 'c'), null);
});
