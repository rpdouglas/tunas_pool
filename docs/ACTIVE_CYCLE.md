# ACTIVE_CYCLE.md

**Sprint 6: Reveal and weekly leaderboard** · Phase 3 (Reveal and standings) · Started: 2026-10-05

## Goal
Once picks lock, every player can see everyone's picks, a leaderboard that fills in as results are entered, how the pool split on each game, and, when the week is final, the winner and exactly how it was decided. A wrong result can be corrected after the winner is published, in the open.

## Persona check
- **Primary persona:** Gerald (Verifiable by Anyone). Secondary: Dale and Jen (what a player sees on Sunday), the Snoop (anti-persona E), the Commissioner (corrections), Kayla (what is safe to screenshot).
- **Gerald Trust Test:** after the lock anyone signed in sees every pick with its submission time, each player's record, and a "Late entry" marker on any entry approved after the lock. The winner view has "How this was decided": the rule in plain words, the Monday night total, each tied player's guess, and the pot as paid entries times the fee. A correction after Final shows a public "Result corrected" note with the time; the reason and the before and after are in the audit log.
- **Snoop test / D-021:** nothing about anyone's picks is read or shown before `revealed`. The week page before the lock says only when picks open up and how many are in. The rules refuse the reads regardless (row 47).
- **Slump rule:** the per-game line talks about the game ("Only 12 of 40 picked the Bears"), never about anyone being out of it. "Best possible" is each player's own ceiling, not a verdict.
- **Privacy test:** no phone, email, or payment status on any player screen. The leaderboard ranks by record only (D-069).
- **Dale Deadline Test:** nothing is added before the lock. After it, the home screen and the picks page each get one button to the week.
- **Commissioner Counter Test:** "Correct a result" is on the Results screen of a final week. It needs a typed reason, says the winner may change, and can be cancelled. A wrong correction is fixed by correcting again.
- **Rosalie Inclusion Test:** a paper entry appears in the standings and the picks like any other. Nothing here needs a login of her own.
- **Border / Responsible-Play:** no money changes hands differently. Weekly framing only: no streaks, no season pressure.

## Tasks
- [x] Shared logic: leaderboard with shared places and best possible record, pick marks, pick share and its plain-words line (`shared/reveal.ts`, 12 tests)
- [x] Function: `adminCorrectResults` (`functions/src/weekActions.ts`), scoring with the same code as publishing; 4 integration tests (winner changes and the payout is cleared, winner unchanged, nothing changed, refusals)
- [x] Rules tests: two new matrix rows (47, 48), 51 rules tests in all. No rule changed
- [x] Player: the week page (`/week/:year/:weekId`) with the winner, "How this was decided", Standings and By game; the latest winner on the home screen; a button to the week from the home screen and the picks page once locked
- [x] Back Office: "Correct a result" on the Results screen for a final week, and the "Result corrected" note
- [x] Styleguide entries for the leaderboard row and the share bar; `test:a11y` passes (18 checks)
- [x] Docs: DATA_MODEL §3.5, §5, §6, §10; FIRESTORE_RULES (rows 47, 48); DESIGN_SYSTEM §6; DECISIONS D-067 to D-070
- [ ] Look at the week page on a real phone with a real week (browser runs are parked, D-066, so no screen here has been opened in a browser)
- [ ] Confirm the provisional decisions D-067 to D-070 with the commissioner

## Acceptance (from PROJECT_PLAN.md)
At lock, picks become visible to all within one minute. During the week the leaderboard updates as results are entered. A post-final correction flags the audit log and updates standings.

## Notes / learned
- **Verified with the fast checks only** (D-066): typecheck, lint, 142 unit tests, 99 rules and function tests in the emulator, the production build, and `test:a11y` on the styleguide. The week page, the home screen's winner banner, and the correction mode have not been opened in a browser. The logic under them is tested; the layout is not.
- "Picks visible within a minute of the lock" rests on the `lockWeeks` scheduler, which was seen locking a week in production on 2026-10-05, and on the picks rule, which opens the reads the moment `revealed` is true.
- "Season standings" do not exist yet (Sprint 7), so "updates standings" here means the week's records and winner.
- A test caught a wrong assumption of mine, not a bug: flipping the Monday night result made the runner-up win outright, because she had picked the other side. The correction test now says so.
- The players' leaderboard and the Back Office standings can disagree at the top when the leader has not paid (D-069). Worth watching for confusion in the first real weeks.
- A leftover emulator from an earlier browser run was still holding port 8080 and made `test:rules` exit without a summary. If it prints no "Tests" line, check the port.

---

## Sprint 5 (released 2026-10-05, PR #21; follow-ups open)

**Sprint 5: Claims and merges** · Phase 2 (Roster, paper, and claims) · Started: 2026-10-05

### Goal
A player who has been entered on paper, by text, or by phone can ask to link that history to their own login, the commissioner approves or rejects it in one tap, and after approval the history shows in the player's account at once. A wrong approval can be undone. Two profiles for the same person can be merged. Asking reveals nothing about anyone's profile.

### Persona check
- **Primary persona:** the Commissioner (Ten Seconds and an Undo) for the Claims tab. Secondary: Bernie and a family member helping Rosalie (the claimant), the Snoop (anti-persona E), the Double-Dipper (anti-persona A), Gerald (proof).
- **Snoop test (anti-persona E):** typing someone else's name and phone gets the same "we'll let the pool know" answer whether or not anyone matches. The claim document the claimant can read holds only what they typed. Matches are worked out for the admin when the Claims tab opens and are never stored where the claimant can read them. A pending or rejected claimant cannot read the profile, its entries' picks, or its payments (rules tests).
- **Rosalie Inclusion Test:** nothing changes for a paper player who never claims. Her roster profile, entries, and history stay exactly as they are, and she is never asked to register. A claim is always someone's own choice.
- **Commissioner Counter Test:** the Claims tab shows a count. Each request shows who is asking, the best match first, and Approve. Approve has an Undo (unlink) when it was a plain link. Reject takes an optional friendly note. A merge names both profiles and says it cannot be undone before it runs.
- **Gerald Trust Test:** every approval, rejection, unlink, and merge is an audited callable with before and after. No claim is ever approved automatically (D-004). A profile already linked to a login cannot be claimed again until it is unlinked.
- **Welcome Test:** the page says in plain words what linking does and that a person at the pool checks every request. A rejection is worded kindly and says what to do next.
- **Dale Deadline Test:** nothing is added to the entry form. The link to the claim page is one quiet line on the home screen.
- **Border Test:** the phone on a claim takes any North American number, and is optional.
- **Privacy test:** the claimant's email and typed phone go to the admin only. Other players never see that a claim exists.
- **Responsible-Play Check:** still one entry per person per week. A merge is refused when both profiles entered the same week, so two entries are never quietly folded into one.

### Tasks
- [x] Shared logic: request validation, who may ask and how often, ranked matches, merge conflicts (`shared/claims.ts`, 13 tests)
- [x] Functions: `requestClaim`, `adminListClaims`, `adminApproveClaim`, `adminRejectClaim`, `adminUnlinkClaim`, `adminMergePlayers` (`functions/src/claims.ts`). No stubs remain. 18 integration tests against the Firestore emulator, including the abuse cases and the acceptance case (three weeks of paper history, claimed, then unlinked back to the same state)
- [x] Rules tests for the claim abuse cases: three new matrix rows (44 to 46), 49 rules tests in all. No rule changed
- [x] Player: "Played before?" page (`/claim`) with save-your-account, pending, rejected, and linked states; "Your history" page (`/history`) with each week's picks; two quiet links on the home screen
- [x] Back Office: Claims tab with a waiting count, the best match already chosen, one-tap link with Undo, reject with an optional note; Unlink and Merge under a roster player's Details; a "Linked" badge on the roster
- [x] Styleguide entry for the claim request card; `test:a11y` passes (18 checks)
- [x] Docs: DATA_MODEL §3.3 and §5, FIRESTORE_RULES (rows 44 to 46), DESIGN_SYSTEM §6, DECISIONS D-060 to D-065, README, CLAUDE.md
- [x] Emulator end-to-end at 375px: `npm run test:e2e:claims` passed all 30 checks on the final code, twice, before the Codespace stopped being able to run browser flows (see the notes)
- [ ] Confirm the provisional decisions D-060 and D-062 to D-065 with the commissioner
- [ ] Try it on the live site in the `2026-test` season, or with a real roster player, after the functions deploy

### Acceptance (from PROJECT_PLAN.md)
A roster senior with three weeks of admin-entered history is claimed by a signed-in player. After approval, the history appears in their account immediately. Unlinking restores the previous state. Every step is in the audit log.

### Notes / learned
- **End-to-end browser runs are parked as a sprint habit** (Ryan, 2026-10-05: they were taking most of the time and getting in the way). This sprint was verified with typecheck, lint, the unit tests, and `npm run test:rules` (rules plus the functions' integration tests). The browser scripts stay in the repo for when they are wanted.
- Why they got in the way: with the emulators, the Vite dev server, and several browser pages open, the 8 GB Codespace runs out of memory and Chromium reports "Page crashed" at a different step each time. The same flow passes when memory is free and fails minutes later with nothing changed. Unchanged `main` behaves the same. None of the crashes was a code problem. `test:e2e:mock-week` got past the lock and results on this branch before crashing at the publish step.
- The first design stored the suggested match on the claim, as the data model said. The claimant can read their own claim, so that would have leaked whether a name and phone are on the roster. Matches are now worked out for the admin on demand (D-061).
- A browser run caught one real bug before the runs were parked: per-call success callbacks on a mutation are dropped when the component unmounts first. A merge removes the player from the roster, so the form closed before its "merged" message could show. Unlink and merge now await the result instead.
- The roster list now reloads every time it opens and once a minute. With the app's 30-second cache, a player who had just entered on the website was missing from the roster.
- With six tabs, the Back Office menu wraps to two lines at 375px. It reads fine; a shorter menu is worth a thought if a seventh tab arrives.
- An entry moved by a merge gets a new confirmation code, because the code is made from the player ID. The audit log's `movedWeeks` is the record.

---

## Sprint 4 (released 2026-10-05, PR #19; follow-ups open)

**Sprint 4: Roster and paper-entry mode** · Phase 2 (Roster, paper, and claims) · Started: 2026-10-05

### Goal
The commissioner keeps a roster of the people who play on paper, by text, or by phone, sees who has and hasn't entered this week, and enters a sheet for someone in about a minute in the paper's own order, marking it paid in the same step. After the lock, an entry can only be added or changed with a typed reason that leaves a badge and an audit entry.

### Persona check
- **Primary persona:** Rosalie (Never Require a Screen), served through the Commissioner (Ten Seconds and an Undo). Secondary: Gerald (proof), Bernie (texted picks), the Late Pick Lobbyist (anti-persona B). Devon's counter role stays out of this sprint (PERSONAS §3.10: post-Sprint 4).
- **Rosalie Inclusion Test:** she never touches a screen, gives no email, and creates no account. Her roster profile needs only a name. Games are entered 1 to 15 in the sheet's order, a blank on the sheet can be saved as a blank, and a photo of the sheet can be kept with the entry. "Did you get mine?" is answered by the roster's Entered / Not yet.
- **Commissioner Counter Test:** find the player by typing part of a name, tap Enter picks, 15 taps, the tiebreaker, Paid cash, Save. Rows and buttons are 48px or more, one-handed at 375px. A half-entered sheet survives an interruption (kept on the device). Wrong picks are fixed by entering again; removing an entry needs a reason.
- **Gerald Trust Test:** every admin entry, late entry, and removal goes through an audited callable with before and after. A late entry needs a typed reason and shows a "Late entry" badge. Late entries stop once the winner is published. A paid entry cannot be removed until the payment is undone, so the pot never changes quietly.
- **Dale Deadline Test:** nothing is added to the player's form. The lock still comes from the server: `adminUpsertEntry` refuses after `lockAt` by the server clock.
- **Border Test (Troy):** roster phones take any North American number. Cash and e-Transfer are equal in the paid step.
- **Welcome / Privacy test:** roster phone numbers and notes are admin-only (the rules already say so), and so is the photo of a sheet. No player screen shows how an entry came in or whether it is paid.
- **Responsible-Play Check:** still one entry per person per week (the entry ID is the player ID), one fee, no tabs.

### Tasks
- [x] Shared logic: admin entry validation, the typed reason, and which callable applies when (`shared/paperEntry.ts`, 15 tests); roster search, Entered / Not yet, the add form, and possible doubles (`src/features/admin/roster/roster.ts`, 10 tests)
- [x] Rules first: a roster profile needs a name and only roster fields; an admin edit can never touch the link, the origin, a merge, or the age confirmation; paper photos are images of 5 MB or less. Four new matrix rows (40 to 43), 46 rules tests in all
- [x] Functions: `adminUpsertEntry`, `adminLateOverride`, `adminDeleteEntry` (`functions/src/adminEntries.ts`), with mark-paid in the same transaction through the same code as the payments queue. 13 integration tests against the Firestore emulator
- [x] Back Office: Roster tab (add, edit, deactivate, search, Entered / Not yet, possible doubles) and the "Entering for" screen (the sheet 1 to 15, source, paid cash or e-Transfer, photo, late reason, remove). The payments queue shows how an entry came in and links to its picks
- [x] Storage in code: the bucket is pinned as a deploy target (`firebase.json`, `.firebaserc`, `shared/config.ts`), photos are shrunk on the phone, and the Storage SDK loads only on the entry screen (the player bundle is unchanged at about 270 KB gzipped)
- [x] Styleguide entries for PickRow, PhotoField, and the roster row; `test:a11y` passes (18 checks)
- [x] Emulator end-to-end at 375px (`npm run test:e2e:paper-entry`, 40 checks). `test:e2e:emulator` still passes
- [x] Docs: DATA_MODEL §3.6 and §5, FIRESTORE_RULES (rules, Storage, rows 40 to 43), DESIGN_SYSTEM §6, DECISIONS D-054 to D-059, README, CLAUDE.md
- [x] Production: the `tunaspool-paper-sheets` bucket is created (US multi-region, uniform access), added to Firebase, and has `storage.rules` deployed to it (2026-10-05, with Ryan's go-ahead; the release matches the file)
- [x] Production: the three new callables are deployed. The merge of PR #19 ran the automatic functions deploy, and it succeeded (2026-10-05)
- [x] Live check by Ryan (2026-10-05): a paper sheet entered on the live site saved with all 14 picks, an `entry.adminUpsert` audit entry, and a photo in the bucket (242 KB after shrinking on the phone)
- [x] The live check's entry (`seedtest-13` in the real `2026` week 1) is removed (2026-10-05): its payment was undone and the entry removed through the audited functions, actor `script:remove-test-entry`. Its test photo is still in the bucket
- [ ] Confirm the provisional decisions D-054 to D-058 with the commissioner
- [ ] The acceptance's "about a minute" with a real sheet and a real thumb (the scripted run takes about 8 seconds: 15 taps, one field, one payment tap, one photo)

### Acceptance (from PROJECT_PLAN.md)
Admin transcribes a full paper sheet in about a minute and marks it paid. Late override requires a reason and appears in the audit log and entry badge.

### Notes / learned
- The Storage emulator refuses a bare `bucket` in `firebase.json` ("Must supply 'target' in Storage configuration"), so the bucket is a deploy target mapped in `.firebaserc` for both the demo project and production (D-058).
- The public entry document carries `source` and `paperPhotoPath`, so any signed-in player could read how an entry came in and the photo's path, though never the photo itself (Storage rules) and no screen shows either. That is the Sprint 0 schema, unchanged here. If the path should be private too, move it to an admin-only document.
- The first browser run caught two 375px overflows that typecheck and the unit tests could not: a fifth Back Office tab pushed "Settings" off the screen, and "Commanders" pushed a pick button out of its column. The tabs are now tighter and wrap; pick rows let a long name wrap.
- An admin edit of a player's own website entry keeps `enteredBy: 'self'`. The audit log, not the entry, says the admin changed it.
- A late entry made after results are in gets its `record` at once, because `onResultsWritten` only fires when results change.
- `test:e2e:mock-week` crashes a browser page at the lock step in this Codespace ("Page crashed", 13 pages open on an 8 GB machine). It does the same on unchanged `main`, so it is the machine, not this sprint. It passed through the payments steps on this branch. The end-to-end scripts now start Chromium with `--disable-dev-shm-usage`, which moved the crash later but did not cure it. Re-run it on a bigger machine before the Phase 1 gate is called closed.
- The project had no Firebase default Storage bucket until 2026-10-05: `lilypad-strategy-design.firebasestorage.app` was created that day, from the console's Storage setup, with Firebase's deny-everything rules. The pool does not use it. The console only offers "Add bucket" after that setup, so the pool's bucket was linked with the `addFirebase` API call instead (README).
- Toasts stay 8 seconds and stack up to three, which covers the bottom of a short screen for a moment after several quick saves. Left alone; worth a look if the commissioner notices.

---

## Sprint 3 (build done; production test run still open)

**Sprint 3: Admin payments, results, and winner** · Phase 1 (Playable MVP) · Started: 2026-10-05

### Goal
The commissioner can run the whole weekly job from a phone: see who has entered and paid (and mark payments in one tap, with undo), have picks lock and reveal on their own, enter the results, check the winner, publish it, and record that the payout was sent. This closes the Phase 1 gate: a full mock week with 10 or more players.

### Persona check
- **Primary persona:** The Commissioner (Ten Seconds and an Undo). Secondary: Gerald (proof), Dale and Jen (what players see), Troy (cross-border payments), Devon (counter work is Sprint 4).
- **Commissioner Counter Test:** the payments queue is the Back Office home screen. Marking paid is one tap with an Undo, in the row and in a toast. Rows are 56px, one-handed in portrait at 375px. Every write that matters (paid or not, results, winner, payout, status changes) goes through an audited callable.
- **Gerald Trust Test:** the winner is shown with a plain "How this was decided" line (most wins, tiebreaker, or split pot) before it is published, and the publish step needs a confirmation that names the winner. The audit log keeps before and after for every change. Lock is enforced by the rules, not just the scheduler.
- **Privacy test (Jen, Rosalie, Kayla):** payment status stays admin-only. Players see only the pot and how many are in. Duplicate flags use neutral wording ("Same phone as Alex R."), never an accusation, and never block anything (D-022).
- **Welcome / Responsible-Play:** the pot is paid entries times $20, one entry per person, no tabs. Unpaid entries cannot win (D-009), and the admin sees who is unpaid before results.
- **Border Test (Troy):** cash and e-Transfer are equal in the queue. An entry with no payment choice yet shows "Hasn't said how they'll pay", and the admin picks cash or e-Transfer when marking paid.
- **Dale Deadline Test:** picks reveal within a minute of the lock (scheduler), and the server rules reject late writes even before it runs.

### Tasks
- [x] Spike: named-database Firestore triggers run in the emulator (they fire, with the right paths); the sandbox proxy workaround is D-049
- [x] Shared scoring: record, tie rule, winner, tiebreaker, split pot (`shared/scoring.ts`, 22 tests incl. the paper-sheet example, the all-below case, a split pot with leftover cents, unpaid entries)
- [x] Shared duplicate flags (phone, email, name, similar name), flags only (`shared/duplicates.ts`)
- [x] Rules and schema first: `record` on entries (function-written), the winner shape, a payout audit action, the `lockWeeks` collection-group index. No rule had to change, but three new rules tests (rows 37-39, 42 in all) now pin the function-written fields down
- [x] Functions: `adminSetPayment`, `adminListEntries`, `lockWeeks`, `onEntryWritten` and `onPaymentWritten` (week counters), `adminEnterResults`, `onResultsWritten`, `adminPreviewWinner`, `adminPublishWinner`, `adminMarkPayout`. Decisions live in small modules that take the database as a parameter; 13 integration tests run them against the Firestore emulator
- [x] Back Office: payments queue as the home screen (filters, search, live pot, duplicate flags, undo), Toast, results screen, winner banner, payout toggle. All new components are in `/styleguide`
- [x] Player home gains the pot and the number of players in
- [x] CI: functions deploy after the site deploy when `functions/`, `shared/`, or `firebase.json` changed (D-041). It failed on the #12 and #14 merges ("We failed to modify the IAM policy for the project"), worked from the manual workflow, and first succeeded on its own with the Sprint 4 merge (PR #19, 2026-10-05)
- [x] Mock week in the emulator with 12 players, an independent check of the winner, and the paper-sheet tiebreak case (`npm run test:e2e:mock-week`, 42 checks at 375px)
- [ ] Production test run in a separate `2026-test` season, then removed with `npm run admin:delete-season -- 2026-test` (D-044), after the functions are deployed (Ryan; steps in the README)
- [x] Ops carried from Sprint 1 and 2: service-account roles, first functions deploy, admin claim, save Pool settings once (Ryan). Checked against production on 2026-10-05: all 21 functions active (manual **Deploy functions** run from `efbad0d`), `lockWeeks` firing every minute, rules and indexes match the repo, one admin claim, `config/pool` saved

### Acceptance (from PROJECT_PLAN.md)
Run a full mock week end to end in the emulator and then in production under a test season: 10 or more mixed players, payments confirmed, results entered, winner published with the correct tiebreaker outcome. Admin can do the whole weekly job from a phone.

### Notes / learned
- The mock week caught a real bug the integration tests could not: the browser's callable layer sends an omitted field as `null`, and the server only accepted `undefined`, so every plain "Paid" tap was rejected. Fixed by `parsePaymentRequest` (tested). Check any new callable's optional fields the same way.
- **Corrections after Final are not possible yet** (D-047, Sprint 6). Until then the publish step shows the winner, asks for confirmation, and refuses if the winner changed since the admin looked. If a wrong result is published anyway, the fix is by hand in the Firebase console, so check results before publishing.
- Firestore triggers cannot be tested with the sandbox's default proxy; see D-049. The scheduler (`lockWeeks`) cannot run in the emulator at all (no Pub/Sub emulator here), so its logic is covered by the integration tests instead and the schedule itself is verified after the first deploy.
- The queue loads in one call (`adminListEntries`) and refreshes every minute; marking paid updates the screen at once and rolls back if the server refuses. At about 100 entries that is roughly 200 reads per refresh, which is fine for now; revisit with real traffic.
- Payments with no declared method show "Hasn't said how they'll pay" with Paid cash and Paid e-Transfer buttons. Creating that payment from the admin is audited like any other.
- The three-across Pot / Paid / Unpaid tiles use a compact StatTile so they fit at 375px.
- **The first production deploy of Sprint 3 failed** and deployed nothing (so production stayed on Sprint 2): the web build (`npm run build`) typechecks the functions' tests through `tsconfig.json`, but the `deploy` job installed only the root dependencies, while `verify` installs both. Fixed by installing `functions/` dependencies before the build in the deploy job. Any job that runs the web build needs both installs; the README's local setup already says so. Reproduced locally by hiding `functions/node_modules`, and the fix checked in a clean copy of the repo.
- **The first real week could not be opened**: week 5 has 13 Sunday games (two byes and a Thursday game), and the week check insisted on exactly 14. A week now opens with 1 to 14 Sunday games plus Monday night (D-050). Every test sheet had been a full 15, so nothing caught it; `shared/weeks.test.ts` now covers a short week.
- **Schedule suggestion added mid-sprint** (D-051, was parked): typing 14 matchups by hand each week was the slowest part of setup. The feed refuses a date range, so Sunday and Monday are fetched separately. `npm run test:e2e:emulator` stubs the feed (checks B2a, B2b).

- **A rules test failed at random in CI** (PR #16, a docs-only change): row 34 sent `Timestamp.now()` and expected the rules to refuse it, but a phone time that lands in the same millisecond as `request.time` is accepted, correctly. The "phone made it up" cases in rows 34 and 35 now send a time a minute old. The cause was read from the test and the rule, not reproduced.

- **A finished week can be seeded in a test season** (`npm run admin:seed-test-week`, README): 25 made-up players, real games, the weekly job run with the functions' own code. Used on 2026-10-05 to put a finished week in production's `2026-test`; the deployed `lockWeeks` scheduler locked it, its first lock in production. It is not the production test run above (nobody used the real screens). Lesson: a script that runs the functions' code must load the Admin SDK from `functions/`, or server timestamps made by one copy are refused by the other.

---
- **Brand artwork added between sprints** (D-052, D-053, `docs/BRAND_ASSETS.md`): checkerboards cut out of the three supplied logos, web-sized WebPs, favicon, iPhone icon and a link-preview image built by `scripts/brand/build-assets.sh`, then used on Home (hero, empty state, footer), the 404 page, a faint watermark on the Game Day background, and `/styleguide`. Lesson: the cut-out step must not remove enclosed light patches on the wordmark (it deleted the white PICK EM lettering), so that pass is helmet-only. Another lesson: a change to `firebase.json` triggers a functions redeploy in CI, so the image cache-header tweak was left out.

## Sprint 2 (closed 2026-10-05)

**Sprint 2: Player entry form** · Phase 1 (Playable MVP) · Started: 2026-10-05 · **Closed: 2026-10-05** (PR #8)

### Goal
A guest opens the site, sees this week at a glance, makes 15 picks and a tiebreaker, says how they'll pay, and submits in under two minutes on a phone. They get a receipt with a confirmation code, can edit until the lock, and see their picks read-only after it.

### Persona check
- **Primary persona:** Dale (the regular, last 20 minutes before lock). Secondary: Jen (first-timer), Bernie (guest), Troy (NY side), Gerald (proof), Kayla (screenshots).
- **Dale Deadline Test:** picks save on the device from the first tap; the sticky bar says how many are left and jumps to the next one; payment never blocks submit; a failed save says so loudly and offers a retry; the countdown turns red under an hour.
- **Welcome Test (Jen):** a collapsible "How it works" in plain words, the tiebreaker explained with the sheet's own example, "Payment pending" in neutral gold, never red.
- **Border Test (Troy):** any North American phone number, amounts shown as "$20" with no conversion, cash and e-Transfer both first-class.
- **Gerald Trust Test:** the receipt shows exactly what was saved, the server's submission time in Toronto time, and a confirmation code that changes on every edit (D-026). The server stamps the time, not the phone.
- **Privacy test (Jen, Rosalie, Kayla):** other players can't see anyone's payment method or status (D-036). Phone numbers stay private. The name other players see defaults to first name and last initial.
- **Rosalie Inclusion Test:** nothing here replaces paper; admin paper entry is Sprint 4.
- **Responsible-Play Check:** one entry, one fee; an "I'm 18 or older" confirmation (D-037). No streaks, odds, or spreads.
- **Commissioner Counter Test:** the e-Transfer address is set once in Pool settings, not in code.

### Tasks
- [x] Rules first: payment moves to a private `payment/current` document; the server stamps `picksSubmittedAt` and picks `updatedAt`; `ageAttestedAt` on profiles; players can list open, locked, and final weeks (39 rules tests; matrix rows 12b, 33–36)
- [x] Shared logic: phone normalizing (+1), confirmation code, countdown text
- [x] Components in `/styleguide`: sticky progress bar, segmented choice, copy field, stat tile, countdown, wordmark lockup, checkbox (game card correct/missed states wait for results in Sprint 6)
- [x] Weekly home screen: countdown, your status, next action
- [x] Four-section entry form: picks, tiebreaker, your info and payment, review and submit; draft saved on the device from the first tap
- [x] Submit: profile (found by query, created if needed), entry, payment, and picks; resubmitting edits the same entry. Payment choice is optional at submit (Dale rule)
- [x] Receipt: confirmation code, Toronto submission time, what was saved, countdown, "Edit until …"
- [x] Locked state: read-only picks
- [x] Admin Pool settings: e-Transfer address and contact email (`config/pool`)
- [x] Emulator end-to-end at 375px (`npm run test:e2e:emulator`, 51 checks). The scripted entry takes about 3 seconds and 15 taps plus 4 fields; the 2-minute target still needs a real person on a real phone at the soft launch
- [→] Ops carried from Sprint 1: deploy service account roles, run **Deploy functions**, grant the admin claim in production (Ryan)

### Acceptance (from PROJECT_PLAN.md)
On a 375px viewport, a new guest goes from the home screen to a submitted entry in under 2 minutes, and the receipt shows a confirmation code and Toronto-time timestamp. Resubmitting edits the same entry. After `lockAt`, the form is read-only and the rules reject writes (verified in the emulator).

### Notes / learned
- Payment choice is optional at submit, so `payment/current` can be missing until the player picks cash or e-Transfer. Sprint 3's payments queue must show "not said yet" for those entries.
- The end-to-end screenshots caught error messages that stayed on screen after the field was fixed. Fixed: a field's error clears as soon as it changes.
- The player bundle is about 268 KB gzipped, almost all Firebase SDK. Admin screens and the styleguide now load on demand. Revisit in the Sprint 9 performance pass (Lighthouse 90 on slow mobile).

---

## Sprint 1 (closed 2026-10-05)

**Sprint 1: Auth, rules, and week data** · Phase 1 (Playable MVP) · Started: 2026-10-05 · **Closed: 2026-10-05** (PR #7)

### Goal
Guests sign in invisibly and can save their account with an email link. Rules are fully tested. The admin can build a draft week, preview it as a player sees it, and open it.

### Persona check
- **Primary persona:** The Commissioner (week setup) and Bernie / Dale (guest sign-in).
- **Commissioner Counter Test:** set up a week by pasting the matchups, or by cloning last week's settings; preview; open in one tap. Opening is undoable (back to draft) until the first entry arrives. Every status change is audit logged. Admin screens keep 48px targets and work one-handed at 375px.
- **Dale Deadline Test / Bernie:** no account wall. Guests are signed in anonymously without seeing anything. Saving an account is optional and offered, never required (PERSONAS: account upgrade after submit).
- **Welcome Test:** the email-link screens say what will happen in plain words ("We'll email you a link. Tap it on this phone."), and the other-device screen explains how to finish without jargon.
- **Gerald Trust Test:** opening, re-drafting, and locking a week are audit logged with before and after values. Players cannot read a draft week.
- **Rosalie / Border / Responsible-Play / Privacy:** no player-facing payment or ranking features in this sprint. Email addresses are private to the owner and admin.

### Tasks
- [x] Rules: complete the test matrix in FIRESTORE_RULES §5 (rows 1–32, including Storage): 34 tests. Fixed two gaps the new rows found: a new draft week could start `revealed: true` or with counters set, and a login couldn't query for its own profile (D-034)
- [x] Auth: anonymous by default, email link as the upgrade path, "open on another device" screen (`/account`, `/auth/finish`)
- [x] `linkWithCredential` upgrade and `credential-already-in-use` handling: `adoptGuestProfile` callable (D-033)
- [x] Admin route guard on the `admin` custom claim, with email-link admin sign-in and a "Check again" token refresh
- [x] Admin week setup (draft): paste or edit 14 Sunday games plus MNF, set `lockAt`, preview as a player, clone from the previous week (D-031)
- [x] `adminSetWeekStatus` (draft to open, back to draft, lock early) with audit logging (D-032)
- [x] Styleguide entries for every new component (GameCard, TextAreaField); `test:a11y` now also covers `/account`, `/auth/finish`, and the `/admin` sign-in gate
- [x] End-to-end check in the emulator (`npm run test:e2e:emulator`, 29 checks at 375px); docs updated
- [x] Manual **Deploy functions** workflow (`workflow_dispatch`, `main` only, codebase `tunaspool` only) (D-035)
- [→] Give the deploy service account the roles it needs (Cloud Functions Admin, Service Account User, Cloud Scheduler Admin, and Artifact Registry Administrator), then run **Deploy functions** after this sprint merges. Until then "Open week" and the guest move fail in production
- [→] Grant the admin claim in production (README, Firebase setup step 6)

### Acceptance (from PROJECT_PLAN.md)
Rules tests pass. Admin can create a draft week, preview it, and open it. A guest can sign in anonymously and upgrade to an email link without losing their `uid`.

### Notes / learned
- The end-to-end run caught two bugs unit tests missed: on a Sunday, "set up next week" defaulted to the Sunday already being played, and the "saved" message vanished when the editor moved from `/new` to the week's own address.
- In the Auth emulator, a failed `linkWithCredential` with an email link uses up the link's one-time code. The app sends a fresh link and the second one finishes the move. Confirm the same in production during the soft launch.
- The emulator UI download is blocked in the cloud sandbox. Start the emulators with the UI disabled there (a temporary config with `"ui": { "enabled": false }`).
- Builds without web config fall back to the emulator-only demo project so `/styleguide` and the sign-in pages render for the accessibility checks.

---

## Sprint 0 (closed 2026-10-05)

**Sprint 0: Project setup** · Phase 0 (Foundation) · Started: October 2026 · **Closed: 2026-10-05**

### Goal
Repo, emulators, CI, docs, rules skeleton, and the design system foundation running end to end.

### Tasks
- [x] Scaffold Vite + React 19 + TypeScript strict + Tailwind v3 + TanStack Query (`scaffold.sh`)
- [x] Docs in place: CLAUDE.md, DATA_MODEL, FIRESTORE_RULES, DESIGN_SYSTEM, PERSONAS, PROJECT_PLAN
- [x] Design tokens, brand CSS, Tailwind preset, self-hosted fonts (Fontsource)
- [x] `/styleguide` route: Button, Panel, SectionBar, StatusBadge, Field, pick button
- [x] Shared types package from DATA_MODEL (`shared/types.ts`)
- [x] `firestore.rules` + `storage.rules` extracted from FIRESTORE_RULES.md
- [x] Starter rules tests (matrix rows 1, 2, 4, 5, 9, 10, 12, 17, 20-23, 25, 26, 31)
- [x] Cloud Functions stubs for every callable in DATA_MODEL §5
- [x] CI workflow (typecheck, lint, unit tests, rules tests, build)
- [x] Firebase project chosen: shared `lilypad-strategy-design`, Hosting site `tunaspool`, Firestore database `db-tunaspool` in `nam5` (D-015, D-016)
- [x] Pin project alias `prod`, Hosting site, named database, and functions codebase in `.firebaserc` / `firebase.json`; `FIRESTORE_DATABASE_ID` in `shared/config.ts`
- [x] Enable Auth providers (Anonymous, Google, Email link) and add `tunaspool.web.app` to authorized domains
- [x] `firebase login`, add a Web app (`tunaspoolwebapp`), fill `.env.local`, deploy hello-world to Hosting (`--project prod`): live at https://tunaspool.web.app
- [x] Deploy `firestore:rules` and `firestore:indexes` to `db-tunaspool` (verified: release `cloud.firestore/db-tunaspool`; the `(default)` release was not touched)
- [x] Automatic deploy on merge to `main`: Hosting, Firestore rules, Firestore indexes (D-019)
- [→] Add functions to the deploy job once they are implemented: moved to Sprint 3, when the first functions do real work. Region decided (D-028)
- [x] Decide the functions region and the Storage bucket approach: `us-central1` for all functions (D-028), dedicated bucket created in Sprint 4 (D-029)
- [x] Confirm `npm run test:rules` passes in the Codespace (needs Java 21+; first run downloads the emulator)
- [x] Add an axe accessibility check against `/styleguide` in CI: `npm run test:a11y` (Playwright, WCAG 2.2 AA, 375px and desktop; D-030)
- [x] Verify fonts render (Alfa Slab One, Barlow Condensed, Barlow) and check the styleguide at 375px: checked by eye and now asserted in `test:a11y`
- [→] Obtain the Tuna mascot artwork (Ravens palette, no NFL marks): DESIGN_SYSTEM §10. Carried over; needed by Sprint 2 (Ryan)
- [x] Confirm the provisional decisions with the commissioner: D-006 to D-011 and D-014 accepted. Items with no default yet (legal check, e-Transfer address, US-side payments, age attestation, Spec Impact Log) stay open in DECISIONS.md

### Acceptance
`npm run emulators`, `dev`, `test`, `test:rules`, and `typecheck` all run clean. A hello-world is live on Hosting.

### Notes / learned
- The production project is shared with other apps. A bare `firebase deploy`, or one without the `site` / `database` pins, would overwrite their Hosting site, `(default)` Firestore rules, or Storage rules.
- Nothing imports `src/lib/firebase.ts` yet, so the production bundle carries no Firebase config. The first real check of `.env.local` and the named database comes with the first feature that reads Firestore.
- `firebase-tools` 15 will not start the emulators on Java older than 21. CI and the devcontainer were pinned to 17, which failed `test:rules` in CI; both are now 21.
- 2026-10-05: an external plan review was triaged into PROJECT_PLAN (D-020 to D-027). Sprint 1 loses Google sign-in (now Sprint 7). Sprint 2 gains the weekly home screen, confirmation code, and a server-timestamp rule. Sprint 3 gains the week counters and wider duplicate flags. Sprint 0 scope is unchanged. The Sprint 0 Google provider setup stays; it is used in Sprint 7.
- The axe check runs on a production build with `VITE_ENABLE_STYLEGUIDE=true`, so it sees the same CSS players get. In cloud sessions, point Playwright at the preinstalled browser with `PW_CHROMIUM_PATH`; CI installs its own.
- `FUNCTIONS_REGION` lives in `shared/config.ts`. The functions build compiles `shared/` into `functions/lib/shared`, so functions import it directly.
