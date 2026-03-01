#!/bin/bash
# WorktreeRemove hook: removes git worktree created by worktree-create.sh.
# Input: JSON via stdin with fields: worktree_path, cwd, session_id, hook_event_name

INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Derive the repo root (CWD may be inside the worktree itself)
REPO_ROOT=$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")

# Detect the ACTUAL branch in worktree BEFORE removing it.
# Solver renames branch from agent-N to fix/issue-N, so basename won't match.
ACTUAL_BRANCH=""
if [[ -d "$WORKTREE_PATH" ]]; then
  ACTUAL_BRANCH=$(git -C "$WORKTREE_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
fi
# Fallback: original worktree name (agent-N)
ORIGINAL_NAME=$(basename "$WORKTREE_PATH")

git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH" --force >/dev/null 2>&1 || true
git -C "$REPO_ROOT" worktree prune >/dev/null 2>&1 || true

# Clean up the actual branch (fix/issue-N or feature/issue-N)
if [[ -n "$ACTUAL_BRANCH" && "$ACTUAL_BRANCH" != "HEAD" ]]; then
  git -C "$REPO_ROOT" branch -D "$ACTUAL_BRANCH" 2>/dev/null || true
fi

# Also clean up the original branch name if different (agent-N)
if [[ "$ORIGINAL_NAME" != "$ACTUAL_BRANCH" ]]; then
  BRANCH_NAME=$(git -C "$REPO_ROOT" branch --list "$ORIGINAL_NAME" 2>/dev/null | tr -d ' *')
  if [[ -n "$BRANCH_NAME" ]]; then
    git -C "$REPO_ROOT" branch -D "$BRANCH_NAME" 2>/dev/null || true
  fi
fi
