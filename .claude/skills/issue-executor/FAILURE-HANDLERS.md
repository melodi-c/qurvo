# Обработка ошибок

## STATUS: FAILED — Retry механизм

1. Прочитай причину из result file (`RESULT_FILE`) или AGENT_META `FAIL_REASON`
2. **Определи тип ошибки**:
   - **Test failure** → запусти `test-failure-analyzer` для диагностики:
     ```
     subagent_type: "test-failure-analyzer"
     model: haiku
     run_in_background: false
     prompt: |
       WORKTREE_PATH: <path>
       TEST_OUTPUT: <вывод тестов из result file>
       AFFECTED_APPS: <apps>
       ISSUE_NUMBER: <number>
       RESULT_FILE: <WORKTREE_PATH>/.claude/results/test-analyzer-<NUMBER>.json
     ```
     Прочитай `RESULT_FILE`, передай анализ как HINT при retry.
   - **Build failure** → retry 1 раз с hint'ом об ошибке build
   - **Другое** → эскалация пользователю

3. **Retry** (максимум 1 раз):
   ```
   subagent_type: "issue-solver"
   run_in_background: true
   isolation: "worktree"
   prompt: |
     RETRY: предыдущая попытка завершилась ошибкой.
     FAIL_REASON: <причина из первой попытки>
     HINT: <что нужно исправить — конкретный файл, ошибка, тест>

     Issue #{NUMBER}: {TITLE}
     {BODY}
     ...остальной промпт как обычно...
     RESULT_FILE: <WORKTREE_PATH>/.claude/results/solver-<NUMBER>.json
   ```

4. Если retry тоже FAILED → сними `in-progress`, добавь в отчёт, эскалируй:
   ```bash
   gh issue edit <NUMBER> --remove-label "in-progress"
   gh issue edit <NUMBER> --add-label "blocked"
   ```

## STATUS: NEEDS_USER_INPUT

- **Причина содержит "слишком большой"** → запусти `issue-decomposer` в foreground:
  ```
  subagent_type: "issue-decomposer"
  model: sonnet
  run_in_background: false
  prompt: |
    ISSUE_NUMBER: <number>
    ISSUE_TITLE: <title>
    ISSUE_BODY: <body>
    REPO_ROOT: $REPO_ROOT
    RESULT_FILE: /tmp/claude-results/decomposer-<NUMBER>.json
  ```
  Прочитай `RESULT_FILE`. Если `"atomic": true` → эскалируй пользователю. Если вернул sub_issues → создай через `gh issue create`, привяжи к оригинальному issue.
- **Любая другая причина** → сообщи пользователю. При ответе — перезапусти подагента с дополненным промптом + `WORKTREE_PATH`.

## STATUS не найден

Считай FAILED с причиной "подагент не вернул статус". Retry 1 раз. Если повторно нет статуса → сними `in-progress`.

Обнови state после каждого обработанного результата:
```bash
SM="$CLAUDE_PROJECT_DIR/.claude/scripts/state-manager.sh"
bash "$SM" issue-status <NUMBER> <NEW_STATUS>
```
