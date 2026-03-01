# Шаг 0: Восстановление после compact

**Выполняй этот шаг ТОЛЬКО если ты читаешь этот файл потому что контекст был сжат (compact) во время выполнения issue-executor.**

Если ты запускаешь issue-executor впервые — пропусти этот шаг и переходи к Шагу 1.

## 0.1: Прочитай state

```bash
SM="$CLAUDE_PROJECT_DIR/.claude/scripts/state-manager.sh"
bash "$SM" read-active
```

Вывод содержит: текущую фазу, active issues (не MERGED), их статусы и worktree_path. Продолжи с соответствующего шага.

**Валидация версии**: если `schema_version` < 3 или отсутствует — state устаревший, используй fallback (0.2).

## 0.2: Fallback — если state файла нет

Найди issues в статусе in-progress:

```bash
gh issue list --label "in-progress" --state open --json number,title
```

Для каждого in-progress issue проверь result file или AGENT_META:
```bash
# Сначала проверь result file (prefer match by issue number)
RESULT_FILE=$(find "$CLAUDE_PROJECT_DIR/.claude/results" -name "solver-${ISSUE_NUMBER}.json" 2>/dev/null | head -1)
if [ -z "$RESULT_FILE" ]; then
  RESULT_FILE=$(find "$CLAUDE_PROJECT_DIR/.claude/results" -name "solver-*.json" 2>/dev/null | head -1)
fi
if [ -z "$RESULT_FILE" ]; then
  LAST_COMMENT=$(gh issue view <NUMBER> --json comments --jq '.comments[-1].body')
  STATUS=$(echo "$LAST_COMMENT" | grep -o 'STATUS=[^ ]*' | cut -d= -f2 || echo "UNKNOWN")
  BRANCH=$(echo "$LAST_COMMENT" | grep -o 'BRANCH=[^ ]*' | cut -d= -f2 || echo "")
fi
```

- **Issue закрыт + STATUS=READY_FOR_REVIEW** → нужен review + мерж (Шаг 6)
- **Issue открыт + нет AGENT_META** → перезапусти через Шаг 5

## 0.3: Продолжи выполнение

После восстановления состояния продолжи с соответствующего шага.
