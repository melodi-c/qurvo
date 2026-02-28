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

BLOCKED=""

# git checkout / switch (меняет HEAD — ломает worktree creation)
if echo "$COMMAND" | grep -qE '(^|[;&|]+\s*)git\s+(checkout|switch)\s'; then
  BLOCKED="git checkout/switch — меняет HEAD, ломает создание worktree"

# git cherry-pick (вносит коммиты вне контролируемого flow)
elif echo "$COMMAND" | grep -qE '(^|[;&|]+\s*)git\s+cherry-pick'; then
  BLOCKED="git cherry-pick — запрещён, используй solver для изменений"

# git rebase (переписывает историю)
elif echo "$COMMAND" | grep -qE '(^|[;&|]+\s*)git\s+rebase'; then
  BLOCKED="git rebase — запрещён для executor"

# git merge (прямой, не через merge-worktree.sh)
elif echo "$COMMAND" | grep -qE '(^|[;&|]+\s*)git\s+merge\s' \
  && ! echo "$COMMAND" | grep -q 'merge-worktree\.sh'; then
  BLOCKED="git merge — используй merge-worktree.sh"

# git reset --hard (теряет изменения)
elif echo "$COMMAND" | grep -qE '(^|[;&|]+\s*)git\s+reset\s+--hard'; then
  BLOCKED="git reset --hard — запрещён для executor"

# git stash (скрывает состояние)
elif echo "$COMMAND" | grep -qE '(^|[;&|]+\s*)git\s+stash'; then
  BLOCKED="git stash — запрещён для executor"
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
