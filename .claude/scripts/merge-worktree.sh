#!/usr/bin/env bash
# Мерж ветки из worktree в целевую ветку через PR с pre-merge verification.
# Использование: bash merge-worktree.sh <WORKTREE_PATH> <BRANCH> <BASE_BRANCH> <REPO_ROOT> <ISSUE_TITLE> [AFFECTED_APPS] [ISSUE_NUMBER] [AUTO_MERGE] [QUIET]
# AFFECTED_APPS: опционально, через запятую (например "api,web" или "apps/api,apps/web"). apps/ prefix удаляется автоматически.
# ISSUE_NUMBER: опционально, для "Closes #N" в PR body.
# AUTO_MERGE: "true" (default) — мержит PR автоматически. "false" — создаёт PR но не мержит.
# QUIET: "true" — подавить stderr (для экономии контекста executor). По умолчанию "false".
# Вывод (stdout): COMMIT_HASH=<hash> и PR_URL=<url> при успехе.
# Exit codes: 0 = success, 1 = merge conflict, 2 = pre-merge verification failed, 3 = push failed, 4 = PR create failed, 5 = PR merge failed.
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

# ── Шаг 1: Push ветки в remote ─────────────────────────────────────
echo "Pushing branch $BRANCH to origin..." >&2
if ! git -C "$WORKTREE_PATH" push origin "$BRANCH" >&2 2>&1; then
  echo "PUSH_FAILED: не удалось запушить $BRANCH" >&2
  exit 3
fi
echo "Branch $BRANCH pushed." >&2

# ── Шаг 2: Pre-merge verification (build) ──────────────────────────
# Проверяем в worktree: fetch base branch и мержим туда для проверки build.
# Это безопаснее чем merge в main repo — при конфликте worktree остаётся
# в конфликтном состоянии, и conflict-resolver может работать с ним напрямую.
# Также устраняет race condition при параллельных мержах.
cd "$WORKTREE_PATH"
BRANCH_BEFORE=$(git rev-parse HEAD)

git fetch origin "$BASE_BRANCH" >&2 2>&1
if ! git merge --no-ff "origin/$BASE_BRANCH" -m "Pre-merge check: $BRANCH + $BASE_BRANCH" >&2 2>&1; then
  echo "MERGE_CONFLICT" >&2
  echo "CONFLICT_DIR=$WORKTREE_PATH"
  # НЕ делаем merge --abort — conflict-resolver будет работать в этом worktree
  exit 1
fi

pre_merge_build() {
  if [[ -z "$AFFECTED_APPS" ]]; then return 0; fi
  echo "Pre-merge verification: installing dependencies..." >&2
  pnpm install --frozen-lockfile >&2 2>&1 || pnpm install >&2 2>&1 || true
  echo "Pre-merge verification: building affected apps..." >&2
  IFS=',' read -ra APPS <<< "$AFFECTED_APPS"
  for APP in "${APPS[@]}"; do
    APP=$(echo "$APP" | xargs)
    echo "Building @qurvo/$APP..." >&2
    if ! pnpm turbo build --filter="@qurvo/$APP" >&2 2>&1; then
      echo "PRE_MERGE_BUILD_FAILED: @qurvo/$APP" >&2
      return 1
    fi
  done
  echo "Pre-merge verification: OK" >&2
  return 0
}

if ! pre_merge_build; then
  # Build failed — возможно base branch обновился другим мержем.
  # Retry: fetch свежий base, повторить merge + build.
  echo "Retrying: fetching fresh $BASE_BRANCH and re-merging..." >&2
  git reset --hard "$BRANCH_BEFORE" >&2
  git fetch origin "$BASE_BRANCH" >&2 2>&1

  if ! git merge --no-ff "origin/$BASE_BRANCH" -m "Pre-merge check retry: $BRANCH + $BASE_BRANCH" >&2 2>&1; then
    echo "MERGE_CONFLICT on retry" >&2
    echo "CONFLICT_DIR=$WORKTREE_PATH"
    exit 1
  fi

  if ! pre_merge_build; then
    echo "PRE_MERGE_BUILD_FAILED after retry" >&2
    git reset --hard "$BRANCH_BEFORE" >&2
    exit 2
  fi
fi

# Откатить локальный pre-merge check — PR сделает merge через GitHub
git reset --hard "$BRANCH_BEFORE" >&2

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
  gh pr merge "$PR_URL" --merge --delete-branch >&2 2>&1 || {
    echo "PR_MERGE_FAILED: не удалось смержить PR $PR_URL" >&2
    exit 5
  }
  echo "PR merged." >&2

  # ── Шаг 5: Обновить локальный main ─────────────────────────────────
  cd "$REPO_ROOT"
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
