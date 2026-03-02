#!/usr/bin/env bash
# Compiles quorum round result JSONs into a single transcript.md
# Usage: bash quorum-compile-transcript.sh <session_dir> [max_round]
# Output: <session_dir>/transcript.md
set -euo pipefail

SESSION_DIR="${1:?Usage: quorum-compile-transcript.sh <session_dir> [max_round]}"
MAX_ROUND="${2:-99}"

TRANSCRIPT="$SESSION_DIR/transcript.md"
ROLES=("product" "architect" "critic" "pragmatist" "devil" "dx")
ROLE_LABELS=("Product Manager" "Architect" "QA/Security Critic" "Pragmatist" "Devil's Advocate" "DX Engineer")

cat > "$TRANSCRIPT" <<EOF
# Quorum Debate Transcript

EOF

for round in $(seq 1 "$MAX_ROUND"); do
  # Check if any files exist for this round
  found=0
  for role in "${ROLES[@]}"; do
    if [[ -f "$SESSION_DIR/round-${round}-${role}.json" ]]; then
      found=1
      break
    fi
  done
  [[ "$found" -eq 0 ]] && break

  echo "## Round $round" >> "$TRANSCRIPT"
  echo "" >> "$TRANSCRIPT"

  for i in "${!ROLES[@]}"; do
    role="${ROLES[$i]}"
    label="${ROLE_LABELS[$i]}"
    file="$SESSION_DIR/round-${round}-${role}.json"

    if [[ ! -f "$file" ]]; then
      echo "### $label — (no response)" >> "$TRANSCRIPT"
      echo "" >> "$TRANSCRIPT"
      continue
    fi

    position=$(jq -r '.position // "N/A"' "$file")
    confidence=$(jq -r '.confidence // "N/A"' "$file")
    revised=$(jq -r '.revised_confidence // empty' "$file")
    summary=$(jq -r '.summary // "No summary provided"' "$file")

    echo "### $label" >> "$TRANSCRIPT"
    echo "" >> "$TRANSCRIPT"
    echo "**Position:** $position | **Confidence:** $confidence" >> "$TRANSCRIPT"
    if [[ -n "$revised" && "$revised" != "null" ]]; then
      echo " → **Revised:** $revised" >> "$TRANSCRIPT"
    fi
    echo "" >> "$TRANSCRIPT"
    echo "$summary" >> "$TRANSCRIPT"
    echo "" >> "$TRANSCRIPT"

    # Points
    points_count=$(jq -r '.points | length' "$file" 2>/dev/null || echo "0")
    if [[ "$points_count" -gt 0 ]]; then
      echo "**Points:**" >> "$TRANSCRIPT"
      for j in $(seq 0 $((points_count - 1))); do
        pid=$(jq -r ".points[$j].id" "$file")
        claim=$(jq -r ".points[$j].claim" "$file")
        evidence=$(jq -r ".points[$j].evidence // \"\"" "$file")
        strength=$(jq -r ".points[$j].strength // \"\"" "$file")
        echo "- **[$pid]** ($strength) $claim" >> "$TRANSCRIPT"
        if [[ -n "$evidence" && "$evidence" != "" ]]; then
          echo "  - _Evidence:_ $evidence" >> "$TRANSCRIPT"
        fi
      done
      echo "" >> "$TRANSCRIPT"
    fi

    # Rebuttals (round 2+)
    rebuttals_count=$(jq -r '.rebuttals | length' "$file" 2>/dev/null || echo "0")
    if [[ "$rebuttals_count" -gt 0 ]]; then
      echo "**Rebuttals:**" >> "$TRANSCRIPT"
      for j in $(seq 0 $((rebuttals_count - 1))); do
        target_role=$(jq -r ".rebuttals[$j].target_role" "$file")
        target_id=$(jq -r ".rebuttals[$j].target_point_id" "$file")
        response=$(jq -r ".rebuttals[$j].response" "$file")
        concede=$(jq -r ".rebuttals[$j].concede" "$file")
        if [[ "$concede" == "true" ]]; then
          echo "- **→ $target_role/$target_id:** CONCEDED — $response" >> "$TRANSCRIPT"
        else
          echo "- **→ $target_role/$target_id:** $response" >> "$TRANSCRIPT"
        fi
      done
      echo "" >> "$TRANSCRIPT"
    fi

    # Concessions
    concessions=$(jq -r '.concessions // [] | join(", ")' "$file" 2>/dev/null || echo "")
    if [[ -n "$concessions" ]]; then
      echo "**Concessions:** $concessions" >> "$TRANSCRIPT"
      echo "" >> "$TRANSCRIPT"
    fi

    echo "---" >> "$TRANSCRIPT"
    echo "" >> "$TRANSCRIPT"
  done
done

# Append vote results if they exist
votes_found=0
for role in "${ROLES[@]}"; do
  if [[ -f "$SESSION_DIR/votes-${role}.json" ]]; then
    votes_found=1
    break
  fi
done

if [[ "$votes_found" -eq 1 ]]; then
  echo "## Voting Results" >> "$TRANSCRIPT"
  echo "" >> "$TRANSCRIPT"

  for i in "${!ROLES[@]}"; do
    role="${ROLES[$i]}"
    label="${ROLE_LABELS[$i]}"
    file="$SESSION_DIR/votes-${role}.json"

    if [[ ! -f "$file" ]]; then
      continue
    fi

    echo "### $label Votes" >> "$TRANSCRIPT"
    echo "" >> "$TRANSCRIPT"

    votes_count=$(jq -r '.votes | length' "$file" 2>/dev/null || echo "0")
    for j in $(seq 0 $((votes_count - 1))); do
      point_id=$(jq -r ".votes[$j].point_id" "$file")
      topic=$(jq -r ".votes[$j].topic // \"\"" "$file")
      vote=$(jq -r ".votes[$j].vote" "$file")
      preferred=$(jq -r ".votes[$j].preferred_option // \"\"" "$file")
      reasoning=$(jq -r ".votes[$j].reasoning // \"\"" "$file")
      echo "- **$point_id** ($topic): **$vote**" >> "$TRANSCRIPT"
      if [[ -n "$preferred" && "$preferred" != "" ]]; then
        echo "  - Preferred: $preferred" >> "$TRANSCRIPT"
      fi
      if [[ -n "$reasoning" && "$reasoning" != "" ]]; then
        echo "  - Reasoning: $reasoning" >> "$TRANSCRIPT"
      fi
    done
    echo "" >> "$TRANSCRIPT"
  done
fi

echo "OK: transcript written to $TRANSCRIPT"
