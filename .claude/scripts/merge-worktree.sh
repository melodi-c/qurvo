#!/usr/bin/env bash
# Мерж ветки из worktree в целевую ветку с pre-merge verification.
# Использование: bash merge-worktree.sh <WORKTREE_PATH> <BRANCH> <BASE_BRANCH> <REPO_ROOT> <ISSUE_TITLE> [AFFECTED_APPS]
# AFFECTED_APPS: опционально, через запятую (например "api,web"). Если указан — запускает build перед push.
# Вывод (stdout): COMMIT_HASH=<hash> при успехе.
# Exit codes: 0 = success, 1 = merge failed, 2 = pre-merge verification failed.
set -euo pipefail

WORKTREE_PATH="$1"
BRANCH="$2"
BASE_BRANCH="$3"
REPO_ROOT="$4"
ISSUE_TITLE="${5:-}"
AFFECTED_APPS="${6:-}"

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

# ── Pre-merge verification (build) ────────────────────────────────
# Запускаем build ПЕРЕД push, чтобы не пушить сломанный код в main.
# Полные integration tests — слишком долго для pre-merge, они запускаются в post-merge (verify-post-merge.sh).
if [[ -n "$AFFECTED_APPS" ]]; then
  echo "Pre-merge verification: building affected apps..." >&2
  IFS=',' read -ra APPS <<< "$AFFECTED_APPS"
  for APP in "${APPS[@]}"; do
    APP=$(echo "$APP" | xargs)
    echo "Building @qurvo/$APP..." >&2
    if ! pnpm turbo build --filter="@qurvo/$APP" >&2 2>&1; then
      echo "PRE_MERGE_BUILD_FAILED: @qurvo/$APP" >&2
      # Откатить merge
      git reset --hard "$BASE_BEFORE" >&2
      exit 2
    fi
  done
  echo "Pre-merge verification: OK" >&2
fi

# Пуш
git push origin "$BASE_BRANCH"

# Очистка worktree и ветки
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
git branch -D "$BRANCH" 2>/dev/null || true

# Вывод результата
COMMIT_HASH=$(git rev-parse --short "$BASE_BRANCH")
echo "COMMIT_HASH=$COMMIT_HASH"
