#!/usr/bin/env bash
# Мерж ветки из worktree в целевую ветку через PR с pre-merge verification.
# Использование: bash merge-worktree.sh <WORKTREE_PATH> <BRANCH> <BASE_BRANCH> <REPO_ROOT> <ISSUE_TITLE> [AFFECTED_APPS] [ISSUE_NUMBER] [AUTO_MERGE] [QUIET]
# AFFECTED_APPS: опционально, через запятую (например "api,web" или "apps/api,apps/web"). apps/ prefix удаляется автоматически.
# ISSUE_NUMBER: опционально, для "Closes #N" в PR body.
# AUTO_MERGE: "true" (default) — мержит PR автоматически. "false" — создаёт PR но не мержит.
# QUIET: "true" — подавить stderr (для экономии контекста executor). По умолчанию "false".
# Вывод (stdout): COMMIT_HASH=<hash> и PR_URL=<url> при успехе.
# Exit codes: 0 = success, 1 = merge failed, 2 = pre-merge verification failed, 3 = push failed, 4 = PR create failed.
set -euo pipefail

WORKTREE_PATH="$1"
BRANCH="$2"
BASE_BRANCH="$3"
REPO_ROOT="$4"
ISSUE_TITLE="${5:-}"
AFFECTED_APPS_RAW="${6:-}"
# Нормализация: убираем apps/ prefix если передан (apps/api → api)
AFFECTED_APPS=$(echo "$AFFECTED_APPS_RAW" | sed 's|apps/||g')
ISSUE_NUMBER="${7:-}"
AUTO_MERGE="${8:-true}"
QUIET="${9:-false}"

# Подавление stderr при QUIET=true
if [[ "$QUIET" == "true" ]]; then
  exec 2>/dev/null
fi

cd "$REPO_ROOT"

# Запомнить состояние до мержа
BASE_BEFORE=$(git rev-parse "$BASE_BRANCH")

# ── Шаг 1: Push ветки в remote ─────────────────────────────────────
echo "Pushing branch $BRANCH to origin..." >&2
if ! git push origin "$WORKTREE_PATH/$BRANCH:refs/heads/$BRANCH" 2>/dev/null; then
  # Fallback: push из worktree напрямую
  if ! git -C "$WORKTREE_PATH" push origin "$BRANCH" 2>&1 >&2; then
    echo "PUSH_FAILED: не удалось запушить $BRANCH" >&2
    exit 3
  fi
fi
echo "Branch $BRANCH pushed." >&2

# ── Шаг 2: Pre-merge verification (build) ──────────────────────────
# Запускаем build ПЕРЕД созданием PR, чтобы не создавать PR со сломанным кодом.
# Собираем локально на мерже в BASE_BRANCH (эмуляция).
# Сначала мержим локально для проверки
git checkout "$BASE_BRANCH"
if ! git merge --no-ff "$BRANCH" -m "Merge $BRANCH: $ISSUE_TITLE" 2>&1 >&2; then
  echo "MERGE_CONFLICT" >&2
  git merge --abort 2>/dev/null || true
  exit 1
fi

if [[ -n "$AFFECTED_APPS" ]]; then
  # Обновить зависимости после мержа (solver мог добавить новые пакеты/workspace)
  echo "Pre-merge verification: installing dependencies..." >&2
  pnpm install --frozen-lockfile >&2 2>&1 || pnpm install >&2 2>&1 || true
  echo "Pre-merge verification: building affected apps..." >&2
  IFS=',' read -ra APPS <<< "$AFFECTED_APPS"
  for APP in "${APPS[@]}"; do
    APP=$(echo "$APP" | xargs)
    echo "Building @qurvo/$APP..." >&2
    if ! pnpm turbo build --filter="@qurvo/$APP" >&2 2>&1; then
      echo "PRE_MERGE_BUILD_FAILED: @qurvo/$APP" >&2
      # Откатить локальный merge
      git reset --hard "$BASE_BEFORE" >&2
      exit 2
    fi
  done
  echo "Pre-merge verification: OK" >&2
fi

# Откатить локальный merge — PR сделает merge через GitHub
git reset --hard "$BASE_BEFORE" >&2

# ── Шаг 3: Создать PR ──────────────────────────────────────────────
PR_BODY="## Summary

Merge \`$BRANCH\`: $ISSUE_TITLE"

if [[ -n "$ISSUE_NUMBER" ]]; then
  PR_BODY="$PR_BODY

Closes #$ISSUE_NUMBER"
fi

PR_BODY="$PR_BODY

---
Pre-merge build: verified locally before PR creation."

echo "Creating PR: $BRANCH → $BASE_BRANCH..." >&2
PR_URL=$(gh pr create \
  --base "$BASE_BRANCH" \
  --head "$BRANCH" \
  --title "Merge $BRANCH: $ISSUE_TITLE" \
  --body "$PR_BODY" 2>&1) || {
  echo "PR_CREATE_FAILED: не удалось создать PR" >&2
  exit 4
}
echo "PR created: $PR_URL" >&2

# ── Шаг 4: Auto-merge PR (если AUTO_MERGE=true) ─────────────────────
if [[ "$AUTO_MERGE" == "true" ]]; then
  echo "Merging PR..." >&2
  gh pr merge "$PR_URL" --merge --delete-branch 2>&1 >&2 || {
    echo "PR_MERGE_FAILED: не удалось смержить PR $PR_URL" >&2
    exit 1
  }
  echo "PR merged." >&2

  # ── Шаг 5: Обновить локальный main ─────────────────────────────────
  git pull origin "$BASE_BRANCH" >&2 2>&1

  # ── Шаг 6: Очистка worktree ────────────────────────────────────────
  git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true

  # ── Вывод результата ────────────────────────────────────────────────
  COMMIT_HASH=$(git rev-parse --short "$BASE_BRANCH")
  echo "COMMIT_HASH=$COMMIT_HASH"
  echo "PR_URL=$PR_URL"
else
  echo "AUTO_MERGE=false: PR создан, мерж пропущен." >&2
  echo "COMMIT_HASH=pending"
  echo "PR_URL=$PR_URL"
fi
