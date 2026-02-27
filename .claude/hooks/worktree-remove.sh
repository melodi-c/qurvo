#!/bin/bash
# WorktreeRemove hook: removes git worktree created by worktree-create.sh.
# Input: JSON via stdin with fields: worktree_path, cwd, session_id, hook_event_name

INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path')
CWD=$(echo "$INPUT" | jq -r '.cwd')

git -C "$CWD" worktree remove "$WORKTREE_PATH" --force >&2 2>/dev/null || true
git -C "$CWD" worktree prune >&2 2>/dev/null || true
