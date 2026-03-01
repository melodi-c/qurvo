#!/bin/bash
# WorktreeRemove hook: removes git worktree created by worktree-create.sh.
# Input: JSON via stdin with fields: worktree_path, cwd, session_id, hook_event_name

INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Derive the repo root (CWD may be inside the worktree itself)
REPO_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")

# Detect the branch name before removing the worktree
NAME=$(basename "$WORKTREE_PATH")

git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH" --force >/dev/null 2>&1 || true
git -C "$REPO_ROOT" worktree prune >/dev/null 2>&1 || true

# Clean up the associated branch
BRANCH_NAME=$(git -C "$REPO_ROOT" branch --list "$NAME" 2>/dev/null | tr -d ' *')
if [[ -n "$BRANCH_NAME" ]]; then
  git -C "$REPO_ROOT" branch -D "$BRANCH_NAME" 2>/dev/null || true
fi
