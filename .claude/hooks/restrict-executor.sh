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

# Helper: check if command contains a git subcommand (handles -C, --git-dir, etc.)
has_git_cmd() { echo "$COMMAND" | grep -qE "(^|[;&|[:space:]])git[[:space:]]+(.*[[:space:]])?$1"; }

# Destructive git commands — blocked unconditionally
if has_git_cmd '(checkout|switch)[[:space:]]'; then
  BLOCKED="git checkout/switch"
elif has_git_cmd 'cherry-pick'; then
  BLOCKED="git cherry-pick"
elif has_git_cmd 'rebase'; then
  BLOCKED="git rebase"
elif has_git_cmd 'reset[[:space:]]+--hard'; then
  BLOCKED="git reset --hard"
elif has_git_cmd 'stash'; then
  BLOCKED="git stash"
elif has_git_cmd 'merge[[:space:]]' && ! echo "$COMMAND" | grep -q 'merge-worktree\.sh'; then
  BLOCKED="git merge — используй merge-worktree.sh"
elif has_git_cmd 'push'; then
  # Allow: merge-worktree.sh, swagger/OpenAPI regen, fix/feature/hotfix branches
  if echo "$COMMAND" | grep -qE 'merge-worktree\.sh|swagger.*generate|generate-api|regenerate OpenAPI'; then
    :
  elif echo "$COMMAND" | grep -qE 'push[[:space:]]+\S+[[:space:]]+(fix|feature|hotfix)/issue-[0-9]'; then
    :
  elif echo "$COMMAND" | grep -qE 'push[[:space:]]+\S+[[:space:]]+(main|master)\b'; then
    BLOCKED="direct push to main/master"
  fi
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
