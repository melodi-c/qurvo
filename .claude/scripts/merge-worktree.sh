#!/usr/bin/env bash
# Мерж ветки из worktree в целевую ветку.
# Использование: bash merge-worktree.sh <WORKTREE_PATH> <BRANCH> <BASE_BRANCH> <REPO_ROOT> <ISSUE_TITLE>
# Вывод (stdout): COMMIT_HASH=<hash> при успехе.
# Exit codes: 0 = success, 1 = merge failed.
set -euo pipefail

WORKTREE_PATH="$1"
BRANCH="$2"
BASE_BRANCH="$3"
REPO_ROOT="$4"
ISSUE_TITLE="${5:-}"

cd "$REPO_ROOT"

# Запомнить состояние до мержа
BASE_BEFORE=$(git rev-parse "$BASE_BRANCH")

# Попытка 1: fast-forward через fetch из worktree
if git fetch "$WORKTREE_PATH" "$BRANCH:$BASE_BRANCH" 2>/dev/null; then
  echo "Fast-forward merge successful." >&2
else
  # Попытка 2: merge --no-ff (если BASE_BRANCH продвинулся)
  echo "Fast-forward невозможен, делаю merge --no-ff" >&2
  git checkout "$BASE_BRANCH"
  if ! git merge --no-ff "$BRANCH" -m "Merge $BRANCH: $ISSUE_TITLE"; then
    echo "MERGE_CONFLICT" >&2
    git merge --abort 2>/dev/null || true
    exit 1
  fi
fi

# Проверить что BASE_BRANCH продвинулся
BASE_AFTER=$(git rev-parse "$BASE_BRANCH")
if [[ "$BASE_BEFORE" == "$BASE_AFTER" ]]; then
  echo "WARNING: merge не продвинул $BASE_BRANCH (возможно ветка уже была смержена)" >&2
  exit 1
fi

# Пуш
git push origin "$BASE_BRANCH"

# Очистка worktree и ветки
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
git branch -D "$BRANCH" 2>/dev/null || true

# Вывод результата
COMMIT_HASH=$(git rev-parse --short "$BASE_BRANCH")
echo "COMMIT_HASH=$COMMIT_HASH"
