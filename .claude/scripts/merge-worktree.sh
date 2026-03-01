#!/usr/bin/env bash
# Мерж ветки из worktree в целевую ветку через PR с pre-merge verification.
# Использование: bash merge-worktree.sh <WORKTREE_PATH> <BRANCH> <BASE_BRANCH> <REPO_ROOT> <ISSUE_TITLE> [AFFECTED_APPS] [ISSUE_NUMBER] [AUTO_MERGE] [QUIET]
# AFFECTED_APPS: опционально, через запятую (например "api,web" или "apps/api,apps/web"). apps/ prefix удаляется автоматически.
# ISSUE_NUMBER: опционально, для "Closes #N" в PR body.
# AUTO_MERGE: "true" (default) — мержит PR автоматически. "false" — создаёт PR но не мержит.
# QUIET: "true" — подавить verbose output (для экономии контекста executor). По умолчанию "false".
# Вывод (stdout): COMMIT_HASH=<hash> и PR_URL=<url> при успехе.
# Exit codes: 0 = success, 1 = merge conflict, 2 = pre-merge verification failed, 3 = push failed, 4 = PR create failed, 5 = PR merge failed.
set -euo pipefail

WORKTREE_PATH="$1"
BRANCH="$2"
BASE_BRANCH="$3"
REPO_ROOT="$4"
ISSUE_TITLE="${5:-}"
# Sanitize title to prevent accidental shell expansion in heredocs
ISSUE_TITLE="${ISSUE_TITLE//\$/\\\$}"
ISSUE_TITLE="${ISSUE_TITLE//\`/\\\`}"
AFFECTED_APPS_RAW="${6:-}"
# Нормализация: убираем apps/ prefix если передан (apps/api → api)
AFFECTED_APPS=$(echo "$AFFECTED_APPS_RAW" | sed 's|apps/||g')
ISSUE_NUMBER="${7:-}"
AUTO_MERGE="${8:-true}"
QUIET="${9:-false}"

# Логгирование: при QUIET=true подавляем verbose output, но НЕ через exec 2>/dev/null
# (это ломало бы диагностику ошибок). Вместо этого используем функцию.
_log() {
  if [[ "$QUIET" != "true" ]]; then
    echo "$@" >&2
  fi
}

# ── Шаг 1: Pre-merge verification (build) ──────────────────────────
# Проверяем в worktree: fetch base branch и мержим туда для проверки build.
# Это безопаснее чем merge в main repo — при конфликте worktree остаётся
# в конфликтном состоянии, и conflict-resolver может работать с ним напрямую.
# Также устраняет race condition при параллельных мержах.
cd "$WORKTREE_PATH"
BRANCH_BEFORE=$(git rev-parse HEAD)

_log "Fetching $BASE_BRANCH for pre-merge check..."
git fetch origin "$BASE_BRANCH" 2>/dev/null
if ! git merge --no-ff "origin/$BASE_BRANCH" -m "Pre-merge check: $BRANCH + $BASE_BRANCH" 2>/dev/null; then
  echo "MERGE_CONFLICT" >&2
  echo "CONFLICT_DIR=$WORKTREE_PATH"
  # НЕ делаем merge --abort — conflict-resolver будет работать в этом worktree
  exit 1
fi

pre_merge_build() {
  if [[ -z "$AFFECTED_APPS" ]]; then return 0; fi
  _log "Pre-merge verification: installing dependencies..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install 2>/dev/null || true
  _log "Pre-merge verification: building affected apps..."
  IFS=',' read -ra APPS <<< "$AFFECTED_APPS"
  for APP in "${APPS[@]}"; do
    APP=$(echo "$APP" | xargs)
    _log "Building @qurvo/$APP..."
    if ! pnpm turbo build --filter="@qurvo/$APP" 2>/dev/null; then
      echo "PRE_MERGE_BUILD_FAILED: @qurvo/$APP" >&2
      return 1
    fi
  done
  _log "Pre-merge verification: OK"
  return 0
}

if ! pre_merge_build; then
  # Build failed — возможно base branch обновился другим мержем.
  # Retry: fetch свежий base, повторить merge + build.
  _log "Retrying: fetching fresh $BASE_BRANCH and re-merging..."
  git reset --hard "$BRANCH_BEFORE" 2>/dev/null
  git fetch origin "$BASE_BRANCH" 2>/dev/null

  if ! git merge --no-ff "origin/$BASE_BRANCH" -m "Pre-merge check retry: $BRANCH + $BASE_BRANCH" 2>/dev/null; then
    echo "MERGE_CONFLICT on retry" >&2
    echo "CONFLICT_DIR=$WORKTREE_PATH"
    exit 1
  fi

  if ! pre_merge_build; then
    echo "PRE_MERGE_BUILD_FAILED after retry" >&2
    git reset --hard "$BRANCH_BEFORE" 2>/dev/null
    exit 2
  fi
fi

# Откатить локальный pre-merge check — PR сделает merge через GitHub
git reset --hard "$BRANCH_BEFORE" 2>/dev/null

# ── Шаг 2: Push ветки в remote (ПОСЛЕ успешного build) ────────────
_log "Pushing branch $BRANCH to origin..."
if ! git -C "$WORKTREE_PATH" push origin "$BRANCH" 2>/dev/null; then
  echo "PUSH_FAILED: не удалось запушить $BRANCH" >&2
  exit 3
fi
_log "Branch $BRANCH pushed."

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

_log "Creating PR: $BRANCH → $BASE_BRANCH..."
PR_URL=$(gh pr create \
  --base "$BASE_BRANCH" \
  --head "$BRANCH" \
  --title "Merge $BRANCH: $ISSUE_TITLE" \
  --body "$PR_BODY" 2>/dev/null) || {
  echo "PR_CREATE_FAILED: не удалось создать PR" >&2
  exit 4
}
_log "PR created: $PR_URL"

# ── Шаг 4: Auto-merge PR (если AUTO_MERGE=true) ─────────────────────
if [[ "$AUTO_MERGE" == "true" ]]; then
  _log "Merging PR..."
  gh pr merge "$PR_URL" --merge --delete-branch 2>/dev/null || {
    echo "PR_MERGE_FAILED: не удалось смержить PR $PR_URL" >&2
    exit 5
  }
  _log "PR merged."

  # ── Шаг 5: Получить точный merge commit hash из GitHub ──────────
  # Retry: GitHub API может задержать mergeCommit на несколько секунд
  COMMIT_HASH=""
  for _attempt in 1 2 3; do
    COMMIT_HASH=$(gh pr view "$PR_URL" --json mergeCommit --jq '.mergeCommit.oid[:7]' 2>/dev/null || true)
    if [[ -n "$COMMIT_HASH" ]]; then break; fi
    sleep 2
  done

  # Fallback: обновить локальный main и взять rev-parse
  if [[ -z "$COMMIT_HASH" ]]; then
    cd "$REPO_ROOT"
    git pull origin "$BASE_BRANCH" 2>/dev/null || _log "WARN: git pull failed, local $BASE_BRANCH may be stale"
    COMMIT_HASH=$(git rev-parse --short "$BASE_BRANCH" 2>/dev/null || true)
  else
    # Обновить локальный main (best-effort)
    cd "$REPO_ROOT"
    git pull origin "$BASE_BRANCH" 2>/dev/null || _log "WARN: git pull failed, local $BASE_BRANCH may be stale"
  fi

  # Финальная проверка: COMMIT_HASH не должен быть пустым
  if [[ -z "$COMMIT_HASH" ]]; then
    echo "ERROR: не удалось получить merge commit hash" >&2
    echo "COMMIT_HASH=error"
    echo "PR_URL=$PR_URL"
    exit 5
  fi

  # ── Вывод результата ПЕРЕД очисткой worktree ─────────────────────
  # Executor должен получить данные до удаления worktree.
  # Если executor упадёт после получения данных но до cleanup — worktree
  # будет удалён cleanup-worktrees.sh при следующем запуске.
  echo "COMMIT_HASH=$COMMIT_HASH"
  echo "PR_URL=$PR_URL"

  # ── Шаг 6: Очистка worktree (после вывода результата) ────────────
  git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true
else
  _log "AUTO_MERGE=false: PR создан, мерж пропущен."
  echo "COMMIT_HASH=pending"
  echo "PR_URL=$PR_URL"
fi
