# Evals для skill `onion-architecture`

Всё, что относится к evals этого skill'а, лежит в этой папке — она едет вместе со skill'ом.
Кейсы — `evals.json` (промпты + assertions, формат skill-creator); остальное нужно для прогона.

```
onion-architecture/evals/
├── evals.json          кейсы и assertions
├── assemble.mjs        собирает фикстуру кейса; `--check` — проверка целостности
├── fixtures/
│   ├── base/           общий срез server/ (db, platform, vendor/shared, repos, mocks)
│   └── cases/<case>/   только то, что отличает кейс: modules/<case>/, modules/index.ts, db/rows.ts
└── baselines/benchmark.json   эталонный результат iteration-1
```

## Как запустить

1. Собрать фикстуру кейса (`fixture` из `evals.json`):
   `node .claude/skills/onion-architecture/evals/assemble.mjs memory <outDir>`
2. Дать агенту `<outDir>/server` и промпт кейса; для варианта «со skill'ом» — ещё
   папку skill'а `.claude/skills/onion-architecture`. Результат — `review.md`.
3. Проверить каждый assertion; сравнить с `baselines/benchmark.json`.
   Рабочие папки прогонов (`iteration-*`, viewer) держим в `.devdigest/skill-evals/` — они в `.gitignore`.

Готовый прогон с viewer'ом и benchmark: skill `skill-creator:skill-creator`.

## Правила для фикстур

- **Слепые кейсы:** в коде нет комментариев, называющих нарушение. Список заложенных
  нарушений живёт только в `assertions` в `evals.json`.
- В фикстуре есть копия `server/AGENTS.md` без упоминания skill'а: измеряется вклад skill'а
  поверх `AGENTS.md`, а не поверх нуля.
- Каждый кейс содержит и **ловушку** — легальный код, похожий на нарушение; его нельзя
  записывать в находки.
- Новый кейс: папка `fixtures/cases/<case>/`, запись в `evals.json` (поле `fixture`),
  затем `node .claude/skills/onion-architecture/evals/assemble.mjs --check`.
- Фикстуры лежат вне пакетов (`server/`, `client/` …) и не попадают в их tsc / eslint / `pnpm arch`.

## Результат iteration-1 (1 прогон на конфигурацию, sonnet)

| | со skill'ом | без skill'а |
|---|---|---|
| assertions | 15/15 | 13/15 |

Различие дали `FastifyBaseLogger` в сервисе (без skill'а не найден) и путь исправления
межмодульного вызова (через `container`, а не через сервис соседа). Остальные нарушения
покрыты `server/AGENTS.md`, поэтому ловятся и без skill'а.

## Результат iteration-2: v1 против v2 skill'а (sonnet)

v2 добавил в `SKILL.md`: строку про атомарную запись (`db.transaction` в репозитории), красные флаги
на обратные импорты (`db/`, `adapters/`, `platform/`, `vendor/shared/` → `modules/`), глубокий импорт
`reviewer-core/src/*` и раздел «Reviewing a diff» с таблицей R5/R7/R8/R10/R11.
Кейсы 4 (`evals`) и 5 (`ci`) написаны под эти правила; кейсы 1–3 — проверка на регрессию.

| | v2 (new) | v1 (old) |
|---|---|---|
| assertions (7 прогонов) | 100% | 97.6% |

Единственное различие: в одном из двух прогонов v1 на кейсе 4 неатомарная пара
`deleteRuns` + `updateCase` отнесена к «не проблема слоёв». Остальное v1 находит и так, потому что
R5/R7/R8/R10/R11 уже были в `references/rules.md`. Эталон — `baselines/benchmark-v1-vs-v2.json`.

## Результат iteration-3: большая фикстура, по 5 прогонов (v1 против v3)

Кейс 6 (`reports`): 389 строк в модуле + `_shared/` + `platform/`, 8 заложенных нарушений (2 простых,
3 средних, 3 «невидимых» для `pnpm arch`) и 3 легальных двойника. Оценка — `node grade.mjs <iterationDir>`
(шаблоны в `graders.json`), выборочно проверена вручную.

| нарушение | v1 | v3 |
|---|---|---|
| route вызывает GitHub сам; нет workspace-scope | 5/5 | 5/5 |
| глубокий импорт reviewer-core; platform → modules | 5/5 | 5/5 |
| репозиторий отдаёт DTO; `scoring.ts` с `process.env`; `_shared` → сервис соседа | 5/5 | 5/5 |
| **`deleteForPull` + `insert` без транзакции** | **1/5** | **5/5** |
| ложные срабатывания на 3 двойника | 0/15 | 0/15 |

Итог: 92,8% против 100%. Весь разрыв — одна находка (атомарность), которой нет в v1 `SKILL.md`.
Новый раздел 5c («второй проход») на этих данных ничего не добавил: v1 находил те же «невидимые»
нарушения, потому что промпт кейса сам просит искать то, что не ловит import checker.
Чтобы проверить 5c, нужен прогон без этой подсказки в промпте.
Эталон — `baselines/benchmark-v1-vs-v3-large.json`.
