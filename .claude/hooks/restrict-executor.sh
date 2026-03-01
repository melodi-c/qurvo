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
GIT_OPTS='(\s+(-[Cc]\s+\S+|--git-dir(=\S+|\s+\S+)|--work-tree(=\S+|\s+\S+)|--namespace(=\S+|\s+\S+)|--bare|--no-pager|--no-replace-objects))*'

# git checkout / switch (меняет HEAD — ломает worktree creation)
if echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)git${GIT_OPTS}\s+(checkout|switch)\s"; then
  BLOCKED="git checkout/switch — меняет HEAD, ломает создание worktree"

# git cherry-pick (вносит коммиты вне контролируемого flow)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)git${GIT_OPTS}\s+cherry-pick"; then
  BLOCKED="git cherry-pick — запрещён, используй solver для изменений"

# git rebase (переписывает историю)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)git${GIT_OPTS}\s+rebase"; then
  BLOCKED="git rebase — запрещён для executor"

# git merge (прямой, не через merge-worktree.sh)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)git${GIT_OPTS}\s+merge\s" \
  && ! echo "$COMMAND" | grep -q 'merge-worktree\.sh'; then
  BLOCKED="git merge — используй merge-worktree.sh"

# git reset --hard (теряет изменения)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)git${GIT_OPTS}\s+reset\s+--hard"; then
  BLOCKED="git reset --hard — запрещён для executor"

# git stash (скрывает состояние)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)git${GIT_OPTS}\s+stash"; then
  BLOCKED="git stash — запрещён для executor"

# git push (прямой, не через merge-worktree.sh и не OpenAPI regeneration)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)git${GIT_OPTS}\s+push" \
  && ! echo "$COMMAND" | grep -q 'merge-worktree\.sh' \
  && ! echo "$COMMAND" | grep -qE 'swagger.*generate|generate-api|regenerate OpenAPI'; then
  BLOCKED="git push — используй merge-worktree.sh"

# gh pr create (прямой, не через merge-worktree.sh)
elif echo "$COMMAND" | grep -qE "(^|[;&|]+\s*)gh\s+pr\s+create" \
  && ! echo "$COMMAND" | grep -q 'merge-worktree\.sh'; then
  BLOCKED="gh pr create — используй merge-worktree.sh"
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
