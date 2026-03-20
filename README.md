# /rootcause

autonomous root cause finder for claude code.

describe a symptom. it investigates on its own — instruments runtime, reproduces the bug, traces actual execution, forms hypotheses from runtime traces (not static code reading), and verifies predictions. returns the root cause with a full evidence chain.

## install

```
npx rootcause-skill
```

that's it. the skill is now at `~/.claude/skills/rootcause/SKILL.md`.

then use it:

```
/rootcause "uploads returning 500 errors"
/rootcause "builds failing since yesterday"
/rootcause "users can't log in on mobile"
```

### manual install

```
mkdir -p ~/.claude/skills/rootcause
cp SKILL.md ~/.claude/skills/rootcause/SKILL.md
```

## the 9-step evidence chain

1. **parse & scope** — repo scan, git log, stack detection
2. **symptom** — one sentence capturing what's broken
3. **restate + happy path** — confirm understanding with the human
4. **instrument** — add `[ROOTCAUSE-TRACE]` markers at every state-changing point
5. **reproduce** — browser tool first, localhost default
6. **read trace** — parse runtime output into ordered sequence
7. **diagnose** — form hypotheses from the trace, not from code reading
8. **verify prediction** — test the top hypothesis
9. **deliver** — root cause with evidence chain, write findings to file

the key insight: static analysis finds real bugs that aren't the root cause. on a real debugging session, static analysis found 5 genuine bugs, all fixed, all tests passed — but the actual root cause was a 6th thing only visible in the runtime trace.

## the loop

same DNA as karpathy's autoresearch — but for debugging instead of optimization:

- **runtime-first** — instrument and observe before you hypothesize
- **evidence-based decisions** — confirm, eliminate, or narrow each hypothesis
- **probability tracking** — hypotheses ranked and updated after every round
- **read-only** — investigates without changing anything
- **human gates** — confirms understanding before proceeding

## chains with /autofix

```
npx autofix-skill
```

ideal pipeline: `/rootcause` finds the problem (read-only) → `/autofix` ships the fix (worktree-isolated, TDD-first).

## license

MIT
