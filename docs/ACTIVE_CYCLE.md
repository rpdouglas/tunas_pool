# ACTIVE_CYCLE.md

**Sprint 16: Bingo hardening, and the dry run made ready** · Phase 6f (`docs/BINGO_PLAN.md`) · Started: 2026-10-20

## Goal
Ready for G2 except the gates outside the code. The automatic fetch is parked (D-134).

## Persona check
Reuses the whole-feature check from Sprint 11. For this sprint:
- **The Commissioner:** the README says how a bingo week runs, step by step, and how to settle a dispute; a mistaken late tap can be undone at once.
- **Gerald:** the dispute steps start from the draws and the paid weeks, the same inputs the game is worked out from, then the Audit log in words.
- **Everyone, at size:** a 300-card game approves a winning draw in one go.

## Tasks
- [x] **Fetch parked** (D-134; PROJECT_PLAN §8). Staff type the numbers; the banner reminds them.
- [x] **Scale:** `bingoScale.int.test.ts`, 60 members with 5 cards each, a winning draw approved and the next game opened with all 300 cards: one transaction of about 600 writes, 0.7 s in the emulator
- [x] **Undo late payment** on the Payments screen (the counter for cash only); 1 more component test
- [x] **Accessibility:** `npm run test:a11y` 18 of 18, the styleguide with every bingo component at 375px and desktop
- [x] **The pool's first download:** 305.26 KB, unchanged this sprint (no bingo code in it)
- [x] **README:** "Tunas 649 Bingo": setting it up, a bingo week, settling a bingo dispute, and the dry-run checklist
- [x] Docs: DECISIONS D-134, PROJECT_PLAN §8, BINGO_PLAN status
- [ ] **The dry run** (Ryan, with real people and real Wednesdays): the README checklist
- [ ] **One full smoke run on a machine with enough memory**
- [ ] **G2** (Ryan): the dry run paid out correctly, the launch price and operator % set, the support numbers checked, then "Bingo is on"

## Acceptance (from BINGO_PLAN.md S16)
"The dry run ends with a correct payout, checked by hand against the draws. Then G2 is Ryan's." The code side is done; the dry run is a real-world task with the practice game, and the checklist for it is in the README. Typecheck and lint clean; **407 unit tests** (406 before); **205 rules and functions tests** (204 before).

## Notes / learned
- **After Sprint 16: staff roles from the roster (D-140, Ryan asked, 2026-10-22).** Roster, **Details**, **Staff role**: Player, Counter, or Admin, with a second tap that says what the role allows; a **Counter** or **Admin** badge on the row. Two admin-only callables, `adminListStaffRoles` and `adminSetStaffRole`, set the claim with the Admin SDK and log `player.role`. Only a saved login linked to the profile; never your own role (which also keeps the last admin). CLAUDE.md §4.7 reworded. **Persona check:** Commissioner (primary: no terminal or key needed to let Devon cover the counter; every change in the Audit log in words), Devon (gets the role on a login under his own name, sees it after **Check again**), Gerald (who made whom staff is on the record), Rosalie (no change: a paper player has no login, and the switch says so), Border, Welcome, and Responsible-Play (no change to money, picks, or who can see them beyond the role itself). Tests: 4 unit (`shared/roles.test.ts`), 1 audit-text, 5 component, 4 functions integration; the smoke run gains a step that makes Dale a counter on the emulators and back. `npm run test:a11y` 18 of 18 with the new styleguide states. **Not run:** the smoke run, which couldn't start in this cloud container (its proxy blocks one Functions-emulator setup call); run it once on the Codespace.
- **After Sprint 16: the week page before the lock (D-139, Ryan asked, 2026-10-21).** Before the lock, paid players and the staff see who's in (names only), the games (no counts), and the board. Under every board, *Earlier weeks* holds the boards of the weeks you entered, in an accordion. Unpaid entrants get a note instead of the board. No rules change. **Persona check:** Rosalie (one tap opens a week, 48px rows, the arrow comes with words), Dale (sees who's in before Sunday), Gerald (no picks or counts before the lock, D-021; no payments shown, D-036), Commissioner (no new work). Tests: 4 week page cases and 3 for the earlier boards. The smoke run adds Dale, paid, at `home-paid-open`, `week-open-paid`, `week-open-paid-by-game`, and `week-open-paid-board`.
- **After Sprint 16: the in-app guide (D-136, Ryan asked, 2026-10-21).** `/help` (players), `/admin/help`, `/counter/help`: 14 MDX pages in `src/features/help/pages/` (5 player, 5 commissioner, 2 counter, 1 bingo member, 1 bingo staff) with 20 screenshots from the smoke run (`npm run guide:shots`, WebP, 0.5 MB in all). Linked from the menu (*How it works*), the welcome panel, More (*Help*), and the counter bar. Kept current by `guide.test.tsx` (missing or unused shots, smoke names, links, `covers:` paths), the docs-sync Stop hook (a changed screen under a page's `covers:`), and the sprint-close, persona-check, and governance skills. **Persona check:** Rosalie (one task a page, Extra large text fits: the smoke run's 125% check passed on the help screens), Dale (the tiebreaker example from the sheet), the Commissioner (pages follow the README's steps), Devon (counter pages show only counter screens: no phones, emails, or picks), Welcome (plain words, linked from the welcome panel), bingo (members and staff only, D-128). **Learned:** the full smoke run in guide mode crashed at the bingo staff screens ("Target crashed", as in S15 and S16); `SMOKE_ONLY=bingo npm run guide:shots` took the last two shots and passed in full. Shots are copied into the build before the run, so a page shows a new shot only from the next build. **Not done:** Ryan hasn't read the wording yet.
- **After Sprint 16 (D-135, Ryan asked):** bingo is *Tunas 649 Bingo* everywhere (the pool's name unchanged, 29 mentions before and after); members get a *Tunas 649 Bingo* link in the menu, nobody else. Checked by 2 menu tests, a styleguide state, and the smoke run (a member finds the link; a guest doesn't). **Learned:** my first rename pass also rewrote three history files (the build spec, the review report, DECISIONS) because the exclusion filter didn't match; caught before committing and put back.
- **Bug found by Ryan in use (2026-10-20):** adding a card on his own My cards page said "playerId is missing or not valid". `bingoCreateCard` treated every staff login as staff entering a paper card for someone else, but staff can be members too. A staff call is now a paper card only when it names the player (`functions/src/bingo/callers.ts`, 2 tests). The callable wrappers in `index.ts` had no tests, which Sprint 13 noted; this decision now has one.
- **What isn't proven:** the 300-card approval rests on Firestore's current limits (no 500-write cap, 10 MiB a request); the emulator doesn't enforce the old cap, so the dry run can't prove it either at its size. A failure would be whole and visible, not partial.
- **The bingo smoke run, again:** every step passed up to the commissioner's draw, then the tab ran out of memory, as in Sprint 15. Not chased further here (CLAUDE.md §7).
- No Lighthouse run: Lighthouse isn't installed in the repo, and adding a tool for one check was out of scope. The first-download size check stands in for "the pool's first screen doesn't grow".

---

> Sprints 0 to 15 have been archived to [docs/reports/2026-10-21-sprints-0-to-15.md](reports/2026-10-21-sprints-0-to-15.md).
