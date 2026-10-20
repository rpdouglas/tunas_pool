---
name: persona-check
description: >-
  Runs the Tunas pool Persona Check (docs/PERSONAS.md §0) on a feature before it
  is built: names the primary persona, turns their UX constraints into acceptance
  criteria, and runs the Rosalie, Dale, Gerald, Commissioner, Border, Welcome,
  Responsible-Play and privacy tests. Use at the start of any feature, screen, or
  message-wording change, and when writing the Persona check section of a sprint
  in docs/ACTIVE_CYCLE.md.
---

# Persona Check

CLAUDE.md §7 step 2: run this on **every** feature before building. Personas are
working models; when a persona and a real player disagree, the real player wins.

## Steps

1. Read `docs/PERSONAS.md` §0 (the ten checks) and §1 (hierarchy). Then read §3 only
   for the personas you name, plus §4 for any relevant anti-persona (Double-Dipper,
   Late Pick Lobbyist, Snoop). Do not read all 885 lines.
2. Name the **primary persona**. Optimise for them; test the secondaries against the result.
   Never design for an average.
3. Copy that persona's UX Constraints into the feature's acceptance criteria.
4. Run each test and write a one or two line verdict (PASS, or the redesign needed):

   | Test | Question |
   |---|---|
   | Rosalie Inclusion | Can someone who never touches the app still enter, pay, see results, get winnings? |
   | Dale Deadline | Works at 11:40 PM Saturday, one thumb, weak signal, 20 minutes to lock? Adds a step? Cut one. |
   | Gerald Trust | Can a skeptic verify it without taking anyone's word? |
   | Commissioner Counter | One-handed, customer waiting, ~10 seconds, with an undo? |
   | Border | Identical for a NY-side player with no Canadian bank account? |
   | Welcome | A Cornwall first-timer understands it with no insider words, without exposure? |
   | Responsible-Play | Encourages spend beyond the fixed fee, IOUs, tabs, or chasing? |
   | Privacy | Would a player feel watched, ranked or exposed (phones, who owes)? |

5. Cross-check the design against the hard constraints in CLAUDE.md §4 and §8
   (picks private until reveal, server-enforced lockout, no client writes of derived data,
   mobile first at 375px with 48px targets, tokens only).
6. Output a block ready to paste into `docs/ACTIVE_CYCLE.md` under the sprint:

```
### Persona check
- **Primary persona:** ...  Secondary: ...
- **Rosalie Inclusion Test:** ...
- **Dale Deadline Test:** ...
- **Gerald Trust Test:** ...
- **Commissioner Counter Test:** ...
- **Border / Welcome / Responsible-Play / Privacy:** ...
```

If any test fails, say what to redesign and stop: do not start building until it passes
or Ryan accepts the trade-off (record that in `docs/DECISIONS.md`).
