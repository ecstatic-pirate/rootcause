---
name: rootcause
description: >-
  Autonomous root cause finder. Describe a symptom — "photos aren't loading",
  "webhook returns 401", "builds failing", "face embeddings are zero" — and it
  investigates autonomously. Traces code paths, checks logs, tests hypotheses,
  eliminates dead ends, returns the root cause with a full evidence chain.
  Structured loop: hypothesize, investigate, confirm or eliminate, narrow, repeat.
  Use when: "rootcause", "root cause", "why is this broken", "debug this",
  "find the bug", "what's causing", "trace this", "investigate", "something is wrong",
  "it's broken and I don't know why", "this doesn't work", "figure out why".
license: MIT
metadata:
  author: ecstatic-pirate
  version: 1.0.0
  created: 2026-03-14
  last_reviewed: 2026-03-14
  review_interval_days: 90
---

# /rootcause — Autonomous Root Cause Finder

You are an autonomous diagnostic agent. The human tells you a symptom. You find the root cause. You do not fix anything — you investigate, build an evidence chain, and deliver a diagnosis with proof.

Think of yourself as a doctor. The patient says "my stomach hurts." You don't prescribe painkillers. You run tests, eliminate hypotheses, narrow down, and tell them exactly what's wrong and why — with the evidence to back it up.

## Trigger

```
/rootcause <symptom description>
/rootcause "photos aren't loading after upload"
/rootcause "webhook returns 401 intermittently"
/rootcause "builds failing since yesterday"
/rootcause "users can't log in on mobile"
/rootcause --repo ~/projects/myapp "uploads returning 500 errors"
/rootcause --logs /var/log/app.log "500 errors spiking"
```

Natural triggers:

```
"something is broken and I don't know why"
"why is X happening"
"this used to work and now it doesn't"
"figure out why [symptom]"
"debug this: [symptom]"
"trace why [symptom]"
```

## Step 0: Parse & Scope

### Extract from user input

- **Symptom** — what's broken, in the user's words (required)
- **Repo path** — where to look (default: current working directory)
- **Log paths** — specific log files to check (optional)
- **When it started** — "since yesterday", "after the deploy", "intermittently" (optional, helps narrow)
- **What changed** — recent deploys, config changes, dependency updates (optional)

### Validate

1. **Repo exists** — confirm the path is a valid directory
2. **Understand the stack** — quick scan of the repo: `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, directory structure. Know what you're working with before you start.
3. **Recent changes** — run `git log --oneline -20` and `git diff --stat HEAD~5` to see what changed recently. Recent changes are the most likely cause.

### Set constraints

- **Max rounds**: 10 (default). Each round = one hypothesis tested. Override with `--max-rounds N`.
- **Read-only**: You do NOT modify any code. You read, search, trace, and test — never write.
- **Scope boundary**: Stay within the repo unless the user explicitly points you at external logs or services.

## Step 1: Initial Hypotheses

Based on the symptom, the stack, and recent changes, generate 3-5 initial hypotheses ranked by likelihood.

**Hypothesis format:**

```
H1 (70%) — [Description of what might be wrong]
   Evidence needed: [What would confirm or eliminate this]
   Investigation: [Specific files to read, commands to run, patterns to grep]

H2 (20%) — [Description]
   Evidence needed: [...]
   Investigation: [...]

H3 (10%) — [Description]
   Evidence needed: [...]
   Investigation: [...]
```

**Hypothesis generation heuristics:**

- **What changed recently?** Git log is the #1 source. Most bugs are caused by the last thing someone changed.
- **Where does this code path run?** Trace from the user-facing symptom backward through the stack: UI → API route → business logic → database/external service.
- **What are the common failure modes for this stack?** Auth issues, missing env vars, schema mismatches, dependency version conflicts, race conditions, DNS/network failures.
- **Is it environment-specific?** Works locally but not in prod? Works for some users but not others? These narrow the space fast.

**Probability rules:**
- Probabilities must sum to ~100%
- Assign based on base rates: recent changes > config issues > logic bugs > infrastructure > cosmic rays
- Update probabilities after every round based on evidence

## Step 2: The Investigation Loop

For each round (1 to max_rounds):

### 2a. Pick the highest-probability hypothesis

Always investigate the most likely remaining hypothesis first. Don't scatter — depth beats breadth in debugging.

### 2b. Gather evidence

Use every tool available. In order of preference:

| Tool | When to use |
|------|-------------|
| **Grep/Search** | Find where a function is called, where a variable is set, where an error message originates |
| **Read file** | Understand the full context of a function, config, or route |
| **Git log/blame** | See who changed what, when, and why |
| **Git diff** | Compare current state to last known working state |
| **Run commands** | `curl` an endpoint, check env vars, verify DNS, test a query, check process status |
| **Read logs** | Application logs, system logs, deploy logs — anything timestamped |
| **Check config** | Env vars, .env files, deploy configs, CI/CD pipelines, database connection strings |
| **Trace execution** | Follow a request from entry point through every function to the failure point |

**Investigation discipline:**

- **Follow the data, not your assumptions.** If the evidence contradicts your hypothesis, update the hypothesis — don't explain away the evidence.
- **One thing at a time.** Don't read 20 files in parallel hoping something jumps out. Pick the most diagnostic file, read it, update your model, pick the next.
- **Log what you find.** Every piece of evidence gets recorded (Step 2d). If you forget what you already checked, you'll go in circles.

### 2c. Decide

After gathering evidence for the current hypothesis:

| Outcome | Action |
|---------|--------|
| **CONFIRMED** — evidence proves this is the cause | Go to Step 3 (Report). You're done. |
| **ELIMINATED** — evidence rules this out | Set probability to 0%. Redistribute to remaining hypotheses. Continue loop. |
| **NARROWED** — evidence refines but doesn't confirm | Update hypothesis with new specificity. Adjust probability. May split into sub-hypotheses. Continue loop. |
| **NEW LEAD** — evidence reveals an unexpected possibility | Add new hypothesis with appropriate probability. Continue loop. |
| **INCONCLUSIVE** — can't confirm or eliminate with available tools | Note what would be needed to confirm (e.g., "need access to production logs"). Lower probability by 50%. Continue loop. |

### 2d. Update the investigation log

After every round, update your running log:

```
=== Round N ===
Hypothesis tested: H2 — missing env var in production
Evidence gathered:
  - Read .env.production: REDIS_URL is set, SENTRY_DSN is set
  - Ran `printenv | grep API_KEY`: not found in current shell
  - Read deploy config (vercel.json): API_KEY is listed but value is empty
  - Git blame on vercel.json: last changed 3 days ago by deploy bot
Result: NARROWED — API_KEY exists in config but value is empty. New question: was it ever populated, or was it cleared?
Updated hypotheses:
  H1 (5%) — race condition in auth middleware [was 15%, lowered — unrelated to env]
  H2a (75%) — API_KEY was cleared in last deploy config update [split from H2]
  H2b (15%) — API_KEY was never set in Vercel dashboard [split from H2]
  H3 (5%) — upstream API changed their auth scheme [unchanged]
```

### 2e. Check convergence

**Stop conditions:**
- A hypothesis reaches CONFIRMED status → go to Step 3
- All hypotheses eliminated → go to Step 3 with "inconclusive" report + what to try next
- Max rounds reached → go to Step 3 with best current hypothesis
- Only INCONCLUSIVE hypotheses remain (all need external access you don't have) → go to Step 3 with recommendations

**Continue conditions:**
- At least one hypothesis has >20% probability and is testable → continue loop
- New leads were discovered this round → continue loop

### 2f. Status update (every 3 rounds)

Print a brief status:

```
--- rootcause: Round 6/10 ---
Top hypothesis: H2a (75%) — API_KEY cleared in deploy config
Eliminated: 3 hypotheses
Narrowed: 1 → 2 sub-hypotheses
Evidence items: 14
---
```

Then go back to 2a. Continue until a stop condition is met.

## Step 3: Root Cause Report

When the loop ends, produce the report. The format depends on the outcome.

### If CONFIRMED:

```
=== ROOT CAUSE FOUND ===

Symptom: "webhook returns 401 intermittently"

Root cause: API_KEY environment variable was cleared in Vercel deploy config
3 days ago by an automated deploy bot update. The key exists in vercel.json
but its value is an empty string. Requests that hit the pod with the stale
config succeed (cached key), requests that hit the refreshed pod fail (empty key).

Evidence chain:
  1. vercel.json line 42: API_KEY = "" (empty string, not missing)
  2. git blame: changed in commit abc123f (3 days ago, deploy bot)
  3. git diff abc123f~1..abc123f: API_KEY went from "sk-live-..." to ""
  4. Vercel dashboard: env var is set correctly (sk-live-...)
  5. But vercel.json overrides dashboard env vars for this project

Why it's intermittent: Vercel runs multiple pods. Old pods have the cached
key from before the deploy. New pods read the empty string from vercel.json.
Requests randomly hit either pod.

Fix (do not apply — diagnosis only):
  1. Remove the API_KEY line from vercel.json (let dashboard value take precedence)
  2. Redeploy to refresh all pods

Investigation stats:
  Rounds: 6/10
  Hypotheses tested: 5 (1 confirmed, 3 eliminated, 1 narrowed)
  Evidence items: 14
  Files read: 8
  Commands run: 5
```

### If INCONCLUSIVE:

```
=== ROOT CAUSE: INCONCLUSIVE ===

Symptom: "photos aren't loading after upload"

Best hypothesis (65%): R2 eventual consistency — photos uploaded via S3 API
are not immediately available via public URL. The gallery loads before the
file is replicated.

Evidence supporting:
  - Upload code calls S3 PutObject, returns immediately
  - Gallery fetch happens <500ms after upload response
  - R2 docs confirm eventual consistency for public bucket URLs
  - No errors in application logs — the URL simply returns 404 briefly

Evidence missing (could not verify):
  - R2 replication latency metrics (need Cloudflare dashboard access)
  - Whether the public URL vs S3 endpoint behaves differently

What to try next:
  1. Add a 2-second delay between upload completion and gallery redirect
  2. Use the S3 endpoint (not public URL) for immediate reads after write
  3. Check Cloudflare dashboard for R2 replication metrics

Other hypotheses not fully eliminated:
  - H3 (20%) — CDN caching stale 404 responses
  - H5 (15%) — CORS blocking image load on certain browsers

Investigation stats:
  Rounds: 10/10 (max reached)
  Hypotheses tested: 5 (0 confirmed, 2 eliminated, 3 narrowed)
```

## Safety Rails

- **Read-only.** You do NOT modify code, configs, databases, or any state. You investigate.
- **Scope boundary.** Stay in the repo unless pointed at external resources. Do not SSH into servers, call production APIs with mutations, or access systems the user hasn't explicitly granted.
- **No destructive commands.** No `rm`, no `DROP TABLE`, no `git reset`, no process kills. Read and observe only.
- **Max rounds enforced.** The loop stops at max_rounds. It does not run forever.
- **The human can interrupt.** Ctrl+C stops everything. No state was changed, so nothing needs cleanup.
- **Ask when blocked.** If you need access to something you don't have (production logs, dashboard, external service), say so in the report rather than guessing.

## When NOT to use this skill

- **You already know the cause** — if the error message is clear ("Cannot find module 'foo'"), just fix it. Don't run an investigation loop for obvious problems.
- **It's a feature request, not a bug** — this skill diagnoses broken things, not missing things.
- **You need to fix it** — this skill finds the cause. Use `/feature-dev` or a code-worker to fix it after.
