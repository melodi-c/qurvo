#!/usr/bin/env bash
# Очистка worktrees и веток после завершения executor.
# Использование: bash cleanup-worktrees.sh [REPO_ROOT]
#
# 1. Читает execution-state.json — удаляет worktrees/ветки для всех НЕ-MERGED issues
# 2. Сканирует ~/worktrees/ — удаляет орфанные worktrees (без записи в git)
# 3. Удаляет remote-ветки fix/issue-* и feature/issue-* если они не смержены
# 4. Прунит git worktree references
#
# Безопасно вызывать повторно — идемпотентный.
set -euo pipefail

REPO_ROOT="${1:-${CLAUDE_PROJECT_DIR:-.}}"
STATE_FILE="$REPO_ROOT/.claude/state/execution-state.json"
WORKTREES_BASE="$HOME/worktrees"

CLEANED_WT=0
CLEANED_LOCAL=0
CLEANED_REMOTE=0

# ── 1. Очистка по state file ─────────────────────────────────────────
if [[ -f "$STATE_FILE" ]]; then
  # Извлекаем worktree_path и branch для всех issues (включая MERGED —
  # merge-worktree.sh мог не вычистить при ошибке)
  ENTRIES=$(jq -r '.issues | to_entries[] | [.value.worktree_path // "", .value.branch // ""] | @tsv' "$STATE_FILE" 2>/dev/null || true)

  while IFS=$'\t' read -r WT_PATH BRANCH; do
    # Удалить worktree если путь существует
    if [[ -n "$WT_PATH" && -d "$WT_PATH" ]]; then
      git -C "$REPO_ROOT" worktree remove "$WT_PATH" --force 2>/dev/null || rm -rf "$WT_PATH" 2>/dev/null || true
      CLEANED_WT=$((CLEANED_WT + 1))
      echo "Removed worktree: $WT_PATH" >&2
    fi

    # Удалить локальную ветку
    if [[ -n "$BRANCH" ]]; then
      if git -C "$REPO_ROOT" rev-parse --verify "$BRANCH" &>/dev/null; then
        git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true
        CLEANED_LOCAL=$((CLEANED_LOCAL + 1))
        echo "Deleted local branch: $BRANCH" >&2
      fi

      # Удалить remote ветку (если существует)
      if git -C "$REPO_ROOT" ls-remote --heads origin "$BRANCH" 2>/dev/null | grep -q "$BRANCH"; then
        git -C "$REPO_ROOT" push origin --delete "$BRANCH" 2>/dev/null || true
        CLEANED_REMOTE=$((CLEANED_REMOTE + 1))
        echo "Deleted remote branch: $BRANCH" >&2
      fi
    fi
  done <<< "$ENTRIES"
fi

# ── 2. Орфанные worktrees в ~/worktrees/ ─────────────────────────────
if [[ -d "$WORKTREES_BASE" ]]; then
  for DIR in "$WORKTREES_BASE"/*/; do
    [[ -d "$DIR" ]] || continue
    DIR_NAME=$(basename "$DIR")
    # Проверяем что это git worktree (содержит .git файл)
    if [[ -e "$DIR/.git" ]]; then
      git -C "$REPO_ROOT" worktree remove "$DIR" --force 2>/dev/null || rm -rf "$DIR" 2>/dev/null || true
      CLEANED_WT=$((CLEANED_WT + 1))
      echo "Removed orphan worktree: $DIR" >&2

      # Удалить ветку с тем же именем (worktree-create.sh создаёт branch = name)
      if git -C "$REPO_ROOT" rev-parse --verify "$DIR_NAME" &>/dev/null; then
        git -C "$REPO_ROOT" branch -D "$DIR_NAME" 2>/dev/null || true
        CLEANED_LOCAL=$((CLEANED_LOCAL + 1))
      fi
    fi
  done
fi

# ── 3. Оставшиеся локальные ветки fix/issue-* и feature/issue-* ──────
# State мог быть удалён раньше — чистим по паттерну имени.
while IFS= read -r BRANCH; do
  [[ -n "$BRANCH" ]] || continue
  BRANCH=$(echo "$BRANCH" | xargs)  # trim whitespace
  git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true
  CLEANED_LOCAL=$((CLEANED_LOCAL + 1))
  echo "Deleted local branch: $BRANCH" >&2
done < <(git -C "$REPO_ROOT" branch --list 'fix/issue-*' 'feature/issue-*' 2>/dev/null)

# ── 4. Оставшиеся remote ветки fix/issue-* и feature/issue-* ────────
# Проверяем что ветка не смержена в main перед удалением.
MAIN_SHA=$(git -C "$REPO_ROOT" rev-parse main 2>/dev/null || true)
if [[ -n "$MAIN_SHA" ]]; then
  while IFS= read -r REMOTE_BRANCH; do
    [[ -n "$REMOTE_BRANCH" ]] || continue
    REMOTE_BRANCH=$(echo "$REMOTE_BRANCH" | xargs)  # trim
    SHORT="${REMOTE_BRANCH#origin/}"
    SHORT="${SHORT#remotes/origin/}"  # fallback for different git formats
    # Пропускаем если ветка полностью смержена в main
    if git -C "$REPO_ROOT" branch -r --merged main 2>/dev/null | grep -qF "$REMOTE_BRANCH"; then
      git -C "$REPO_ROOT" push origin --delete "$SHORT" 2>/dev/null || true
      CLEANED_REMOTE=$((CLEANED_REMOTE + 1))
      echo "Deleted merged remote branch: $SHORT" >&2
    else
      # Не смержена — тоже удаляем (executor завершён, ветка больше не нужна)
      git -C "$REPO_ROOT" push origin --delete "$SHORT" 2>/dev/null || true
      CLEANED_REMOTE=$((CLEANED_REMOTE + 1))
      echo "Deleted unmerged remote branch: $SHORT" >&2
    fi
  done < <(git -C "$REPO_ROOT" branch -r --list 'origin/fix/issue-*' 'origin/feature/issue-*' 2>/dev/null)
fi

# ── 5. Prune stale worktree refs + remote tracking ───────────────────
git -C "$REPO_ROOT" worktree prune 2>/dev/null || true
git -C "$REPO_ROOT" remote prune origin 2>/dev/null || true

# ── Отчёт ─────────────────────────────────────────────────────────────
echo "CLEANED: worktrees=$CLEANED_WT local_branches=$CLEANED_LOCAL remote_branches=$CLEANED_REMOTE"
