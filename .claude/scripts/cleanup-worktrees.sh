#!/usr/bin/env bash
# Очистка worktrees и веток после завершения executor.
# Использование: bash cleanup-worktrees.sh [REPO_ROOT]
#
# 1. Читает execution-state.json — удаляет worktrees/ветки для НЕ-активных issues
# 2. Сканирует ~/worktrees/ — удаляет орфанные worktrees (без записи в git)
# 3. Удаляет remote-ветки fix/issue-* и feature/issue-* если они не защищены
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

# Собираем защищённые ветки ПЕРЕД удалением state (если state ещё существует).
# Ветки с PR_CREATED, REVIEW_PASSED, SOLVING — активны, не трогаем.
SAFE_BRANCHES=""
if [[ -f "$STATE_FILE" ]]; then
  SAFE_BRANCHES=$(jq -r '.issues | to_entries[] | select(.value.status != "MERGED" and .value.status != "FAILED") | .value.branch // empty' "$STATE_FILE" 2>/dev/null || true)
fi

# ── 1. Очистка по state file ─────────────────────────────────────────
if [[ -f "$STATE_FILE" ]]; then
  # Извлекаем worktree_path и branch для issues которые можно чистить
  # (MERGED — worktree уже должен быть удалён, но на всякий случай;
  #  FAILED — worktree больше не нужен)
  ENTRIES=$(jq -r '.issues | to_entries[] | select(.value.status == "MERGED" or .value.status == "FAILED") | [.value.worktree_path // "", .value.branch // ""] | @tsv' "$STATE_FILE" 2>/dev/null || true)

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

      # Удалить remote ветку (проверяем exact match, не regex)
      if git -C "$REPO_ROOT" ls-remote --heads origin "$BRANCH" 2>/dev/null | grep -qF "refs/heads/$BRANCH"; then
        git -C "$REPO_ROOT" push origin --delete "$BRANCH" 2>/dev/null || true
        CLEANED_REMOTE=$((CLEANED_REMOTE + 1))
        echo "Deleted remote branch: $BRANCH" >&2
      fi
    fi
  done <<< "$ENTRIES"
fi

# ── 2. Орфанные worktrees в ~/worktrees/ и .claude/worktrees/ ─────────
# Фильтруем только agent-*, fix-*, feature-* директории (созданные executor'ом)
WORKTREES_CLAUDE="$REPO_ROOT/.claude/worktrees"
for WORKTREES_DIR in "$WORKTREES_BASE" "$WORKTREES_CLAUDE"; do
  if [[ -d "$WORKTREES_DIR" ]]; then
    for DIR in "$WORKTREES_DIR"/*/; do
      [[ -d "$DIR" ]] || continue
      DIR_NAME=$(basename "$DIR")
      # Только executor-created worktrees
      case "$DIR_NAME" in
        agent-*|fix-*|feature-*) ;;
        *) continue ;;
      esac
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
done

# ── 3. Оставшиеся локальные ветки fix/issue-* и feature/issue-* ──────
# Пропускаем ветки, защищённые state (PR_CREATED, SOLVING и т.д.)
while IFS= read -r BRANCH; do
  [[ -n "$BRANCH" ]] || continue
  BRANCH=$(echo "$BRANCH" | xargs)  # trim whitespace

  # Пропускаем ветки, активные в state
  if [[ -n "$SAFE_BRANCHES" ]] && echo "$SAFE_BRANCHES" | grep -qxF "$BRANCH" 2>/dev/null; then
    echo "Skipping active local branch: $BRANCH" >&2
    continue
  fi

  git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true
  CLEANED_LOCAL=$((CLEANED_LOCAL + 1))
  echo "Deleted local branch: $BRANCH" >&2
done < <(git -C "$REPO_ROOT" branch --list 'fix/issue-*' 'feature/issue-*' 2>/dev/null)

# ── 4. Оставшиеся remote ветки fix/issue-* и feature/issue-* ────────
# Detect default branch dynamically (не хардкодим main)
DEFAULT_BRANCH=$(git -C "$REPO_ROOT" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||' || echo "main")
DEFAULT_SHA=$(git -C "$REPO_ROOT" rev-parse "$DEFAULT_BRANCH" 2>/dev/null || true)

if [[ -n "$DEFAULT_SHA" ]]; then
  while IFS= read -r REMOTE_BRANCH; do
    [[ -n "$REMOTE_BRANCH" ]] || continue
    REMOTE_BRANCH=$(echo "$REMOTE_BRANCH" | xargs)  # trim
    SHORT="${REMOTE_BRANCH#origin/}"
    SHORT="${SHORT#remotes/origin/}"  # fallback for different git formats

    # Пропускаем если ветка защищена state
    if [[ -n "$SAFE_BRANCHES" ]] && echo "$SAFE_BRANCHES" | grep -qxF "$SHORT" 2>/dev/null; then
      echo "Skipping active branch: $SHORT" >&2
      continue
    fi

    git -C "$REPO_ROOT" push origin --delete "$SHORT" 2>/dev/null || true
    CLEANED_REMOTE=$((CLEANED_REMOTE + 1))
    echo "Deleted remote branch: $SHORT" >&2
  done < <(git -C "$REPO_ROOT" branch -r --list 'origin/fix/issue-*' 'origin/feature/issue-*' 2>/dev/null)
fi

# ── 5. Prune stale worktree refs + remote tracking ───────────────────
git -C "$REPO_ROOT" worktree prune 2>/dev/null || true
git -C "$REPO_ROOT" remote prune origin 2>/dev/null || true

# ── Отчёт ─────────────────────────────────────────────────────────────
echo "CLEANED: worktrees=$CLEANED_WT local_branches=$CLEANED_LOCAL remote_branches=$CLEANED_REMOTE"
