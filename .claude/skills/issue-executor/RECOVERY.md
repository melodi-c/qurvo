# Шаг 0: Восстановление после compact

**Выполняй этот шаг ТОЛЬКО если ты читаешь этот файл потому что контекст был сжат (compact) во время выполнения issue-executor.**

Если ты запускаешь issue-executor впервые — пропусти этот шаг и переходи к Шагу 1.

## 0.1: Прочитай state

```bash
SM="$CLAUDE_PROJECT_DIR/.claude/scripts/state-manager.sh"
bash "$SM" read-active
```

Вывод содержит: текущую фазу, active issues (не MERGED), их статусы, worktree_path и **task_id**. Продолжи с соответствующего шага.

**Валидация версии**: если `schema_version` != 3 или отсутствует — state устаревший, используй fallback (0.2).

### 0.1.1: Проверка живых background-агентов (CRITICAL)

**Compact НЕ убивает background-агентов.** Solver'ы, запущенные с `run_in_background: true`, продолжают работать после compact. Поэтому **НИКОГДА не рестартируй solver, пока не убедился что он мёртв.**

Для каждого issue в статусе `SOLVING` с непустым `task_id`:

1. Вызови `TaskOutput(task_id=<TASK_ID>, block=false, timeout=5000)` чтобы проверить статус задачи
2. **Если задача ещё выполняется** (статус running/in_progress) → **НЕ рестартируй**. Агент жив и сам завершится. Просто жди уведомления о завершении, как в обычном Шаге 5.
3. **Если задача завершена** → прочитай результат solver-файла и переходи к Шагу 6 (review pipeline)
4. **Если task_id отсутствует** (legacy state) → используй phase-based recovery (матрица ниже)

**Вывод**: после проверки task_id у тебя два набора issues:
- **Живые** (agent ещё работает) → вернись в режим ожидания Шага 5 (жди уведомления от системы)
- **Завершённые** (agent закончил) → обработай результат (Шаг 6)
- **Без task_id** (legacy) → phase-based recovery (ниже)

## 0.2: Fallback — если state файла нет

Найди issues в статусе in-progress:

```bash
gh issue list --label "in-progress" --state open --json number,title
```

Для каждого in-progress issue проверь result file:
```bash
# Ищи result file ТОЛЬКО по точному номеру issue — НЕ используй wildcard fallback
RESULT_FILE="$CLAUDE_PROJECT_DIR/.claude/results/solver-${ISSUE_NUMBER}.json"
if [ ! -f "$RESULT_FILE" ]; then
  # Файл не найден — проверь AGENT_META в issue comment
  LAST_COMMENT=$(gh issue view <NUMBER> --json comments --jq '.comments[-1].body')
  STATUS=$(echo "$LAST_COMMENT" | grep -o 'STATUS=[^ ]*' | cut -d= -f2 || echo "UNKNOWN")
  BRANCH=$(echo "$LAST_COMMENT" | grep -o 'BRANCH=[^ ]*' | cut -d= -f2 || echo "")
fi
```

- **Issue открыт + STATUS=RUNNING** → проверь фазу solver'а для точного recovery:
  ```bash
  if [[ "$STATUS" == "RUNNING" ]]; then
    PHASE=$(jq -r '.phase // "UNKNOWN"' "$RESULT_FILE" 2>/dev/null)
    WORKTREE=$(jq -r '.worktree_path // empty' "$RESULT_FILE" 2>/dev/null)
    echo "Solver #$ISSUE_NUMBER was in phase: $PHASE, worktree: $WORKTREE"
  fi
  ```
  Матрица решений по фазе (только для issues **без task_id** или с мёртвым агентом):
  - **INIT / ANALYZING / PLANNING** → перезапуск с новым worktree (код ещё не менялся)
  - **IMPLEMENTING** → перезапуск в существующем worktree `$WORKTREE` (есть частичные изменения)
  - **TESTING / BUILDING / LINTING / FINALIZING** → перезапуск в существующем worktree `$WORKTREE` (код готов, нужен DoD)
  - **UNKNOWN / нет phase (legacy)** → перезапуск с новым worktree (безопасный fallback)
- **Issue открыт + STATUS=READY_FOR_REVIEW** → нужен review + мерж (Шаг 6)
- **Issue открыт + нет AGENT_META** → перезапусти через Шаг 5

## 0.3: Продолжи выполнение

После восстановления состояния продолжи с соответствующего шага.

## 0.4: Orphan issue detection

Если issue зарегистрирован в state (PENDING), но отсутствует в `parallel_groups` —
это orphan от прерванного `add-to-group`:
```bash
# Получи declared group из state
DECLARED_GROUP=$(bash "$SM" get ".issues[\"<ORPHAN_NUMBER>\"].group")
bash "$SM" add-to-group <ORPHAN_NUMBER> $DECLARED_GROUP
```
