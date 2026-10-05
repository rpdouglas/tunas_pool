# PROJECT_PLAN.md — Tunas Pick 'Em

Phases, sprints, acceptance criteria, risks, and open decisions.
Sprint length assumed: **1 week**. Adjust dates when Sprint 0 starts. The current sprint's live status belongs in `docs/ACTIVE_CYCLE.md`.

## 1. Goals and non-goals

**Goals**
- Replace the paper form with a fast, mobile-first entry experience.
- Make payment tracking and weekly results painless for the admin.
- Support seniors and paper players through admin-entered picks, with a path to claim their history later.
- Keep one permanent `playerId` per person so the pool runs year over year.

**Non-goals for v1:** multiple entries per person, phone OTP login, online payments, push notifications, ESPN auto-import, auto-claim by verified email.

## 2. Release strategy

- **Parallel run:** keep the paper and graphic flow going while the site is built. Cut over only when the Phase 1 acceptance test passes with real players.
- **Soft launch:** invite 5 to 10 friendly players first. Admin enters paper picks for everyone else.
- **First full week on the site:** Phase 1 complete, then reassess.
- **Target:** Phase 1 playable by roughly **Week 6 or 7** of the 2026 season. Treat this as a target, not a commitment. Slip to the next week rather than ship a broken lockout or payment flow.

## 3. Phases at a glance

| Phase | Name | Sprints | Outcome |
|---|---|---|---|
| 0 | Foundation | S0 | Repo, emulators, CI, docs, rules skeleton |
| 1 | Playable MVP | S1–S3 | Players enter picks and declare payment. Admin sets up weeks, confirms payment, enters results, publishes the winner |
| 2 | Roster, paper, claims | S4–S5 | Admin enters picks for seniors. Players claim their history with approval |
| 3 | Reveal and standings | S6–S7 | Reveal at lock, leaderboards, season standings, all-time stats |
| 4 | Polish and automation | S8–S9 | Print sheet, reminders, share tools, branding, ESPN suggestions |
| 5 | Season rollover | S10 | New season setup, archive, retrospective |

---

## 4. Sprint plan

### Phase 0 — Foundation

#### Sprint 0: Project setup
- Create repo, Firebase project, Hosting site, and emulator config. (Uses the shared `lilypad-strategy-design` project, site `tunaspool`, database `db-tunaspool`: D-015.)
- Scaffold Vite + React 19 + TypeScript strict + Tailwind v3 + TanStack Query.
- Add `CLAUDE.md` and the `docs/` files from this package. Create `ACTIVE_CYCLE.md` and `DECISIONS.md`.
- Shared types package from `DATA_MODEL.md`.
- Design system foundation: `src/styles/tokens.css`, `src/styles/brand.css`, `tailwind.preset.cjs`, self-hosted fonts (Fontsource), and a dev-only `/styleguide` route with Button, Panel, Section bar, Status badge, and Field. Add an axe accessibility check on `/styleguide` to CI.
- Lint, typecheck, Vitest, and the rules-test harness. CI runs all of them on push.
- Deploy a hello-world to Hosting.
- Write a decision-log entry for every open decision in §7 (use the stated default).

**Acceptance:** `npm run emulators`, `dev`, `test`, `test:rules`, and `typecheck` all run clean. A hello-world is live on Hosting.

### Phase 1 — Playable MVP

#### Sprint 1: Auth, rules, and week data
- Firebase Auth: anonymous by default, email link as the upgrade and recovery path. Friendly "open on another device" screen. Google sign-in moves to Sprint 7 (D-024).
- `linkWithCredential` upgrade flow (email link) and `credential-already-in-use` handling (sign in to the existing account and move the guest data over).
- Admin custom-claim bootstrap script and an admin route guard.
- Implement `firestore.rules` and `storage.rules` from `FIRESTORE_RULES.md` with the full test matrix (rows 1–32 as applicable).
- Admin week setup (draft): paste or edit 14 Sunday games plus MNF, set `lockAt`, preview as a player sees it. Clone from the previous week.
- `adminSetWeekStatus` (draft to open) with audit logging.

**Acceptance:** Rules tests pass. Admin can create a draft week, preview it, and open it. A guest can sign in anonymously and upgrade to an email link without losing their `uid`.

#### Sprint 2: Player entry form
- Design components for the entry flow, built to `DESIGN_SYSTEM.md` §6 and shown in `/styleguide`: Game card, Pick button, sticky Progress bar, Segmented choice, Copy field, Stat tile, `bg-gameday`, and the wordmark lockup.
- Four-section scrolling form: **picks, tiebreaker, info and payment, review and submit**, with a sticky progress bar ("9 of 14 picked").
- Game cards with large tap targets (away | home), tap again to deselect, kickoff times, London game pinned.
- Team names and brand colors, no NFL logos.
- Tiebreaker field with a one-line rule reminder.
- Payment: Cash or e-Transfer, then Will do or Already did. e-Transfer shows the email, the amount, and a copy button, with a "put your name in the message" note.
- Local draft autosave from the first tap.
- Review screen with tap-to-edit. Button reads "N games left" until complete.
- Submit creates the `players/{uid}` profile (if needed), then the entry and the private picks.
- Confirmation screen with lock countdown and "payment pending until confirmed". Returning players see "Edit until Saturday".
- **Confirmation code and receipt:** the confirmation screen shows a short confirmation code, the submission time in America/Toronto, and exactly what was saved. The code changes on every edit (`DATA_MODEL.md` §10, D-026).
- **Server timestamps:** rules require `picksSubmittedAt == request.time` on entry create and update, so submission times can't be backdated. Rules tests first.
- **Weekly home screen** (the landing page, not the form): lock countdown, your status for this week (picks in, payment pending or confirmed, locked) with a clear next action, and a "Make your picks" or "Edit your picks" button. Status uses icon plus text, never color alone, and no red "unpaid" state (`PERSONAS.md` Week 1 rule). Pot, entry count, last winner, and season leader slots are added in later sprints (D-020).
- Locked state: read-only.

**Acceptance:** On a 375px viewport, a new guest goes from the home screen to a submitted entry in under 2 minutes, and the receipt shows a confirmation code and Toronto-time timestamp. Resubmitting edits the same entry. After `lockAt`, the form is read-only and the rules reject writes (verified in the emulator).

#### Sprint 3: Admin payments, results, and winner
- Back Office surface (`DESIGN_SYSTEM.md` §7): admin shell, Payments queue row, and Toast components.
- Admin shell with a payments queue as the home screen: name, phone, declared payment, one-tap **Paid** with undo, filters, and a live pot.
- `adminSetPayment` callable with audit log.
- Entries list with duplicate flags (`getDuplicateFlags`): same phone, same email, same normalized name, and similar names (fuzzy match, for example "Bob Smith" and "Robert Smith", or one typo). Flags only, never auto-block (D-022).
- Week counters `entryCount` and `paidCount`, maintained by an `onEntryWritten` trigger (D-025). Rules test: an admin draft edit cannot set them from the client.
- Home screen gains the live pot (`paidCount × entryFeeCents`) and the number of players entered.
- `lockWeeks` scheduled function: at `lockAt`, set `status='locked'` and `revealed=true`.
- Results screen: tap the winner per game (including "tie"), enter the MNF total.
- `adminEnterResults`, `onResultsWritten` (per-entry wins), and `adminPublishWinner` implementing the scoring and tiebreaker in `DATA_MODEL.md` §7.
- Winner banner and a payout-sent toggle.
- Add functions to the CI `deploy` job once they do real work, and grant the deploy service account the roles functions deploys need. Region `us-central1` (D-028).
- Unit tests for the scoring and tiebreaker, including the paper-sheet example (actual 46: 58 wins over 45), the all-below case, and a split pot.

**Acceptance (Phase 1 gate):** Run a full mock week end to end in the emulator and then in a staging project: 10 or more mixed players, payments confirmed, results entered, winner published with the correct tiebreaker outcome. Admin can do the whole weekly job from a phone.

### Phase 2 — Roster, paper, and claims

#### Sprint 4: Roster and paper-entry mode
- Roster management: add, edit, deactivate, search. Phone normalization.
- "Entering for someone" mode reusing the same entry form, with paper-sheet game order.
- Per-week roster status: entered or not yet.
- Source tag (paper, text, phone) and optional paper photo upload to Storage.
- Create the pool's dedicated Storage bucket, point `firebase.json` and the web config at it, and deploy `storage.rules` to that bucket only (D-029). Never the shared default bucket.
- `adminUpsertEntry` (while open) and `adminLateOverride` (after lock, reason required, visible badge on the entry).
- Mark Paid in the same flow when cash is handed over.
- `adminDeleteEntry` with a reason.

**Acceptance:** Admin transcribes a full paper sheet in about a minute and marks it paid. Late override requires a reason and appears in the audit log and entry badge.

#### Sprint 5: Claims and merges
- Player "I've played before" flow, `requestClaim` callable (rate limited), and "Pending approval" state.
- Admin **Claims** tab with badge count, claimant details, `suggestedPlayerId`, and one-tap Approve or Reject.
- `adminApproveClaim` (link, or merge if the claimant already has a self-serve profile), `adminRejectClaim`, `adminUnlinkClaim`, `adminMergePlayers`.
- One claim per profile. A second request against a claimed profile is flagged, not queued.
- Pending claimants see nothing from the target profile.
- Player history view after approval.
- Rules and function tests for claim abuse cases (typing someone else's name and phone reveals nothing).

**Acceptance:** A roster senior with three weeks of admin-entered history is claimed by a signed-in player. After approval, the history appears in their account immediately. Unlinking restores the previous state. Every step is in the audit log.

### Phase 3 — Reveal and standings

#### Sprint 6: Reveal and weekly leaderboard
- Locked state: everyone's picks revealed in a clean grid.
- Live leaderboard as results are entered, with wins, losses, games remaining, and **best possible record** (current wins plus games still to play), per `DATA_MODEL.md` §10. "Live" means as the admin enters results; live scores need ESPN (Sprint 9, optional).
- **Per-pick marks** on each player's picks: ✔ correct, ✖ wrong, ○ not played yet. Icon plus color, never color alone.
- "Who picked what" per game, with percent of the pool on each side, plus a short post-result line such as "Only 12 of 40 picked the Bears." Never framed as someone being eliminated (`PERSONAS.md` Slump rule).
- Home screen gains last week's winner.
- Winner announcement view in the style of the "Week 3 Winner" banner.
- Results correction after Final re-runs scoring and flags the change.

**Acceptance:** At lock, picks become visible to all within one minute. During the week the leaderboard updates as results are entered. A post-final correction flags the audit log and updates standings.

#### Sprint 7: Season standings and stats
- `seasons/{year}/standings` computed by functions.
- Season standings page, my-history page, and all-time stats per `playerId`.
- **Past weeks:** a week picker that opens any earlier week's reveal view (picks, results, winner, pot, your record). Every week stays viewable forever.
- **Player profiles:** season record, weeks won, win %, best week. Other players see display name and record only; never phone, email, or payment status. No streak stats (D-023). `players/{id}/stats/allTime` is owner and admin only today, so showing it to others needs a rules change with tests (or a public copy written by functions).
- Home screen gains the current season leader.
- **Google sign-in** (redirect flow) as a second upgrade option, now that season standings make an account worth having (D-024).
- Guest-only players appear weekly only, with a "Save your picks and track your season" upgrade prompt.
- Admin reports: weekly pot, payouts, and unpaid entries, with CSV export. Also: participation by week, returning vs. new players, pot history, average weekly score, most-picked team, and biggest upset (the last two reuse the Sprint 6 pick-trend data). Tables first; charts are parked.

**Acceptance:** Standings match a hand-checked spreadsheet for at least three real weeks of data.

### Phase 4 — Polish and automation

#### Sprint 8: Print sheet, reminders, and sharing
- Print-friendly weekly sheet generated from week data, with branding and a claim QR or code, so paper always matches the site.
- **Reminder list for the admin:** who hasn't entered this week (from the roster and recent players) and who hasn't paid, with tap-to-text and tap-to-copy a friendly message. Payment nudges are admin-triggered, never automatic (D-027).
- Saturday reminder email via function, only to players who haven't entered **and** have an email on file (guests have none). SMS only if later approved for cost.
- **"My picks are in" share card:** display name, week, "Picks locked in," and good-luck copy. Before lock it never shows picks; after lock it may show picks and record. Never phone, email, or payment status (`PERSONAS.md` Kayla rule).
- "Share this pool" button with a pre-written group-chat message.
- Branding pass: Ravens palette (`DESIGN_SYSTEM.md`), mascot placement, and empty and loading states.

#### Sprint 9: Hardening
- Accessibility audit (contrast, focus, screen reader labels, large-text mode).
- Performance pass on slow mobile connections. Verify the in-app browser behavior (Facebook and Messenger).
- Optional: ESPN scoreboard as an **admin-approved suggestion** for results, with manual override always winning.
- Backup and export routine for Firestore. Error monitoring.

**Acceptance:** Lighthouse mobile scores of 90 or higher for performance and accessibility. Sign-in works from Facebook and Messenger in-app browsers.

### Phase 5 — Season rollover

#### Sprint 10: Rollover and retro
- New-season setup: copy the roster, reset the weekly data, archive the previous season.
- Review the audit log and dispute handling.
- Retro: update `DECISIONS.md` and re-plan the backlog.

---

## 5. Cross-cutting tasks (every sprint)

- Update `DATA_MODEL.md` and `FIRESTORE_RULES.md` with any schema or rules change.
- Keep rules tests green. Never merge a rules change without a test.
- Update `ACTIVE_CYCLE.md` at the start and end of each sprint.
- Test every new screen at 375px and with large text.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Players enter twice by clearing their browser (new anonymous `uid`) | Duplicate flags on phone and name in admin. Only paid entries count toward the pot. |
| Someone claims another person's history | Admin approval on every claim. Claimants see nothing before approval. |
| "I didn't pick that" disputes | Audit log, optional paper photo, and picks locked and revealed at the deadline. |
| Late entry requests ("add mine, I forgot") | Post-lock changes require an override with a logged reason. |
| Google sign-in fails in embedded browsers | Google waits until Sprint 7. Email link is the primary upgrade path, plus a Sprint 9 check. |
| A guest loses their anonymous login (cleared browser, or Safari removing site data after 7 days without a visit) and can't edit their entry | Email link from Sprint 1 as the recovery path, with a gentle prompt after submit. The admin can still edit via `adminUpsertEntry` while open. Duplicate flags catch a re-entry. |
| Scoring errors on tiebreakers | Scoring is pure, unit-tested code with the paper-sheet example as a fixture. |
| Phone numbers are personal information | Private to the owner and admin, minimal collection, and a short privacy note on the form. |
| Rules or doc drift | Rules tests in CI, and the docs-update requirement in the definition of done. |
| Scope creep during the football season | Park anything not in the current sprint under §8. |
| Regulatory questions about running a pool | See §7, item 1. Settle this before the public launch. |

## 7. Open decisions

Defaults are in bold. Do not guess. Confirm with Ryan, or apply the default and log it in `DECISIONS.md`.

1. **Legal and regulatory check.** Confirm the rules that apply to running a pool with entry fees, especially if payouts are 100% of fees. *Owner: Ryan, ideally with a lawyer. Block the public launch until done.*
2. **Tie game result.** A tied NFL game has no winner. Options: **no one gets a win**, everyone gets a win, or a half win. Affects scoring. *Decided (D-008): no one gets a win.*
3. **Unpaid entries eligible to win?** **No**, only paid entries are eligible. Alternatively, allow ranking but require payment before payout. *Decided (D-009): no.*
4. **Tiebreaker among entries that met or exceeded the total.** **Lowest qualifying prediction (closest) wins.** This matches the paper sheet's example. Please confirm. *Decided (D-010): lowest qualifying prediction.*
5. **Default lock time.** **Saturday 11:59 PM America/Toronto**, editable per week. Games and the London early kickoff on Sunday are covered by this. *Decided (D-011).*
6. **e-Transfer email, instructions, and contact email** for `config/pool`. Pull from the paper sheet (`tunasweeklypool2026@yahoo.com` is the contact), but confirm the e-Transfer address.
7. **Season standings eligibility.** **Players with a claimed or admin-roster profile.** Guest-only players are weekly only.
8. **Pool name and domain.** "Tunas Weekly Football Pool Pick 'Em" in the UI. Choose a domain or use the Firebase default at soft launch. *Decided (D-017): soft launch on `https://tunaspool.web.app`.*
9. **Mascot and artwork.** **Use Tuna recolored to the Ravens palette (purple, black, gold) with all NFL marks removed.** Ask the artwork source for vector or layered originals. See `DESIGN_SYSTEM.md` §10 and §12. Needed by Sprint 2.
11. **Ravens palette details.** **Use the brighter UI gold `#D9AF26` for buttons** (the official `#9E7C0C` fails contrast), and keep Ravens red `#C60C30` for urgency and errors only. See `DESIGN_SYSTEM.md` §1.2 and §12. *Decided (D-006, D-014).*
10. **Typefaces.** **Alfa Slab One, Barlow Condensed, and Barlow** as the closest open match to the sheet. Confirm against the original artwork. Swapping fonts is a token change only. *Decided (D-007).*

## 8. Parked (post-v1 ideas)

- Multiple entries per person per week ("Ryan #2"), via an `entryId` under the player.
- Auto-claim when a verified email matches the roster email (a single config switch).
- Phone OTP login.
- Push notifications.
- ESPN schedule import.
- Survivor or confidence-point side pools.
- Public read-only share page for the weekly winner banner.
- **Hall of Fame** (all-time most weekly wins, highest average, most perfect weeks, most weeks played). Reconsider at Sprint 10, once a full season of data exists. No streak records (D-023). Run "largest pot won" through the Responsible-Play check before including it.
- Charts for the admin statistics (participation graph, pot history graph). Sprint 7 ships tables.

### Considered and rejected

From the October 2026 plan review (D-020). Do not build without a new decision.

- **Pre-lock "most people picked…" hints.** They leak pick information before reveal and let late pickers fade the crowd (D-021).
- **Device fingerprint or IP matching for duplicates.** Privacy-invasive, and it flags every household and every entry the admin makes from their own phone (D-022).
- **Streak stats** (current streak, longest streak). They conflict with the no-streak-pressure rule in `PERSONAS.md` (D-023).
