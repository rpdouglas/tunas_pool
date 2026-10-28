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
- [x] **The pool as an installable web app (D-141, Ryan asked, 2026-10-22):**
  - [x] Manifest and icons (192, 512, maskable 512) from BA-02 via `scripts/brand/build-assets.sh`; BRAND_ASSETS catalog
  - [x] `vite-plugin-pwa` 1.3 worker: all JS and CSS, Latin fonts, the wordmark; `/__/` excluded, no Firebase traffic cached, Firestore offline cache off (unchanged: memory only)
  - [x] The app status strip (offline; *A new version of the pool is ready*, **Refresh**, **Later**); 4 component tests; styleguide states
  - [x] `firebase.json`: `no-cache` for `sw.js`, `index.html`, and the manifest; the year-long cache now only on `/assets/**`; kill switch `selfDestroying`, and `scripts/pwa/remove-sw.js`
  - [x] Guide page *Put the pool on your home screen* (iPhone and Android), linked from Account
  - [x] MIGRATION.md Part 2 step 7: the forwarding site serves `remove-sw.js` as `/sw.js`
  - [x] Smoke run: the manifest is served and the worker starts (both pass); its other tabs block the worker
- [x] **Shop tablet kiosk (D-142, Ryan asked, 2026-10-22):**
  - [x] Dedicated `/kiosk` route with isolated kiosk shell, header lock button for staff exit back to `/counter`
  - [x] Roster selection dropdown with searchable active players and 4-digit PIN setup / entry (no phone/email/picks exposed)
  - [x] Walk-in registration modal for new players with display name, phone/email, and PIN setup
  - [x] PIN security: salted scrypt hashing via Cloud Functions, constant-time verification, 5-attempt rate-limit lockout
  - [x] Pick sheet: 15 Sunday/MNF games + MNF total points tiebreaker, cash/e-transfer payment method
  - [x] Receipt modal: on-screen confirmation card with dynamic QR code (`qrcode.react`) to scan picks onto personal phone, 12s auto-reset
  - [x] Session lifecycle: 60s idle timeout modal with 15s countdown to auto-reset
  - [x] Staff PIN reset action on `/counter` and "Launch Shop Kiosk" counter header button
  - [x] Styleguide states, unit tests (466 total), integration tests (214 total), smoke test step
- [x] **Delete sample & test players script (D-143, Ryan asked, 2026-10-22):**
  - [x] `scripts/delete-sample-players.ts`: scans `players` for notes matching `/sample|test/i`
  - [x] Cascade deletes player profile, stats, entries across all weeks, bingo cards/members, claims, and Auth users
  - [x] Automatically recounts affected weeks and recomputes season standings
  - [x] Writes `player.delete` audit entries documenting the maintenance cleanup
  - [x] Safe dry-run table preview by default; requires `--confirm` flag to delete
  - [x] Added `admin:delete-sample-players` npm script; 3 integration tests (217 rules/int total)
- [x] **Magic link improvements & session persistence (D-144, Ryan asked, 2026-10-28):**
  - [x] `checkEmailAccountStatus` callable pre-tags links with `&mode=signin` or `&mode=link` to eliminate the action code burn on returning players
  - [x] `FinishSignIn` handles direct sign-in for returning accounts, skipping `linkWithCredential` and calling `adoptGuestProfile` if guest picks exist
  - [x] In-app webview detector (`isInAppBrowser`) with "Open in Safari / Chrome" guidance card and one-tap "Copy sign-in link" button on `/auth/finish`
  - [x] `/account` status clarity: displays active guest picks on phone and clarifies that regular weekly play does not require re-logging in
  - [x] Unit tests for `checkEmailStatus` and `isInAppBrowser`
- [ ] **The dry run** (Ryan, with real people and real Wednesdays): the README checklist
- [ ] **One full smoke run on a machine with enough memory**
- [ ] **G2** (Ryan): the dry run paid out correctly, the launch price and operator % set, the support numbers checked, then "Bingo is on"

## Acceptance (from BINGO_PLAN.md S16)
"The dry run ends with a correct payout, checked by hand against the draws. Then G2 is Ryan's." The code side is done; the dry run is a real-world task with the practice game, and the checklist for it is in the README. Typecheck and lint clean; **407 unit tests** (406 before); **205 rules and functions tests** (204 before).

## Notes / learned
- **After Sprint 16: delete sample & test players script (D-143, Ryan asked, 2026-10-22).** Scans `players` in `db-tunaspool` for accounts where `notes` contains "sample" or "test" (case-insensitive substring). Cascade deletes player document, `stats` subcollections, weekly pool entries and subcollections (`private/picks`, `payment`) across all seasons/weeks, `bingoCards`, `bingoMembers/{playerId}`, `claims`, `boardMutes/{playerId}`, and linked Firebase Auth accounts. Automatically recounts affected weeks (`recountWeek`) and recomputes season standings (`recomputeStandings`). Writes an audit entry (`player.delete`) for each player noting maintenance cleanup. Runs in dry-run mode by default (console table of candidate accounts and associated counts); requires `--confirm` to execute deletion. Script added as `npm run admin:delete-sample-players`. 3 integration tests in `functions/src/deleteSamplePlayers.int.test.ts` (217 rules/int tests total).
- **After Sprint 16: shop tablet kiosk (D-142, Ryan asked, 2026-10-22).** Dedicated shop tablet route (`/kiosk`) for walk-ins and regulars. Regulars select their profile from active roster and enter 4-digit PIN (set on first visit); walk-in registration modal captures name, phone/email, and sets PIN. PINs are salted scrypt hashes stored server-side with constant-time verification and 5-attempt rate-limiting lockout. Pick sheet mirrors mobile entry with cash payment highlighted. Submission generates an on-screen confirmation card with dynamic QR code (`qrcode.react`) to scan picks onto personal phone, 12s auto-reset, and 60s idle timeout modal with 15s warning. Devon/Ryan can reset player PIN in person from `/counter` (`counterResetPlayerPin`) and launch kiosk from the counter header. **Persona check:** Dale (primary walk-in: quick 4-digit PIN, picks in 60s, scans QR code on phone), Rosalie (can use tablet in store with large touch targets if not using paper), Gerald (no picks/tiebreaker leaks before lock, PIN audit trail, lockouts logged), Devon/Commissioner (fast roster PIN reset from counter if player forgets; "Launch Shop Kiosk" one-click shortcut). Tests: 67 test files (466 unit tests passed), 14 rules/int files (214 tests passed). Kiosk chunk lazy-loaded (38.67 kB), initial bundle unchanged at ~308 KB.
- **After Sprint 16: the installable app (D-141, Ryan asked, 2026-10-22).** Add to Home Screen now opens the pool full screen with the Tunas badge; a worker keeps the app's own files (about 380 KB compressed) so it opens on weak signal. Never pool data. A strip at the top says when the phone is offline or a new version is ready (**Refresh** or **Later**; never a reload by itself). **Persona check:** Dale (primary: one tap from the home screen), Rosalie (no change for paper players), Gerald (Refresh keeps everyone on the current version), the Commissioner and Devon (the counter tablet can install it and keeps no phones, payments, or picks), Border (same both sides), Welcome (no install pop-up; a guide page instead), Responsible play (no notifications). **Not proven:** the install itself on a real iPhone and Android phone; Ryan to try both. **Smoke run:** the full run crashed at the counter screens after 54 checks ("Page crashed", memory, as before); the bingo-only run times out at the late-payment step on `main` too, so that's not from this change. 453 unit tests (449 before); `npm run test:a11y` 18 of 18.
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
