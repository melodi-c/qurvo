#!/usr/bin/env bash
# Атомарные обновления execution-state.json через jq.
# Использование: bash state-manager.sh <command> [args...]
# macOS-совместимый (без grep -P, без GNU-специфичных флагов).
set -euo pipefail

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/state"
STATE_FILE="$STATE_DIR/execution-state.json"
mkdir -p "$STATE_DIR"

CMD="${1:?Usage: state-manager.sh <command> [args...]}"
shift

case "$CMD" in
  init)
    TS="${1:?timestamp}"
    printf '{"schema_version":3,"started_at":"%s","phase":"PREFLIGHT","issues":{},"parallel_groups":[],"current_group_index":0,"parent_issues":{},"merge_results":{},"post_merge_verification":null}\n' "$TS" > "$STATE_FILE"
    echo "OK" ;;

  phase)
    jq --arg p "$1" '.phase=$p' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  issue-add)
    NUM="$1"; TITLE="$2"; GROUP="$3"; BRANCH="${4:-fix/issue-$NUM}"
    jq --arg n "$NUM" --arg t "$TITLE" --argjson g "$GROUP" --arg b "$BRANCH" \
      '.issues[$n]={"title":$t,"status":"PENDING","branch":$b,"group":$g}' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  issue-status)
    NUM="$1"; STATUS="$2"; shift 2
    JQ_EXPR=".issues[\"$NUM\"].status=\"$STATUS\""
    for KV in "$@"; do
      KEY="${KV%%=*}"; VAL="${KV#*=}"
      JQ_EXPR="$JQ_EXPR | .issues[\"$NUM\"].$KEY=\"$VAL\""
    done
    jq "$JQ_EXPR" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  groups)
    jq --argjson g "$1" '.parallel_groups=$g' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  group-index)
    jq --argjson i "$1" '.current_group_index=$i' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  prune-merged)
    jq '{schema_version,started_at,phase,parallel_groups,current_group_index,parent_issues,merge_results,post_merge_verification,issues:(.issues|with_entries(select(.value.status!="MERGED")))}' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  read-active)
    jq '{phase,current_group_index,active:[.issues|to_entries[]|select(.value.status!="MERGED")|{number:.key,status:.value.status,branch:.value.branch,group:.value.group,worktree_path:.value.worktree_path}],merged_count:([.issues|to_entries[]|select(.value.status=="MERGED")]|length)}' "$STATE_FILE" ;;

  get)
    jq "${1:-.}" "$STATE_FILE" ;;

  batch)
    COUNT=0
    for subcmd in "$@"; do
      eval "set -- $subcmd"
      bash "$0" "$@"
      COUNT=$((COUNT + 1))
    done
    echo "OK ($COUNT commands)" ;;

  *)
    echo "Unknown: $CMD" >&2; exit 1 ;;
esac
