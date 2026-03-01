#!/usr/bin/env bash
# PreToolUse hook: блокирует прямые деструктивные git-операции
# во время работы issue-executor (когда execution-state.json существует).
#
# Получает JSON через stdin:
#   { "tool_name": "Bash", "tool_input": { "command": "..." }, "cwd": "..." }
# Блокирует через exit 2.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$COMMAND" ]; then exit 0; fi

# Активен только во время executor (state file существует)
STATE_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/state/execution-state.json"
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# ── Косвенное выполнение (обход через bash -c / eval / sh -c) ────
if echo "$COMMAND" | grep -qE '(^|[;&|]+[[:space:]]*)((env[[:space:]]+)?bash[[:space:]]+-c|(env[[:space:]]+)?sh[[:space:]]+-c|eval)[[:space:]]'; then
  cat >&2 <<MSG
[restrict-executor] BLOCKED: indirect command execution not allowed.
Executor — оркестратор. Git-операции, изменяющие рабочую копию,
выполняются только через скрипты (.claude/scripts/) или подагентами.
MSG
  exit 2
fi

# ── Блокируемые операции ──────────────────────────────────────────
# Прямые git-команды, которые меняют состояние рабочей копии.
# Скрипты (.claude/scripts/) вызывают git внутри себя — хук видит
# только top-level Bash command (bash merge-worktree.sh ...), не блокируя.
#
# GIT_OPTS учитывает флаги перед субкомандой (-C <path>, -c key=val,
# --git-dir, --work-tree и т.д.), чтобы нельзя было обойти блокировку
# через "git -C /path checkout ...".

BLOCKED=""

# Паттерн: git [произвольные флаги/аргументы]* <субкоманда>
# Флаги git перед субкомандой: -C <path>, -c <key=val>, --git-dir=..., и т.д.
GIT_OPTS='([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|--git-dir(=[^[:space:]]+|[[:space:]]+[^[:space:]]+)|--work-tree(=[^[:space:]]+|[[:space:]]+[^[:space:]]+)|--namespace(=[^[:space:]]+|[[:space:]]+[^[:space:]]+)|--bare|--no-pager|--no-replace-objects))*'

# git checkout / switch (меняет HEAD — ломает worktree creation)
if echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)git${GIT_OPTS}[[:space:]]+(checkout|switch)[[:space:]]"; then
  BLOCKED="git checkout/switch — меняет HEAD, ломает создание worktree"

# git cherry-pick (вносит коммиты вне контролируемого flow)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)git${GIT_OPTS}[[:space:]]+cherry-pick"; then
  BLOCKED="git cherry-pick — запрещён, используй solver для изменений"

# git rebase (переписывает историю)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)git${GIT_OPTS}[[:space:]]+rebase"; then
  BLOCKED="git rebase — запрещён для executor"

# git merge (прямой, не через merge-worktree.sh)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)git${GIT_OPTS}[[:space:]]+merge[[:space:]]" \
  && ! echo "$COMMAND" | grep -q 'merge-worktree\.sh'; then
  BLOCKED="git merge — используй merge-worktree.sh"

# git reset --hard (теряет изменения)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)git${GIT_OPTS}[[:space:]]+reset[[:space:]]+--hard"; then
  BLOCKED="git reset --hard — запрещён для executor"

# git stash (скрывает состояние)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)git${GIT_OPTS}[[:space:]]+stash"; then
  BLOCKED="git stash — запрещён для executor"

# git push (блокируем только прямой push в main/master)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)git${GIT_OPTS}[[:space:]]+push"; then
  # Разрешаем push через merge-worktree.sh
  if echo "$COMMAND" | grep -qE 'merge-worktree\.sh'; then
    :
  # Разрешаем push для swagger/OpenAPI regeneration
  elif echo "$COMMAND" | grep -qE 'swagger.*generate|generate-api|regenerate OpenAPI'; then
    :
  # Разрешаем push в feature/fix/hotfix ветки (только issue-* паттерн)
  elif echo "$COMMAND" | grep -qE "git${GIT_OPTS}[[:space:]]+push[[:space:]]+[^[:space:]]+[[:space:]]+(fix/issue-|feature/issue-|hotfix/issue-)[0-9]"; then
    :
  # Блокируем прямой push в main/master (учитываем -C и другие флаги)
  elif echo "$COMMAND" | grep -qE "git${GIT_OPTS}[[:space:]]+push[[:space:]]+[^[:space:]]+[[:space:]]+(main|master)\b"; then
    BLOCKED="direct push to main/master — запрещён"
  fi
  # Остальные push (например, push текущей ветки после OpenAPI update) — разрешены

# gh pr create/merge (разрешаем — executor создаёт PR для feature-веток и sub-issues)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+[[:space:]]*)gh[[:space:]]+pr[[:space:]]+(create|merge)"; then
  :  # разрешено
fi

if [ -n "$BLOCKED" ]; then
  cat >&2 <<MSG
[restrict-executor] BLOCKED: $BLOCKED.
Executor — оркестратор. Git-операции, изменяющие рабочую копию,
выполняются только через скрипты (.claude/scripts/) или подагентами.
MSG
  exit 2
fi

exit 0
