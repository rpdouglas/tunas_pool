# ACTIVE_CYCLE.md

**Sprint 3: Admin payments, results, and winner** · Phase 1 (Playable MVP) · Started: 2026-10-05

## Goal
The commissioner can run the whole weekly job from a phone: see who has entered and paid (and mark payments in one tap, with undo), have picks lock and reveal on their own, enter the results, check the winner, publish it, and record that the payout was sent. This closes the Phase 1 gate: a full mock week with 10 or more players.

## Persona check
- **Primary persona:** The Commissioner (Ten Seconds and an Undo). Secondary: Gerald (proof), Dale and Jen (what players see), Troy (cross-border payments), Devon (counter work is Sprint 4).
- **Commissioner Counter Test:** the payments queue is the Back Office home screen. Marking paid is one tap with an Undo, in the row and in a toast. Rows are 56px, one-handed in portrait at 375px. Every write that matters (paid or not, results, winner, payout, status changes) goes through an audited callable.
- **Gerald Trust Test:** the winner is shown with a plain "How this was decided" line (most wins, tiebreaker, or split pot) before it is published, and the publish step needs a confirmation that names the winner. The audit log keeps before and after for every change. Lock is enforced by the rules, not just the scheduler.
- **Privacy test (Jen, Rosalie, Kayla):** payment status stays admin-only. Players see only the pot and how many are in. Duplicate flags use neutral wording ("Same phone as Alex R."), never an accusation, and never block anything (D-022).
- **Welcome / Responsible-Play:** the pot is paid entries times $20, one entry per person, no tabs. Unpaid entries cannot win (D-009), and the admin sees who is unpaid before results.
- **Border Test (Troy):** cash and e-Transfer are equal in the queue. An entry with no payment choice yet shows "Hasn't said how they'll pay", and the admin picks cash or e-Transfer when marking paid.
- **Dale Deadline Test:** picks reveal within a minute of the lock (scheduler), and the server rules reject late writes even before it runs.

## Tasks
- [x] Spike: named-database Firestore triggers run in the emulator (they fire, with the right paths); the sandbox proxy workaround is D-049
- [x] Shared scoring: record, tie rule, winner, tiebreaker, split pot (`shared/scoring.ts`, 22 tests incl. the paper-sheet example, the all-below case, a split pot with leftover cents, unpaid entries)
- [x] Shared duplicate flags (phone, email, name, similar name), flags only (`shared/duplicates.ts`)
- [x] Rules and schema first: `record` on entries (function-written), the winner shape, a payout audit action, the `lockWeeks` collection-group index. No rule had to change, but three new rules tests (rows 37-39, 42 in all) now pin the function-written fields down
- [x] Functions: `adminSetPayment`, `adminListEntries`, `lockWeeks`, `onEntryWritten` and `onPaymentWritten` (week counters), `adminEnterResults`, `onResultsWritten`, `adminPreviewWinner`, `adminPublishWinner`, `adminMarkPayout`. Decisions live in small modules that take the database as a parameter; 13 integration tests run them against the Firestore emulator
- [x] Back Office: payments queue as the home screen (filters, search, live pot, duplicate flags, undo), Toast, results screen, winner banner, payout toggle. All new components are in `/styleguide`
- [x] Player home gains the pot and the number of players in
- [x] CI: functions deploy after the site deploy when `functions/`, `shared/`, or `firebase.json` changed (D-041). Not yet exercised: it needs the service-account roles (README)
- [x] Mock week in the emulator with 12 players, an independent check of the winner, and the paper-sheet tiebreak case (`npm run test:e2e:mock-week`, 42 checks at 375px)
- [ ] Production test run in a separate `2026-test` season, then removed with `npm run admin:delete-season -- 2026-test` (D-044), after the functions are deployed (Ryan; steps in the README)
- [ ] Ops carried from Sprint 1 and 2: service-account roles, first functions deploy, admin claim, save Pool settings once (Ryan)

## Acceptance (from PROJECT_PLAN.md)
Run a full mock week end to end in the emulator and then in production under a test season: 10 or more mixed players, payments confirmed, results entered, winner published with the correct tiebreaker outcome. Admin can do the whole weekly job from a phone.

## Notes / learned
- The mock week caught a real bug the integration tests could not: the browser's callable layer sends an omitted field as `null`, and the server only accepted `undefined`, so every plain "Paid" tap was rejected. Fixed by `parsePaymentRequest` (tested). Check any new callable's optional fields the same way.
- **Corrections after Final are not possible yet** (D-047, Sprint 6). Until then the publish step shows the winner, asks for confirmation, and refuses if the winner changed since the admin looked. If a wrong result is published anyway, the fix is by hand in the Firebase console, so check results before publishing.
- Firestore triggers cannot be tested with the sandbox's default proxy; see D-049. The scheduler (`lockWeeks`) cannot run in the emulator at all (no Pub/Sub emulator here), so its logic is covered by the integration tests instead and the schedule itself is verified after the first deploy.
- The queue loads in one call (`adminListEntries`) and refreshes every minute; marking paid updates the screen at once and rolls back if the server refuses. At about 100 entries that is roughly 200 reads per refresh, which is fine for now; revisit with real traffic.
- Payments with no declared method show "Hasn't said how they'll pay" with Paid cash and Paid e-Transfer buttons. Creating that payment from the admin is audited like any other.
- The three-across Pot / Paid / Unpaid tiles use a compact StatTile so they fit at 375px.
- **The first production deploy of Sprint 3 failed** and deployed nothing (so production stayed on Sprint 2): the web build (`npm run build`) typechecks the functions' tests through `tsconfig.json`, but the `deploy` job installed only the root dependencies, while `verify` installs both. Fixed by installing `functions/` dependencies before the build in the deploy job. Any job that runs the web build needs both installs; the README's local setup already says so. Reproduced locally by hiding `functions/node_modules`, and the fix checked in a clean copy of the repo.
- **The first real week could not be opened**: week 5 has 13 Sunday games (two byes and a Thursday game), and the week check insisted on exactly 14. A week now opens with 1 to 14 Sunday games plus Monday night (D-050). Every test sheet had been a full 15, so nothing caught it; `shared/weeks.test.ts` now covers a short week.
- **Schedule suggestion added mid-sprint** (D-051, was parked): typing 14 matchups by hand each week was the slowest part of setup. The feed refuses a date range, so Sunday and Monday are fetched separately. `npm run test:e2e:emulator` stubs the feed (checks B2a, B2b).

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
