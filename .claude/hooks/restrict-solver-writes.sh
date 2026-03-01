#!/usr/bin/env bash
# Хук для Edit и Write tools — блокирует запись за пределами worktree.
# macOS-совместимый. Используется issue-solver для предотвращения записи в main repo.
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
if [ -z "$FILE_PATH" ]; then exit 0; fi

# Normalize path to prevent traversal attacks (e.g. solver-../../secrets.txt)
# Use Python for portable realpath (macOS readlink -f requires coreutils)
FILE_PATH=$(python3 -c "import os; print(os.path.realpath('$FILE_PATH'))" 2>/dev/null || echo "$FILE_PATH")

# Определяем worktree и repo root
WORKTREE=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
REPO_ROOT=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}' || echo "")

# Если не в git-репо — пропускаем
if [ -z "$WORKTREE" ]; then exit 0; fi

# Если worktree == repo root (retry solver без isolation:worktree) —
# блокируем ВСЁ кроме .claude/results/ (solver НЕ должен писать в main repo)
if [ "$WORKTREE" = "$REPO_ROOT" ]; then
  case "$FILE_PATH" in
    "$REPO_ROOT/.claude/results/solver-"*) exit 0 ;;
    "$REPO_ROOT/.claude/results/test-analyzer-"*) exit 0 ;;
    *)
      echo "[restrict-solver-writes] BLOCKED: solver работает в main repo (не в worktree). Запись в $FILE_PATH запрещена." >&2
      exit 2
      ;;
  esac
fi

# Разрешаем запись в .claude/results/ основного repo (solver result files)
case "$FILE_PATH" in
  "$REPO_ROOT/.claude/results/solver-"*) exit 0 ;;
  "$REPO_ROOT/.claude/results/test-analyzer-"*) exit 0 ;;
esac

# Блокируем запись за пределами worktree
case "$FILE_PATH" in
  "$WORKTREE/"*) exit 0 ;;
  *)
    echo "[restrict-solver-writes] BLOCKED: запись в $FILE_PATH за пределами worktree $WORKTREE" >&2
    exit 2
    ;;
esac
