# /rootcause

autonomous root cause finder for claude code.

describe a symptom. it investigates on its own - traces code paths, checks logs, tests hypotheses, eliminates dead ends. returns the root cause with a full evidence chain.

## how it works

structured loop: hypothesize → investigate → confirm or eliminate → narrow → repeat. max 10 rounds. read-only - it never touches your code.

## install

copy `SKILL.md` to `~/.claude/skills/rootcause/SKILL.md`

then use it:

```
/rootcause "uploads returning 500 errors"
/rootcause "builds failing since yesterday"
/rootcause "users can't log in on mobile"
```

## the loop

same DNA as karpathy's autoresearch - but for debugging instead of optimization:

- **one hypothesis at a time** - depth beats breadth in debugging
- **evidence-based decisions** - confirm, eliminate, or narrow each hypothesis
- **probability tracking** - hypotheses ranked and updated after every round
- **read-only** - investigates without changing anything

## license

MIT
