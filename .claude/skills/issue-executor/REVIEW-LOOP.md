# Review Loop (Шаги 6.1-6.3)

После завершения solver'а и получения READY_FOR_REVIEW — запусти review loop.

Навесь лейбл `under-review`:
```bash
gh issue edit <NUMBER> --add-label "under-review"
```

## 6.1 Lint Check

```
subagent_type: "lint-checker"
model: haiku
run_in_background: false
prompt: |
  WORKTREE_PATH: <абсолютный путь к worktree>
  AFFECTED_APPS: <список>
  BASE_BRANCH: <ветка>
  RESULT_FILE: <WORKTREE_PATH>/.claude/results/lint-<NUMBER>.json
```

Прочитай `RESULT_FILE`. Обработка:
- `PASS` → переходи к 6.2
- `FAIL` → re-launch solver (max 1 retry):
  ```
  subagent_type: "issue-solver"
  run_in_background: false
  isolation: "worktree"
  prompt: |
    Исправь следующие lint-проблемы в worktree {WORKTREE_PATH}:
    <LINT_ISSUES>

    Issue #{NUMBER}: {TITLE}
    AFFECTED_APPS: {APPS}
    BASE_BRANCH: {BRANCH}
    RESULT_FILE: <WORKTREE_PATH>/.claude/results/solver-<NUMBER>.json
  ```

## 6.2 Migration Validation (только если has-migrations)

Если issue имеет лейбл `has-migrations` или solver изменил файлы в `packages/@qurvo/db/drizzle/` или `packages/@qurvo/clickhouse/`:

```
subagent_type: "migration-validator"
model: sonnet
run_in_background: false
prompt: |
  WORKTREE_PATH: <абсолютный путь>
  BASE_BRANCH: <ветка>
  RESULT_FILE: <WORKTREE_PATH>/.claude/results/migration-<NUMBER>.json
```

Прочитай `RESULT_FILE`. Обработка:
- `PASS` или `WARN` → продолжай
- `FAIL` → re-launch solver с описанием проблем (max 1 retry)

## 6.3 Logic Review + Security Check (параллельно)

Запусти `issue-reviewer` и `security-checker` **параллельно** (`run_in_background: true`):

**issue-reviewer**:
```
subagent_type: "issue-reviewer"
run_in_background: true
prompt: |
  WORKTREE_PATH: <абсолютный путь к worktree>
  ISSUE_NUMBER: <номер>
  ISSUE_TITLE: <заголовок issue>
  ISSUE_BODY: <тело issue — первые 500 символов>
  ACCEPTANCE_CRITERIA: <список acceptance criteria из issue body>
  AFFECTED_APPS: <список>
  BASE_BRANCH: <ветка>
  TEST_SUMMARY: <результаты тестов — passed/failed>
  CHANGED_FILES_SUMMARY: <список изменённых файлов — 1-2 строки на файл>
  RESULT_FILE: <WORKTREE_PATH>/.claude/results/reviewer-<NUMBER>.json
```

**security-checker**:
```
subagent_type: "security-checker"
model: haiku
run_in_background: true
prompt: |
  WORKTREE_PATH: <абсолютный путь к worktree>
  AFFECTED_APPS: <список>
  BASE_BRANCH: <ветка>
  RESULT_FILE: <WORKTREE_PATH>/.claude/results/security-<NUMBER>.json
```

Дождись завершения обоих. Прочитай оба `RESULT_FILE`. Обработка:

- **Оба APPROVE/PASS** → issue status → `REVIEW_PASSED` → переходи к 6.4 (мерж)
- **reviewer: REQUEST_CHANGES** или **security: FAIL** → structured feedback → re-launch solver (max 2 итерации)

**Structured feedback protocol** (передаётся solver'у при retry):
```
Исправь следующие проблемы в worktree {WORKTREE_PATH}:
1. [{SEVERITY}] {file}:{line} — {description}. Suggested: {code}
2. [{SEVERITY}] {file}:{line} — {description}. Suggested: {code}

Issue #{NUMBER}: {TITLE}
AFFECTED_APPS: {APPS}
BASE_BRANCH: {BRANCH}
RESULT_FILE: <WORKTREE_PATH>/.claude/results/solver-<NUMBER>.json
```

Если после 2-й итерации review всё ещё FAIL/REQUEST_CHANGES → эскалируй пользователю.
