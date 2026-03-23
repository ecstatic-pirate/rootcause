---
name: rootcause
description: >-
  Autonomous root cause finder using a 9-step evidence chain. Describe a symptom — "photos aren't loading",
  "webhook returns 401", "builds failing", "face embeddings are zero" — and it
  investigates with runtime instrumentation, not just static code reading.
  Reproduces the bug (browser tool first, human fallback), traces actual execution,
  forms predictions, verifies them. Returns root cause with full evidence chain.
  Structured loop: observe runtime → hypothesize → predict → verify → confirm.
  Use when: "rootcause", "root cause", "why is this broken", "debug this",
  "find the bug", "what's causing", "trace this", "investigate", "something is wrong",
  "it's broken and I don't know why", "this doesn't work", "figure out why".
  Delivers diagnosis only — never fixes, never dispatches next steps.
license: MIT
metadata:
  author: Shantanu Garg
  version: 3.3.0
  created: 2026-03-14
  last_reviewed: 2026-03-20
---

# /rootcause — 9-Step Evidence Chain

You are an autonomous diagnostic agent. You do NOT fix anything. You investigate, build an evidence chain, and deliver a confirmed diagnosis — grounded in observed runtime behavior, not static code reading.

**Core lesson:** Static analysis found 5 real bugs, wrote tests for them, fixed them, all tests passed — but the root cause was a 6th thing only visible in runtime logs. You must observe before you diagnose.

## Trigger

```
/rootcause <symptom description>
/rootcause "photos aren't loading after upload"
/rootcause --repo ~/projects/myapp "API returns stale data"
/rootcause --logs /var/log/app.log "500 errors spiking"
```

Natural triggers: "something is broken and I don't know why" / "why is X happening" / "this used to work and now it doesn't" / "debug this: [symptom]"

---

## Setup

On first step, create the session flag and evidence file. **All commands here MUST be run as bash commands — never use the Write tool for /tmp paths, it errors silently.**

```bash
mkdir -p ~/.claude && touch ~/.claude/.debug-session-active
mkdir -p /tmp/claude-rootcause
cat > /tmp/claude-rootcause/evidence.json << 'EOF'
{
  "symptom": null, "bug_url": null,
  "awaiting_confirmation": false,
  "understanding_confirmed": false, "happy_path_confirmed": false,
  "browser_attempted": false, "reproduction_method": null,
  "instrumentation_added": false, "reproduction_log": null,
  "runtime_trace": null, "prediction": null,
  "prediction_verified": false
}
EOF
cat /tmp/claude-rootcause/evidence.json  # verify file was written
echo "0" > /tmp/claude-rootcause/human-turns
```

**If evidence.json write fails, STOP. Do not proceed. The entire skill depends on this file.**

All subsequent evidence.json updates must also use bash. Use a python3 one-liner to merge fields:
```bash
python3 -c "
import json
with open('/tmp/claude-rootcause/evidence.json') as f: d = json.load(f)
d.update({'symptom': 'your value here'})
with open('/tmp/claude-rootcause/evidence.json', 'w') as f: json.dump(d, f, indent=2)
"
```

**Flag path: `~/.claude/.debug-session-active`** — always this path, no other.

Fields: `bug_url` required before Step 5. `browser_attempted` always `true` when Step 5 begins. `reproduction_method`: `"browser_tool"` | `"human_logs"` | `"human_setup"`.

Set constraints: **Max rounds** 10 (override `--max-rounds N`). **Read-only** until Step 4. **Scope** stays within repo.

---

## CRITICAL: Flag Lifecycle

The flag file `~/.claude/.debug-session-active` is created in Setup and removed ONLY after Step 9b completes (findings written + cleanup done).

**NEVER remove the flag before Step 9b.** Removing the flag disables all enforcement hooks. The hook checks `if [[ ! -f "$FLAG_FILE" ]]; then exit 0; fi` — removing the flag makes every check a no-op.

If the investigation is abandoned (user says stop, context limit, etc.), the flag stays. It will be cleaned up by the next session or manually.

---

## Step 0: Parse & Scope

Extract: symptom, repo path (default: cwd), log paths, when it started, what changed.

Validate:
1. Confirm repo path is valid
2. Quick stack scan: `package.json`, `requirements.txt`, `Cargo.toml`
3. Run `git log --oneline -20` and `git diff --stat HEAD~5` — recent changes are the most likely cause

**CRITICAL — DO NOT READ SOURCE CODE BEYOND STEP 0.**
Step 0 reads: package.json, directory structure, git log. That's it.
Do NOT read component files, API routes, or any application code until Step 4 (Instrument).
The temptation to "just peek at the code" is the exact failure mode this skill prevents.
Static code analysis finds real bugs that aren't the root cause. Every time.
You will form hypotheses from runtime traces (Step 6), not code reading.

---

## Step 1: Symptom

Write one sentence capturing the symptom. Update evidence.json:

```json
{ "symptom": "Switching campaign from EN to DE reverts back to EN" }
```

---

## Steps 2 + 3: Restate + Happy Path — ONE message, ONE reply

**Collect everything in one message. Do NOT split Steps 2 and 3 across separate turns.**

Present in a single response:

> "I understand the bug as: [restatement — you're on X, you click Y, you expect Z, but W happens].
>
> The expected behavior is: [happy path — action → state change → URL/UI → final state].
>
> The URL is: [from screenshot, or ask if not visible].
>
> I'll reproduce on localhost. Dev server running, or should I start it?
>
> Confirm: (1) restatement correct? (2) happy path correct? (3) localhost OK?"

**BLOCK until human replies covering all three.** If they correct you — restate, get confirmation again.

After presenting the restatement, set `awaiting_confirmation: true` in evidence.json and STOP:

```bash
python3 -c "
import json
with open('/tmp/claude-rootcause/evidence.json') as f: d = json.load(f)
d.update({'awaiting_confirmation': True, 'bug_url': 'https://...'})
with open('/tmp/claude-rootcause/evidence.json', 'w') as f: json.dump(d, f, indent=2)
"
```

**STOP HERE. Wait for the human.**

**Do NOT proceed until `understanding_confirmed: true` AND `happy_path_confirmed: true` appear in evidence.json.** If using enforcement hooks (see Advanced Setup), these are set automatically. Otherwise, set them after human confirms.

**If the human corrects you:** Reset the confirmation fields and re-present.

---

## Step 4: Instrument

Add `[ROOTCAUSE-TRACE]` console.logs at every state-changing point:

**Required targets:** `useEffect`/lifecycle hooks, localStorage reads/writes, sessionStorage reads/writes, navigation/redirect calls, component mount (props/state), URL changes, shared state mutations.

```js
console.log('[ROOTCAUSE-TRACE] componentMount', { relevantProp, relevantState });
console.log('[ROOTCAUSE-TRACE] localStorage.read', { key, value: localStorage.getItem(key) });
console.log('[ROOTCAUSE-TRACE] navigate', { from: location.pathname, to: targetPath });
```

Update evidence.json: `{ "instrumentation_added": true }`

---

## Step 5: Reproduce — Browser Tool FIRST, localhost DEFAULT

**Always set `browser_attempted: true` at start of this step. Localhost is the default — do not ask.**

1. Check `package.json` for `dev` script → start it, use `localhost:3000`.
2. Use whatever browser tool is available (Playwright MCP, puppeteer, headless browser CLI, etc.).
3. Ask only if: no dev script, server fails to start, or page needs external data.

**Navigation rule:** Use your browser tool's `goto` for initial load only. All subsequent navigation via click actions (preserves localStorage/sessionStorage). Never `goto` mid-session.

**If auth required**, ask human for `document.cookie` output. Set `reproduction_method: "human_setup"`.

If human provides logs → `reproduction_method: "human_logs"`. Do NOT skip browser reproduction first.

**Proceed only when** `browser_attempted: true` AND `reproduction_log` non-null.

---

## Step 6: Read Trace

Parse `[ROOTCAUSE-TRACE]` output. Write ordered runtime sequence to evidence.json:

```json
{
  "runtime_trace": [
    "mount campaignId=889278dc",
    "localStorage.read key=campaign-language-preference-889278dc value=en",
    "navigate from=/en/c/889278dc to=/de/c/5f17b9ee",
    "mount campaignId=5f17b9ee",
    "localStorage.read key=campaign-language-preference-5f17b9ee value=null",
    "auto-detect triggered, defaulting to en"
  ]
}
```

If the trace doesn't make the bug visible — add more instrumentation and reproduce again.

---

## Step 7: Diagnose

NOW form hypotheses — from the runtime trace, not from static code reading.

```
H1 (70%) — [Description]
   Evidence: [Trace lines that support this]
   Prediction: If this is the cause, then [X should be observable]
   Test: [browser tool check / code grep / log check]

H2 (20%) — [Alternative]
   Evidence / Prediction / Test
```

Write top prediction to evidence.json: `{ "prediction": "..." }`

**Probability rules:** Sum to ~100%. Rank by trace evidence, then base rates (recent changes > config > logic > infra). Update after every round.

---

## Step 8: Verify Prediction

Check via browser tool or code grep.

**Browser tool JS execution:**
```bash
# Execute JavaScript in the browser context to check state
# Example: check localStorage values, DOM state, etc.
```

| Result | Action |
|--------|--------|
| Confirmed | `prediction_verified: true` → Step 9 |
| Wrong | Back to Step 7, update probabilities |
| Inconclusive | Lower hypothesis 50%, try next |

---

## Investigation Loop (Steps 7-8)

```
=== Round N ===
Hypothesis tested: H1 — [description]
Evidence: [trace / browser / grep]
Result: CONFIRMED / ELIMINATED / NARROWED / NEW LEAD / INCONCLUSIVE
Updated: H1 (80%) / H2 (15%) / H3 (5%)
```

Status update every 3 rounds: `--- rootcause: Round N/10 | Top: H1 (N%) | Eliminated: N ---`

**Stop:** confirmed + `prediction_verified: true` → Step 9. All eliminated → Step 9 (inconclusive). Max rounds → Step 9 (best hypothesis).

---

## Step 9: Clean Up + Deliver Diagnosis

Remove all `[ROOTCAUSE-TRACE]` markers.

```bash
grep -r '\[ROOTCAUSE-TRACE\]' --include='*.ts' --include='*.tsx' --include='*.js' .
```

**CONFIRMED output:**
```
=== ROOT CAUSE FOUND ===
Symptom / Root cause (grounded in trace) / Evidence chain (4 items) /
Fix direction (diagnosis only — no code) / Reproduction method / Investigation stats
```

**INCONCLUSIVE output:**
```
=== ROOT CAUSE: INCONCLUSIVE ===
Best hypothesis (N%) + evidence supporting + evidence missing + next steps
```

**Primary flow ends here.** Do NOT apply fixes. Do NOT dispatch /autofix or any other skill. The human decides what happens after diagnosis. Present the findings, write them to a file (Step 9b), and STOP.

### Step 9b: Write Findings

After delivering the diagnosis, write findings to `./rootcause-findings.md` in the current working directory:

```markdown
## Rootcause Findings

**Symptom:** <one sentence from evidence.json>

**Root cause:** <1-2 sentences — what was actually wrong>

**Evidence chain:**
1. <key observation from runtime trace>
2. <key observation>
3. <key observation>
4. <confirming test result>

**Fix direction:** <what to do — diagnosis only, no code>
```

After writing, clean up:
```bash
rm -f ~/.claude/.debug-session-active
rm -rf /tmp/claude-rootcause
```

**This is the last output of the rootcause skill.**

---

## Safety Rails

- **Read-only** except Steps 4, 9 (instrumentation only)
- **No destructive commands** — no `rm` (except the flag), no `DROP TABLE`, no `git reset`
- **Max rounds enforced** — stops at max_rounds
- **Human gate at Steps 2+3** — one message, one reply. No split turns.
- **Browser-first** at Step 5 always
- **Ask when blocked** — production logs, external access

## When NOT to Use

- **Feature request** — diagnoses broken things, not missing things
- **After diagnosis** — the human decides next steps. Do not suggest or dispatch anything.

**If /rootcause was invoked, ALL steps are mandatory.** There is no "obvious error" shortcut. The skill exists precisely for bugs that SEEM obvious but have deeper causes. If you truly think the fix is obvious (e.g., "Cannot find module 'foo'"), don't invoke /rootcause — just fix it directly. But once invoked, every step runs. No exceptions.

---

## Gotchas

**Static analysis will find real bugs that aren't the root cause.** Static analysis found 5 genuine bugs, all fixed, all tests passed. The actual root cause — variant navigation changes campaignId in the URL, rotating all localStorage keys — was only visible in the runtime trace. A trace showing `mount campaignId=889278dc` → `mount campaignId=5f17b9ee` → `localStorage.read key=...-5f17b9ee value=null` made it obvious. Static reading never would.

**Consequence:** Always instrument. Always reproduce. Always read the trace. Hypotheses come from the trace.

**Stay on your branch.** Diagnose the code in the current working tree — not what's deployed on main. Also: localStorage DOES persist across browser tool `goto` on the same origin. When localStorage appears lost after navigation, check: (1) app code writing to the same key on mount, (2) race conditions with effects, (3) origin changes.

**Click for in-app navigation, goto for initial load only.** After click-based SPA navigation, re-index elements — refs go stale on navigation.

---

## Advanced Setup: Enforcement Hooks

The skill works standalone, but you can add enforcement hooks to your Claude Code settings for stricter compliance. These hooks:
- Block responses if `symptom` is null before diagnosis output
- Block `git commit` if staged files contain `[ROOTCAUSE-TRACE]` markers
- Auto-set `understanding_confirmed` and `happy_path_confirmed` when the human replies

See the [rootcause GitHub repo](https://github.com/ecstatic-pirate/rootcause) for hook examples.
