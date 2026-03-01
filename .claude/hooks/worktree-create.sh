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

# Determine base branch from state file. Env vars don't propagate across
# Claude Code tool calls (Bash export ≠ Agent subprocess env), so the
# orchestrator writes .claude/state/worktree-base-branch before launching agents.
BASE_BRANCH_FILE="$CWD/.claude/state/worktree-base-branch"
if [ -f "$BASE_BRANCH_FILE" ]; then
  BASE_REF=$(cat "$BASE_BRANCH_FILE")
else
  BASE_REF="main"
fi

# Fetch latest from remote and fast-forward local branch to include remote changes.
# Then create worktree from LOCAL branch so local-only commits are included too.
git -C "$CWD" fetch origin "$BASE_REF" 2>/dev/null || true
git -C "$CWD" merge-base --is-ancestor "origin/$BASE_REF" "$BASE_REF" 2>/dev/null || \
  git -C "$CWD" branch -f "$BASE_REF" "origin/$BASE_REF" 2>/dev/null || true

# Guard against branch name collision from previous failed runs
if git -C "$CWD" rev-parse --verify "$NAME" &>/dev/null; then
  echo "WARN: branch '$NAME' already exists, removing stale branch" >&2
  # Remove any existing worktree using this branch first
  git -C "$CWD" worktree remove "$TARGET" --force 2>/dev/null || true
  git -C "$CWD" branch -D "$NAME" 2>/dev/null || true
fi

git -C "$CWD" worktree add "$TARGET" -b "$NAME" "$BASE_REF" >&2

# Print path to stdout — this is what Claude Code reads
echo "$TARGET"
