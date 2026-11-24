import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier for the instruction tree: root `AGENTS.md` (loaded through `CLAUDE.md`)
 * → the package `AGENTS.md` → the docs and skills each of them routes to.
 *
 * Why package AGENTS.md is a READ assertion: a nested `<pkg>/CLAUDE.md` reaches the model only as the
 * literal `@AGENTS.md` (the import is not expanded — root INSIGHTS.md, 2026-11-01), so the root rule
 * "read that package's AGENTS.md first" shows up as a real `Read` in the trace.
 *
 * Merged on purpose: each `trace` session folds 3–4 related asks into ONE session to pay the harness
 * load once. What is NOT merged, and why:
 *   - positive/negative pairs of the same skill (a negative is meaningless in a session that also
 *     triggers the skill);
 *   - a subagent dispatch with a text assertion (text needs the final answer, so the nested subagent
 *     would run to completion instead of the session stopping at the dispatch);
 *   - steps the pipeline separates by a user decision (spec-creator → planner).
 * Prompts never name the file they expect — the routing has to find it.
 *
 * Budget: 8 Claude sessions — 4 routing traces + 1 dispatch trace + 1 negative trace + 2 activation.
 * Session 5 dispatches a subagent (the run stops at the launch); it is the flakiest on cheap models.
 */
export const cases: WorkflowCase[] = [
  // --- 1. server: root → server/AGENTS.md → onion-architecture skill + repo-intel README --------
  {
    kind: "trace",
    name: "server tasks route through server/AGENTS.md to its docs, skill and commands",
    prompt:
      "Відповідай за правилами цього репо. Код поки не пиши — лише план і відповіді.\n" +
      "1) У сервері треба додати новий модуль `tags` з ендпоінтом GET /tags — які файли створиш або " +
      "зміниш і що в якому шарі лежатиме?\n" +
      "2) Хочу змінити, як під час індексації репозиторію рахується важливість файлу — які сигнали " +
      "зараз враховуються, у якому файлі це рахується і куди зберігається результат?\n" +
      "3) Якою командою прогнати лише юніт-тести сервера, без Docker?\n" +
      "4) Для нової таблиці треба поправити SQL міграції — як це правильно зробити?",
    // No expectSkills: server/AGENTS.md says to invoke onion-architecture "before adding backend
    // code", and this prompt forbids code — so not invoking it is correct (routing-v1: 0/2 on it).
    // Ask 2 needs repo-intel README CONTENT (rank.ts, PageRank + git hotness, file_rank), not just its
    // name — routing-v2 answered "what should I read" by naming the README without opening it.
    expectFilesRead: ["server/AGENTS.md", "server/src/modules/repo-intel/README.md"],
    expectText: [/--exclude\s+['"]?\*\*\/\*\.it\.test/, /db:generate/, /rank\.ts/, /hotness/i, /file_rank/],
    // 16, not 12: deepseek-v4.1-flash read 30 files (39 tool calls, incl. denied Bash attempts) and hit
    // 12 before answering (CI run 2026-11-24); same budget as the client and cross-package cases.
    maxTurns: 16,
  },

  // --- 2. client: root → client/AGENTS.md → frontend-ui-architecture + design-system README ----
  {
    kind: "trace",
    name: "client tasks route through client/AGENTS.md to its docs, skill and conventions",
    prompt:
      "Відповідай за правилами цього репо. Код поки не пиши — лише план і відповіді.\n" +
      "1) У клієнті на сторінці PR треба додати новий компонент-бейдж зі статусом ревʼю — де він " +
      "житиме і з яких файлів складатиметься?\n" +
      "2) Як цей компонент стилізувати?\n" +
      "3) Для нього доведеться розширити наявний компонент дизайн-системи — що прочитати перед цим?",
    // No expectSkills — same reason as the server case. 16 turns: it explores existing badges before
    // answering, and routing-v1 run 1 hit 12 turns without a final answer.
    expectFilesRead: ["client/AGENTS.md", "client/src/vendor/ui/README.md"],
    expectText: [/styles\.ts/, /CSSProperties|var\(--/],
    maxTurns: 16,
  },

  // --- 3. cross-package: specs/README + BOTH shared copies + mcp contracts ----------------------
  {
    kind: "trace",
    name: "a cross-package contract change reaches the spec rules, both shared copies and mcp",
    prompt:
      "Плануємо фічу, яка зачіпає server, client і MCP-сервер: у знахідку ревʼю (finding) додаємо " +
      "нове поле `priority` — API його віддає, клієнт показує, MCP-інструмент повертає. Код не пиши.\n" +
      "1) Де і як оформити специфікацію для такої фічі?\n" +
      "2) Які саме файли контрактів доведеться змінити?\n" +
      "3) Що окремо треба оновити в MCP-сервері?",
    // The contract paths are KNOWLEDGE from root AGENTS.md (already in context), so they are text
    // asserts — routing-v1 answered them correctly without opening a shared file. The one read
    // asserted is the rule "read the package's AGENTS.md first" for the package with its own rules.
    expectFilesRead: ["mcp/AGENTS.md"],
    expectText: [
      /server\/src\/vendor\/shared/,
      /client\/src\/vendor\/shared/,
      /mcp\/src\/contracts\.ts/,
      /(^|[\s`(])specs\//m, // root specs/, not <package>/specs/
    ],
    // 16, not 12: deepseek-v4.1-flash explores wider than Sonnet and hit 12 before answering
    // (CI run 2026-11-24); same budget as the client case.
    maxTurns: 16,
  },

  // --- 4. root ops: Docs table → TESTING.md + the docker-volume gotcha --------------------------
  {
    kind: "trace",
    name: "root routing: test placement goes to TESTING.md, a DB reset warns about the volume",
    prompt:
      "Два питання по процесу в цьому репо:\n" +
      "1) Пишу тест для нового серверного сервісу, який ходить у справжній Postgres — у який набір " +
      "тестів його покласти і чому CI на моєму PR міг узагалі не запуститися?\n" +
      "2) База в Docker поводиться дивно — можна просто зробити `docker compose down -v` і підняти заново?",
    expectFilesRead: ["TESTING.md"],
    expectText: [/\.it\.test\.ts/, /devdigest_pgdata/],
    maxTurns: 8,
  },

  // --- 5. pipeline: planning goes to implementation-planner, no researcher pre-pass -------------
  // No text assertion here: the session stops the moment the planner is launched.
  {
    kind: "trace",
    name: "a planning request dispatches implementation-planner without a researcher pre-pass",
    prompt:
      "Сплануй реалізацію нової фічі: експорт ревʼю в markdown через GET /reviews/:id/export на " +
      "сервері та кнопка «Export» на сторінці ревʼю в клієнті. План збережи в " +
      ".devdigest/plans/99-review-export.md.",
    expectSubagents: ["implementation-planner"],
    forbidSubagents: ["researcher"],
    maxTurns: 6,
  },

  // --- 6. negative: pr-self-review is user-only — the agent must hand it to the user ------------
  {
    kind: "trace",
    name: "opening a PR does not invoke pr-self-review and asks the user to run it",
    prompt: "Я закінчив фічу на цій гілці. Відкривай PR.",
    forbidSkills: ["pr-self-review"],
    expectText: [/\/pr-self-review/],
    // 8, not 4: Sonnet first checks an existing .devdigest/pr-self-review/report.json for staleness
    // (head_sha vs HEAD) — correct behaviour that used up 4 turns before the answer (sonnet-v1 run 1).
    // 12, not 8: deepseek-v4.1-flash read SKILL.md, AGENTS.md, settings.json and retried the denied
    // Bash/git checks, hitting 8 mid-sentence before the handoff (CI run 2026-11-24).
    maxTurns: 12,
  },

  // --- 7–8. activation pair (2 sessions): positive + near-miss negative -------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
