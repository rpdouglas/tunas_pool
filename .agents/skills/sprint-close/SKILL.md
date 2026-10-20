---
name: sprint-close
description: >-
  Runs the Tunas pool Definition of Done before declaring a task or sprint
  finished: typecheck, lint, unit tests, rules and function integration tests,
  one browser smoke run at 375px, then updates the matching docs, ACTIVE_CYCLE.md
  and DECISIONS.md. Use when a task is about to be called done, or when closing
  a sprint.
---

# Sprint Close (Definition of Done)

From CLAUDE.md §7. Run in this order and stop at the first failure; fix, then rerun.

## 1. Fast checks

```bash
npm run typecheck
npm run lint
npm run test
npm run test:rules      # rules tests + functions integration tests (Firestore emulator)
```
If `test:rules` prints no "Tests" line, a stray emulator may hold port 8080: check the
port, never start emulators as a bare background command (use `firebase emulators:exec`).
If rules changed, tests were written before or alongside the change (§7 step 4).

## 2. One browser check (only if a screen was added or changed)

```bash
npm run test:smoke      # about a minute, 375px, a11y + large text
```
- Look at the screenshots in `test-results/smoke/` for the screens you touched.
- Add a `visit(...)` line in `scripts/e2e-smoke.ts` for any new screen.
- For a new UI component, confirm it has a `/styleguide` entry showing all states, and
  run `npm run test:a11y` if the styleguide changed.
- If it fails, fix what it found. If a page crashes for no reason in the code, report that
  and move on. **Do not run or write `test:e2e:*` flows** unless Ryan asks (D-066, D-082).

## 3. Docs (same commit as the code)

- Schema change: `docs/DATA_MODEL.md`. Rules change: `firestore.rules` is the source;
  sync the code block and test matrix row in `docs/FIRESTORE_RULES.md`. Function contract:
  DATA_MODEL §5. Design change: `docs/DESIGN_SYSTEM.md`. README when a user-facing step changed.
- Any non-obvious decision: next free `D-nnn` row in `docs/DECISIONS.md`, with date and
  rationale; mark Provisional if Ryan has not confirmed it.
- `docs/ACTIVE_CYCLE.md`: tick finished tasks, add Notes / learned (what was verified, what
  was **not** run, and why).
- Scope creep goes to `docs/PROJECT_PLAN.md` under *Parked*, not into the build.

## 4. Governance check

Run the `tunas-governance-audit` skill (rules/doc diff at minimum). Fix Critical items first.

## 5. Report

State plainly: each command and its result, which screens were looked at, what was not run,
and which docs changed. Remember that merging to `main` deploys to production (§6): treat the
final state as a release.
