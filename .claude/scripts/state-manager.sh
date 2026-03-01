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
# Skip lock if already held by parent (batch recursive calls)
LOCK_DIR="${STATE_FILE}.lock.d"
OPS_LOG="$STATE_DIR/operations.log"
acquire_lock() {
  if [[ "${_STATE_LOCK_HELD:-}" == "1" ]]; then return 0; fi
  local _lock_acquired=false
  for _i in $(seq 1 10); do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      _lock_acquired=true
      trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
      break
    fi
    # Staleness check: если lock старше 60 секунд — force-break
    if [[ -d "$LOCK_DIR" ]]; then
      local _lock_age
      _lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo "0") ))
      if [[ "$_lock_age" -gt 60 ]]; then
        echo "WARN: stale lock detected (${_lock_age}s old), force-breaking" >&2
        rmdir "$LOCK_DIR" 2>/dev/null || rm -rf "$LOCK_DIR" 2>/dev/null || true
        continue
      fi
    fi
    sleep 0.5
  done
  if ! $_lock_acquired; then
    echo "ERROR: cannot acquire state lock" >&2; exit 1
  fi
  rm -f "$STATE_FILE.tmp" 2>/dev/null || true
  export _STATE_LOCK_HELD=1
}

# Append-only operations log for crash recovery
_log_op() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$OPS_LOG" 2>/dev/null || true
}

validate_transition() {
  local FROM="$1" TO="$2"
  case "${FROM}→${TO}" in
    PENDING→SOLVING|SOLVING→READY_FOR_REVIEW|SOLVING→NEEDS_USER_INPUT|SOLVING→FAILED|\
    READY_FOR_REVIEW→REVIEWING|REVIEWING→REVIEW_PASSED|REVIEWING→REVIEW_FAILED|\
    READY_FOR_REVIEW→REVIEW_PASSED|READY_FOR_REVIEW→REVIEW_FAILED|\
    REVIEW_PASSED→MERGING|REVIEW_FAILED→SOLVING|\
    MERGING→MERGED|MERGING→MERGE_FAILED|MERGING→PR_CREATED|\
    PR_CREATED→MERGED|PR_CREATED→MERGE_FAILED|\
    MERGE_FAILED→SOLVING|MERGE_FAILED→MERGING|NEEDS_USER_INPUT→SOLVING|\
    PENDING→FAILED|*→PENDING)
      return 0 ;;
    *)
      echo "ERROR: Invalid state transition: $FROM → $TO for issue" >&2
      return 1 ;;
  esac
}

acquire_lock

case "$CMD" in
  init)
    TS="${1:?timestamp}"
    printf '{"schema_version":3,"started_at":"%s","phase":"PREFLIGHT","issues":{},"parallel_groups":[],"current_group_index":0,"post_merge_verification":null}\n' "$TS" > "$STATE_FILE"
    # Reset operations log on init
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) init $TS" > "$OPS_LOG"
    echo "OK" ;;

  phase)
    _log_op "phase $1"
    jq --arg p "$1" '.phase=$p' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  issue-add)
    NUM="$1"; TITLE="$2"; GROUP="$3"; BRANCH="${4:-fix/issue-$NUM}"
    jq --arg n "$NUM" --arg t "$TITLE" --argjson g "$GROUP" --arg b "$BRANCH" \
      '.issues[$n]={"title":$t,"status":"PENDING","branch":$b,"group":$g}' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "OK" ;;

  solver-invocations)
    # Инкрементирует и возвращает счётчик запусков solver для issue.
    # Используется executor'ом для проверки лимита (max 4).
    NUM="${1:?}"
    CURRENT=$(jq -r ".issues[\"$NUM\"].solver_invocations // 0" "$STATE_FILE")
    NEXT=$((CURRENT + 1))
    jq --arg n "$NUM" --argjson v "$NEXT" '.issues[$n].solver_invocations=$v' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "$NEXT" ;;

  issue-status)
    NUM="${1:?}"; STATUS="${2:?}"; shift 2
    _log_op "issue-status $NUM $STATUS $*"
    # Validate state transition if STATUS looks like an uppercase status word
    if [[ "$STATUS" =~ ^[A-Z_]+$ ]]; then
      CURRENT_STATUS=$(jq -r ".issues[\"$NUM\"].status // \"PENDING\"" "$STATE_FILE")
      validate_transition "$CURRENT_STATUS" "$STATUS"
    fi
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
    acquire_lock
    export _STATE_LOCK_HELD=1
    COUNT=0
    for subcmd in "$@"; do
      # Split subcmd into words, preserving proper argument boundaries.
      # read -ra splits on whitespace, giving correct positional args.
      read -ra _PARTS <<< "$subcmd"
      if [[ ${#_PARTS[@]} -eq 0 ]]; then continue; fi
      bash "$0" "${_PARTS[@]}"
      COUNT=$((COUNT + 1))
    done
    echo "OK ($COUNT commands)" ;;

  *)
    echo "Unknown: $CMD" >&2; exit 1 ;;
esac
