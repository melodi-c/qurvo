---
name: quorum
description: "Multi-agent debate system: 6 agents debate a topic, vote, curator resolves"
---

# Quorum — Multi-Agent Debate Orchestrator

Launches 6 debater agents with different perspectives, conducts multi-round debates until convergence (max 7 rounds), runs voting on disputed points, and a curator agent synthesizes the final verdict.

## Roles

| Role | Agent | Prefix | Focus |
|------|-------|--------|-------|
| Product Manager | `quorum-product` | `prod-` | User value, UX, business |
| Architect | `quorum-architect` | `arch-` | Technical design, scalability |
| QA/Security Critic | `quorum-critic` | `crit-` | Risks, vulnerabilities, edge cases |
| Pragmatist | `quorum-pragmatist` | `prag-` | Cost, complexity, ROI |
| Devil's Advocate | `quorum-devil` | `devil-` | Contrarian, challenges consensus |
| DX Engineer | `quorum-dx` | `dx-` | API ergonomics, developer experience |

## Step 1 — Parse Topic

Extract the topic from user's arguments. If no arguments provided, ask the user for a topic.

```
TOPIC = user's argument text (everything after /quorum)
```

If TOPIC is empty, use AskUserQuestion to ask what topic to debate.

## Step 2 — Create Session Directory

```bash
SID=$(date +%Y%m%d-%H%M%S)
SESSION_DIR=".claude/results/quorum-${SID}"
mkdir -p "$SESSION_DIR"
```

## Step 3 — Round Loop (1..7)

### Step 3.1 — Launch 6 Debater Agents (parallel, background)

For each role in `[product, architect, critic, pragmatist, devil, dx]`:

Launch an Agent with `subagent_type: "quorum-{role}"`, `run_in_background: true`.

The prompt for each agent MUST include:

For **Round 1**:
```
TOPIC: {TOPIC}
YOUR_ROLE: {role}
ROUND: 1
SESSION_DIR: {SESSION_DIR}
RESULT_FILE: {SESSION_DIR}/round-1-{role}.json

Read the codebase relevant to the topic. Form your initial position with 2-5 grounded points. Write result JSON to RESULT_FILE.
```

For **Round 2+**:
```
TOPIC: {TOPIC}
YOUR_ROLE: {role}
ROUND: {N}
SESSION_DIR: {SESSION_DIR}
TRANSCRIPT_FILE: {SESSION_DIR}/transcript.md
PREVIOUS_RESULT: {SESSION_DIR}/round-{N-1}-{role}.json
RESULT_FILE: {SESSION_DIR}/round-{N}-{role}.json

Read TRANSCRIPT_FILE to see all previous arguments. Read PREVIOUS_RESULT to maintain consistency. Write rebuttals, concessions, and revised position to RESULT_FILE.
```

### Step 3.2 — Wait for All 6

Wait for all 6 background agents to complete.

### Step 3.3 — Validate Results

For each role, run:
```bash
bash .claude/scripts/validate-result.sh debater "{SESSION_DIR}/round-{N}-{role}.json"
```

If any validation fails, log a warning but continue (agent may have produced partial output).

### Step 3.4 — Compile Transcript

```bash
bash .claude/scripts/quorum-compile-transcript.sh "{SESSION_DIR}" {N}
```

### Step 3.5 — Convergence Check (if round >= 2)

Read all 6 results for the current round. Check three conditions:

**Condition 1 — Position Alignment:**
Read `position` from all 6 results. Are they all the same direction? (all PRO, all CON, or all MIXED counts as aligned; NEUTRAL is wild — compatible with any direction).

**Condition 2 — Confidence Stability:**
For each agent, compare `revised_confidence` (or `confidence` if no revised) vs previous round. Is the maximum delta across all agents < 0.15?

**Condition 3 — No New Arguments:**
Compare `points[]` arrays between this round and previous round. Are there 0 new point IDs across all agents? (Only rebuttals and concessions, no new `points[]` entries.)

**Convergence:** If **2 of 3** conditions are met → converged. Break to Step 4.

### Step 3.6 — Continue or Break

If converged → break to Step 4.
If round == 7 → break to Step 4 (max rounds reached).
Else → next round (go to Step 3.1).

## Step 4 — Extract Disputed Points

Read the latest round's results. Find points where agents disagree:

A point is **disputed** if:
- At least one agent has a rebuttal against it that does NOT concede
- Or the position split is not unanimous (e.g., 4 PRO, 2 CON)

Compile disputed points into `{SESSION_DIR}/disputed-points.json`:
```json
{
  "disputed_points": [
    {
      "point_id": "arch-2",
      "topic": "Use WebSockets vs SSE",
      "original_role": "architect",
      "claim": "WebSockets provide better bidirectional support",
      "opposing_roles": ["pragmatist", "critic"],
      "opposing_arguments": ["Higher complexity", "More attack surface"]
    }
  ]
}
```

If no disputed points found (full consensus), skip Steps 5-6 and go directly to Step 7 with a note that consensus was reached.

## Step 5 — Voting Phase (parallel, background)

For each role in `[product, architect, critic, pragmatist, devil, dx]`:

Launch Agent with `subagent_type: "quorum-{role}"`, `run_in_background: true`.

Prompt:
```
TOPIC: {TOPIC}
YOUR_ROLE: {role}
VOTING_MODE: true
SESSION_DIR: {SESSION_DIR}
DISPUTED_POINTS_FILE: {SESSION_DIR}/disputed-points.json
RESULT_FILE: {SESSION_DIR}/votes-{role}.json

Read DISPUTED_POINTS_FILE. For each disputed point, cast your vote: AGREE, DISAGREE, or ABSTAIN. Write vote result to RESULT_FILE.
```

Wait for all 6 to complete.

## Step 6 — Compile Vote Tallies

For each disputed point, read all 6 vote files and compile tallies:

```json
{
  "vote_tallies": [
    {
      "point_id": "arch-2",
      "topic": "Use WebSockets vs SSE",
      "agree": 4,
      "disagree": 2,
      "abstain": 0,
      "agree_roles": ["product", "architect", "dx", "devil"],
      "disagree_roles": ["pragmatist", "critic"]
    }
  ]
}
```

Write to `{SESSION_DIR}/vote-tallies.json`.

Also run transcript compiler again to include votes:
```bash
bash .claude/scripts/quorum-compile-transcript.sh "{SESSION_DIR}"
```

## Step 7 — Curator Phase (foreground, opus)

Launch a SINGLE Agent with `subagent_type: "quorum-curator"` (NOT background — foreground).

Prompt:
```
TOPIC: {TOPIC}
SESSION_DIR: {SESSION_DIR}
TRANSCRIPT_FILE: {SESSION_DIR}/transcript.md
VOTES_FILE: {SESSION_DIR}/vote-tallies.json
RESULT_FILE: {SESSION_DIR}/verdict.json

Read TRANSCRIPT_FILE and VOTES_FILE. Synthesize the debate. Accept consensus points. Resolve disputed points based on argument quality and votes. Write final verdict to RESULT_FILE.
```

## Step 8 — Present Verdict to User

Read `{SESSION_DIR}/verdict.json` and format for the user:

```markdown
# Quorum Verdict: {TOPIC}

**Decision:** {verdict} (confidence: {confidence})

## Summary
{summary}

## Consensus Points
{for each consensus_point: bullet with description and vote count}

## Resolved Disputes
{for each resolved_dispute: topic, resolution, reasoning, vote_split}

## Risks
{bullet list of risks}

## Action Items
{numbered list of action items}

## Minority Opinions
{for each minority_opinion: role and dissent summary}

---
_Debate stats: {N} rounds, {total_points} points raised, {disputed} disputed, {concessions} concessions made_
_Session: {SESSION_DIR}_
```

## Step 9 — Cleanup (optional)

Ask the user if they want to keep the session files or clean up.
If cleanup requested:
```bash
rm -rf "{SESSION_DIR}"
```

## Error Handling

- If an agent fails to produce a result file, log a warning and continue with 5/6 agents
- If fewer than 4 agents produce results in a round, abort and report to user
- If transcript compilation fails, abort and report
- If curator fails, present raw transcript and vote tallies to user instead

## Notes

- All agents explore the actual codebase — arguments should be grounded in real code
- The Devil's Advocate is expected to lean CON initially — this is by design
- Convergence typically happens in 2-4 rounds for clear-cut topics
- Max 7 rounds prevents infinite loops on genuinely contentious topics
- The curator sees everything — full transcript + all votes — and makes the final call
