#!/usr/bin/env bash
# Хук для Edit и Write tools — блокирует запись за пределами worktree.
# macOS-совместимый. Используется issue-solver для предотвращения записи в main repo.
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
if [ -z "$FILE_PATH" ]; then exit 0; fi

# Определяем worktree и repo root
WORKTREE=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
REPO_ROOT=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}' || echo "")

# Если не в worktree (или worktree == repo root) — пропускаем
if [ -z "$WORKTREE" ] || [ "$WORKTREE" = "$REPO_ROOT" ]; then exit 0; fi

# Разрешаем запись в .claude/results/ основного repo и /tmp
case "$FILE_PATH" in
  "$REPO_ROOT/.claude/results/"*) exit 0 ;;
  /tmp/claude-results/*) exit 0 ;;
esac

# Блокируем запись за пределами worktree
case "$FILE_PATH" in
  "$WORKTREE/"*) exit 0 ;;
  *)
    echo "[restrict-solver-writes] BLOCKED: запись в $FILE_PATH за пределами worktree $WORKTREE" >&2
    exit 2
    ;;
esac
