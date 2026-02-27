#!/usr/bin/env bash
# PreToolUse hook для issue-solver агентов.
# Блокирует деструктивные git-операции выполняемые напрямую в REPO_ROOT
# (не через worktree). Операции чтения — разрешены.
#
# Получает JSON со структурой:
#   { "tool_name": "Bash", "tool_input": { "command": "..." }, "cwd": "..." }
# Блокирует через exit 2 (Claude Code интерпретирует как "deny").

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Если команда пустая или не Bash — пропустить
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Деструктивные git-субкоманды, которые не должны выполняться в REPO_ROOT из solver:
# - checkout/switch  — переключает ветку в основном репо
# - commit           — коммит в основном репо (solver должен коммитить только в worktree)
# - merge            — мерж в основном репо (это дело оркестратора)
# - push             — пуш из основного репо
# - reset            — сброс состояния в основном репо
# - rebase           — ребейс в основном репо
# - branch -D/-d     — удаление веток в основном репо
# - worktree add     — создание нового worktree (solver уже в worktree)
# - worktree remove  — удаление worktree (это дело оркестратора)
# - clean            — очистка неотслеживаемых файлов

DANGEROUS_PATTERN='git[[:space:]]+-C[[:space:]]+[^[:space:]].*[[:space:]]+(checkout|switch|commit|merge|push|reset|rebase|clean)[[:space:]]'
DANGEROUS_BRANCH_PATTERN='git[[:space:]]+-C[[:space:]]+[^[:space:]].*[[:space:]]+branch[[:space:]]+-[Dd][[:space:]]'
DANGEROUS_WORKTREE_PATTERN='git[[:space:]]+-C[[:space:]]+[^[:space:]].*[[:space:]]+worktree[[:space:]]+(add|remove|prune)'

if echo "$COMMAND" | grep -qE "$DANGEROUS_PATTERN" \
   || echo "$COMMAND" | grep -qE "$DANGEROUS_BRANCH_PATTERN" \
   || echo "$COMMAND" | grep -qE "$DANGEROUS_WORKTREE_PATTERN"; then
  cat >&2 <<'MSG'
[restrict-solver] BLOCKED: деструктивная git-операция в REPO_ROOT запрещена из issue-solver.
Solver может только: читать файлы из REPO_ROOT (ls, cat, git log, git show),
коммитить и пушить в пределах своего worktree.
Операции checkout/commit/merge/push/reset в REPO_ROOT выполняет оркестратор (issue-executor).
MSG
  exit 2
fi

exit 0
