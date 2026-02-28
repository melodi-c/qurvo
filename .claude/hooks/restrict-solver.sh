#!/usr/bin/env bash
# PreToolUse hook для issue-solver агентов.
# Блокирует:
#   1) Деструктивные git-операции с -C (направленные в REPO_ROOT)
#   2) Bare git push/commit/merge (без -C, из текущей директории)
#   3) npm/pnpm publish (SDK публикация — ручное действие)
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

# --- 1. Деструктивные git-операции с -C (направленные в REPO_ROOT) ---
DANGEROUS_C_PATTERN='git[[:space:]]+-C[[:space:]]+[^[:space:]].*[[:space:]]+(checkout|switch|commit|merge|push|reset|rebase|clean)[[:space:]]'
DANGEROUS_BRANCH_PATTERN='git[[:space:]]+-C[[:space:]]+[^[:space:]].*[[:space:]]+branch[[:space:]]+-[Dd][[:space:]]'
DANGEROUS_WORKTREE_PATTERN='git[[:space:]]+-C[[:space:]]+[^[:space:]].*[[:space:]]+worktree[[:space:]]+(add|remove|prune)'

# --- 2. Bare git checkout/switch/reset --hard (без -C) ---
# Solver работает ТОЛЬКО в своём worktree. Если worktree исчез — solver должен упасть,
# а НЕ переключаться на main repo через checkout.
BARE_CHECKOUT_PATTERN='(^|[;&|]+[[:space:]]*)git[[:space:]]+(checkout|switch)[[:space:]]'
BARE_RESET_HARD_PATTERN='(^|[;&|]+[[:space:]]*)git[[:space:]]+reset[[:space:]]+--hard'

# --- 3. Bare git push (без -C, из worktree в origin) ---
# Solver НЕ должен пушить — мерж и пуш делает оркестратор.
BARE_PUSH_PATTERN='(^|[;&|]+[[:space:]]*)git[[:space:]]+push([[:space:]]|$)'

# --- 4. npm/pnpm publish (SDK публикация запрещена из solver) ---
PUBLISH_PATTERN='(npm|pnpm)[[:space:]]+publish'

BLOCKED=""

if echo "$COMMAND" | grep -qE "$DANGEROUS_C_PATTERN"; then
  BLOCKED="деструктивная git-операция с -C в REPO_ROOT"
elif echo "$COMMAND" | grep -qE "$DANGEROUS_BRANCH_PATTERN"; then
  BLOCKED="удаление ветки в REPO_ROOT"
elif echo "$COMMAND" | grep -qE "$DANGEROUS_WORKTREE_PATTERN"; then
  BLOCKED="управление worktree из solver"
elif echo "$COMMAND" | grep -qE "$BARE_CHECKOUT_PATTERN"; then
  BLOCKED="git checkout/switch запрещён — solver работает только в своём worktree"
elif echo "$COMMAND" | grep -qE "$BARE_RESET_HARD_PATTERN"; then
  BLOCKED="git reset --hard запрещён — solver не должен сбрасывать состояние"
elif echo "$COMMAND" | grep -qE "$BARE_PUSH_PATTERN"; then
  BLOCKED="git push из solver запрещён — мерж и пуш делает оркестратор"
elif echo "$COMMAND" | grep -qE "$PUBLISH_PATTERN"; then
  BLOCKED="npm/pnpm publish запрещён из solver — публикация SDK только вручную"
fi

if [ -n "$BLOCKED" ]; then
  cat >&2 <<MSG
[restrict-solver] BLOCKED: $BLOCKED.
Solver может только: читать файлы, коммитить в своём worktree, запускать тесты/билды.
Операции push/merge/publish выполняет оркестратор или пользователь вручную.
MSG
  exit 2
fi

exit 0
