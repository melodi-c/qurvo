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

# Portable lock: mkdir is atomic on POSIX (macOS не имеет flock)
LOCK_DIR="${STATE_FILE}.lock.d"
_lock_acquired=false
for _i in $(seq 1 10); do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    _lock_acquired=true
    trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
    break
  fi
  sleep 0.5
done
if ! $_lock_acquired; then
  echo "ERROR: cannot acquire state lock" >&2; exit 1
fi

case "$CMD" in
  init)
    TS="${1:?timestamp}"
    printf '{"schema_version":3,"started_at":"%s","phase":"PREFLIGHT","issues":{},"parallel_groups":[],"current_group_index":0,"post_merge_verification":null}\n' "$TS" > "$STATE_FILE"
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
    NUM="${1:?}"; STATUS="${2:?}"; shift 2
    JQ_EXPR='(.issues[$n].status=$s)'
    JQ_ARGS=(--arg n "$NUM" --arg s "$STATUS")
    for KV in "$@"; do
      KEY="${KV%%=*}"; VAL="${KV#*=}"
      # Sanitize key: only allow alphanumeric and underscores
      if [[ ! "$KEY" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        echo "ERROR: invalid key name: $KEY" >&2; exit 1
      fi
      JQ_EXPR="$JQ_EXPR | (.issues[\$n].${KEY}=\$v_${KEY})"
      JQ_ARGS+=(--arg "v_${KEY}" "$VAL")
    done
    jq "${JQ_ARGS[@]}" "$JQ_EXPR" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  groups)
    jq --argjson g "$1" '.parallel_groups=$g' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  group-index)
    jq --argjson i "$1" '.current_group_index=$i' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  prune-merged)
    jq 'del(.issues[] | select(.status == "MERGED"))' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  read-active)
    jq '{phase,current_group_index,active:[.issues|to_entries[]|select(.value.status!="MERGED")|{number:.key,status:.value.status,branch:.value.branch,group:.value.group,worktree_path:.value.worktree_path,base_branch:.value.base_branch}],merged_count:([.issues|to_entries[]|select(.value.status=="MERGED")]|length)}' "$STATE_FILE" ;;

  get)
    jq "${1:-.}" "$STATE_FILE" ;;

  batch)
    # Each subcmd is a space-separated string like "phase EXECUTING_GROUP".
    # NOTE: values with spaces (e.g. issue titles) must NOT go through batch —
    # use direct calls (issue-add, issue-status) for those.
    COUNT=0
    for subcmd in "$@"; do
      read -ra ARGS <<< "$subcmd"
      bash "$0" "${ARGS[@]}"
      COUNT=$((COUNT + 1))
    done
    echo "OK ($COUNT commands)" ;;

  *)
    echo "Unknown: $CMD" >&2; exit 1 ;;
esac
