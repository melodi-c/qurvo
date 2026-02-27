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

# Create git worktree at custom location; redirect all output to stderr
git -C "$CWD" worktree add "$TARGET" -b "$NAME" HEAD >&2

# Print path to stdout — this is what Claude Code reads
echo "$TARGET"
