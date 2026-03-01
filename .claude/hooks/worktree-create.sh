#!/bin/bash
# WorktreeCreate hook: creates git worktrees outside the project directory.
# Input: JSON via stdin with fields: name, cwd, session_id, hook_event_name
# Output: absolute path to created worktree (stdout only — no other output)

INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r '.name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

WORKTREES_BASE="$HOME/worktrees"
mkdir -p "$WORKTREES_BASE" >&2

TARGET="$WORKTREES_BASE/$NAME"

# Determine base branch: use WORKTREE_BASE_BRANCH env var if set (for sub-issues),
# otherwise default to main. Using main (not HEAD) prevents creating worktrees
# from a feature branch or mid-merge state if executor is running concurrently.
BASE_REF="${WORKTREE_BASE_BRANCH:-main}"

# Ensure the base ref exists locally (fetch if it's a remote-only branch)
if ! git -C "$CWD" rev-parse --verify "$BASE_REF" &>/dev/null; then
  git -C "$CWD" fetch origin "$BASE_REF" >&2 2>/dev/null || true
  # Try origin/<ref> if local ref still doesn't exist
  if ! git -C "$CWD" rev-parse --verify "$BASE_REF" &>/dev/null; then
    BASE_REF="origin/$BASE_REF"
  fi
fi

git -C "$CWD" worktree add "$TARGET" -b "$NAME" "$BASE_REF" >&2

# Print path to stdout — this is what Claude Code reads
echo "$TARGET"
