# DATA_MODEL.md — Tunas Pick 'Em

Source of truth for Firestore collections, field shapes, enums, scoring, and Cloud Function contracts.
Update this file in the same commit as any schema change.

**Where it lives:** every collection below is in the named Firestore database **`db-tunaspool`** (location `nam5`) of the shared project `lilypad-strategy-design`, never in `(default)`. Code gets the ID from `FIRESTORE_DATABASE_ID` in `shared/config.ts`. See `DECISIONS.md` D-015, D-016, D-018.

---

## 1. Identity model

| Concept | Meaning |
|---|---|
| `uid` | Firebase Auth user (anonymous, Google, or email link). A login, not an identity. |
| `playerId` | Permanent identity of a person in the pool. All entries, stats, and standings hang off it. |
| `claimedByUid` | The `uid` linked to a `playerId`. `null` for roster profiles nobody has claimed. |

**Two ways a `playerId` is created**

1. **Self-serve:** `playerId == uid` of the first login that submits an entry. Created by the client, so rules can enforce one self-serve profile per login.
2. **Admin roster:** an auto-generated ID. `claimedByUid` starts `null`. Used for seniors and paper players.

When a guest upgrades with `linkWithCredential`, the `uid` is unchanged, so nothing moves.

**Guest saves with an email that already has an account:** the client signs in to that account and calls `adoptGuestProfile`, which re-points the guest's profile to the account's `uid`. Nothing is copied. See §5.

**Claim and merge:** if a player who already has a self-serve profile is approved to claim a roster profile, a function **merges** the two by repointing entries and stats to the roster `playerId`, then sets `claimedByUid` and `mergedInto` on the old profile (audit logged). If they have no existing profile, the claim is just a link.

---

## 2. Collection map

```
players/{playerId}
  stats/allTime                              (function-written)
claims/{claimId}
seasons/{year}
  weeks/{weekId}
    entries/{playerId}                       (one per person per week)
      payment/current                        (owner + admin only, never revealed)
      private/picks                          (hidden until revealed)
  standings/{playerId}                       (function-written)
config/pool                                  (admin-written settings)
auditLog/{logId}                             (function-written)
```

`year` is a string such as `"2026"`. `weekId` is `"wk04"`, zero-padded.

Storage: `paperSheets/{year}/{weekId}/{playerId}.jpg`, admin only.

---

## 3. Documents

### 3.1 `players/{playerId}`

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | Shown on leaderboards. Defaults to first name and last initial; a nickname is fine (D-038). |
| `phone` | string \| null | Private, optional. Any North American number, normalized to E.164 (`+1613...`) by `shared/phone.ts`. Used for duplicate flags. |
| `email` | string \| null | Private. Optional. |
| `claimedByUid` | string \| null | Client can never change this. |
| `origin` | `'self' \| 'admin'` | How the profile was created. |
| `usualPayment` | `PaymentMethod \| null` | Roster convenience for admin entry, and the form's default. |
| `ageAttestedAt` | Timestamp \| null | Server time the player confirmed "I'm 18 or older" (D-037). Asked once. |
| `notes` | string \| null | Admin-only notes. Never shown to players. |
| `mergedInto` | string \| null | Set if this profile was merged into another. |
| `active` | boolean | Carries across seasons. |
| `createdAt` / `updatedAt` | Timestamp | |

### 3.2 `players/{playerId}/stats/allTime` (function-written)

`weeksPlayed`, `wins` (correct picks), `losses`, `weeklyTitles`, `bestWeekRecord`, `lastPlayedWeek`, `updatedAt`.

Written by `recomputeAllTime` for every player with an entry in a final week of a real season, guests included. Test seasons (`-test`) never count. Readable by the player and the admin only; other players see a player's season line through the standings (§3.8).

### 3.3 `claims/{claimId}`

| Field | Type | Notes |
|---|---|---|
| `requesterUid` | string | The login that asked. Written by `requestClaim`; clients cannot create claims. |
| `requesterEmail` | string \| null | From the auth token, for the admin to see. |
| `claimedName` | string | What the player typed. |
| `claimedPhone` | string \| null | What the player typed, normalized to E.164. Null when left blank. |
| `status` | `'pending' \| 'approved' \| 'rejected'` | Client creates only `'pending'`. |
| `suggestedPlayerId` | null | Always null. The claimant can read this document, so the match is never stored: `adminListClaims` works it out for the admin each time (D-061). |
| `resolvedPlayerId` | string \| null | Set on approval. Cleared if the link is undone. |
| `decidedBy` / `decidedAt` / `decisionNote` | string / Timestamp / string | Function-written. The note is optional, up to 200 characters, and the claimant sees it with a rejection. |
| `createdAt` | Timestamp | |

A claim never exposes the matched profile to the claimant: the document holds only what they typed and the decision. Only the admin sees the likely matches, through `adminListClaims`. A player reads their own claims with `where('requesterUid', '==', uid)`.

### 3.4 `seasons/{year}`

`year`, `status` (`'active' | 'archived'`), `entryFeeCents` (default 2000), `createdAt`.

### 3.5 `seasons/{year}/weeks/{weekId}`

| Field | Type | Notes |
|---|---|---|
| `weekNumber` | number | NFL week number. |
| `status` | `'draft' \| 'open' \| 'locked' \| 'final'` | See §6. |
| `lockAt` | Timestamp | Players cannot write at or after this time. |
| `revealed` | boolean | Function flips to `true` at lock. Unlocks picks for everyone. |
| `games` | `Game[]` | Up to 14 Sunday games + MNF, ordered. Short weeks (byes, Thursday or Saturday games) have fewer (D-050). See below. |
| `mnfGameId` | string | The game whose total points is the tiebreaker. |
| `results` | `Record<gameId, 'home' \| 'away' \| 'tie'>` | Admin, via callable. |
| `mnfTotal` | number \| null | Actual combined MNF points. |
| `entryFeeCents` | number | Snapshotted from the season at week creation. |
| `entryCount` | number | Function-written (`onEntryWritten`). Entries this week. Starts at 0. For display; recounted, never incremented (D-048). |
| `paidCount` | number | Function-written (`onPaymentWritten`). Entries with `paymentStatus == 'paid'`. Displayed pot = `paidCount × entryFeeCents`. Starts at 0. The published pot is recounted at publish time (D-046). |
| `winner` | `WeekWinner \| null` | Function-written when published. |
| `payoutSent` | boolean | Admin records that the winner was paid (`adminMarkPayout`). Who and when are in the audit log (D-042). |
| `correctedAt` | Timestamp \| absent | Function-written by `adminCorrectResults` when a result is corrected after Final. Players see a "Result corrected" note with this time; the reason stays in the audit log. |
| `backfilled` | boolean \| absent | Set by script only, never by a client (D-071). The week was set up after it was played, to bring earlier paper weeks onto the site. While it is `locked`, `adminUpsertEntry` accepts its sheets as normal entries. Players see a note on the week page saying its picks were entered from the paper sheets afterwards. |
| `createdAt` / `updatedAt` | Timestamp | |

```ts
type Game = {
  id: string;            // "g01".."g14", "mnf"
  order: number;         // 1..15, matches the paper sheet order
  away: string;          // "Colts"
  home: string;          // "Commanders"
  venueNote?: string;    // "London"
  kickoff: Timestamp;
  slot: 'sunday' | 'mnf';
};

type WeekWinner = {
  playerIds: string[];       // more than one = split pot
  displayNames: string[];    // denormalized for banners
  record: { wins: number; losses: number };
  mnfPrediction: number | null; // winning tiebreaker guess, shown as "(38 points)"
  decision: 'most_wins' | 'tiebreaker' | 'split_pot'; // how it was decided
  tiedPlayerIds: string[];   // who tied for the most wins before the tiebreaker
  potCents: number;          // paid entries x entry fee, counted at publish time
  shareCents: number;        // each winner's share, rounded down
  leftoverCents: number;     // cents that did not divide evenly, shown to the admin
  publishedAt: Timestamp;
};
```

### 3.6 `seasons/{year}/weeks/{weekId}/entries/{playerId}`

Public document, readable by every signed-in player. **No picks, no tiebreaker, no phone, no payment** (D-036).

| Field | Type | Notes |
|---|---|---|
| `playerId` | string | Must equal the document ID. |
| `displayName` | string | Denormalized for leaderboards. |
| `enteredBy` | `'self' \| 'admin'` | Who first entered it. An admin edit of a player's own entry leaves it `'self'`; the audit log has the edit. |
| `source` | `'web' \| 'paper' \| 'text' \| 'phone'` | |
| `paperPhotoPath` | string \| null | Storage path of the sheet's photo in the pool's own bucket (`paperSheets/{year}/{weekId}/…`). Only an admin can open the file. Set by `adminUpsertEntry`. |
| `lateOverride` | `{ reason: string; by: string; at: Timestamp } \| null` | Set only by `adminLateOverride`. Shown as a "Late entry" badge. |
| `picksSubmittedAt` | Timestamp | Server time of the latest submit or edit (rules require `request.time`, D-040). Basis of the confirmation code (§10). |
| `record` | `{ wins, losses }` | **Function-written** (`onResultsWritten`, and again at publish). The entry's record so far, so leaderboards need no one's picks. Absent until results exist. Never client-writable. |
| `createdAt` / `updatedAt` | Timestamp | |

### 3.6b `.../entries/{playerId}/payment/current`

Private to the owner and admin, before and after the reveal (D-036). Absent until the player says how they'll pay: payment never blocks an entry, so an entry can be submitted first and the payment choice added in a later edit.

| Field | Type | Notes |
|---|---|---|
| `paymentMethod` | `'cash' \| 'etransfer'` | Player-declared; editable while open. |
| `paymentIntent` | `'will_do' \| 'already_did'` | Player-declared; editable while open. |
| `paymentStatus` | `'unpaid' \| 'paid'` | **Admin only, via `adminSetPayment`.** Only `paid` counts toward the pot. |
| `paidAt` / `paidBy` | Timestamp / string | Function-written. |
| `updatedAt` | Timestamp | |

### 3.7 `.../entries/{playerId}/private/picks`

| Field | Type | Notes |
|---|---|---|
| `picks` | `Record<gameId, 'home' \| 'away'>` | Up to 15 keys. |
| `tiebreakerTotal` | number | MNF predicted combined points, a whole number from 0 to 200. |
| `updatedAt` | Timestamp | Server time (D-040). |

Readable by the owner and admin. Readable by everyone once `week.revealed == true`.

### 3.8 `seasons/{year}/standings/{playerId}` (function-written)

`displayName`, `weeksPlayed`, `wins`, `losses`, `weeklyTitles`, `weekRecords: Record<weekId, {wins, losses}>`, `updatedAt`.

- **Only final weeks count.** A week in progress is on the week page, not here.
- **Who appears (D-073):** a player on the roster (`origin: 'admin'`), or one whose profile is linked to a saved login (email link). Guest-only players are weekly only: they show on each week's leaderboard but not here, and see a prompt to save their account.
- **Worked out again from the entries every time, never added to** (`functions/src/season.ts`, `shared/standings.ts`), so a correction, a merge, or a retried call cannot leave them off. Refreshed after a winner is published or corrected and after a claim, unlink, or merge, and on request with `adminRecomputeStandings`.
- **Ranked** by correct picks, then win rate, then name. Players level on correct picks share a place.
- Readable by any signed-in player: this document is the public player profile (a name and a record). It holds no phone, email, or payment.

### 3.9 `config/pool`

`entryFeeCents`, `etransferEmail`, `etransferInstructions`, `contactEmail`, `defaultLockRule` (for example Saturday 23:59 America/Toronto), `tieGameRule` (see open decisions), `unpaidEligibleToWin` (boolean).

### 3.10 `auditLog/{logId}` (function-written, admin-read)

`at`, `actorUid`, `action` (enum below), `target` (path), `before`, `after`, `reason` (required for overrides), `year`, `weekId`.

Actions: `payment.set`, `entry.adminUpsert`, `entry.lateOverride`, `entry.delete`, `week.status`, `week.results`, `week.winnerPublished`, `week.payout`, `week.correction`, `claim.approved`, `claim.rejected`, `claim.unlinked`, `player.merged`, `player.guestMoved`.

---

## 4. Enums

```ts
type PaymentMethod = 'cash' | 'etransfer';
type PaymentIntent = 'will_do' | 'already_did';
type PaymentStatus = 'unpaid' | 'paid';
type WeekStatus = 'draft' | 'open' | 'locked' | 'final';
type EntrySource = 'web' | 'paper' | 'text' | 'phone';
type ClaimStatus = 'pending' | 'approved' | 'rejected';
type Pick = 'home' | 'away';
type GameResult = 'home' | 'away' | 'tie';
```

---

## 5. Cloud Functions

**Callable (all require `admin` claim unless noted)**

| Function | Purpose |
|---|---|
| `adminSetPayment(year, weekId, playerId, status, method?)` | Mark paid or unpaid on `payment/current`, with `paidAt` and `paidBy`. If the player never said how they'd pay, `method` is required and the payment is created as paid. Marking paid settles "will do" as "already did". A repeat tap changes nothing and writes no audit entry. Audit logged as `payment.set` with before and after. |
| `adminListEntries(year, weekId)` | The payments queue in one round trip: each entry with name, phone, email (admin only), declared payment, status, record, and possible duplicates. Each row also says how the entry came in (`source`), who first entered it (`enteredBy`), and whether a sheet photo is stored (`hasPaperPhoto`). Duplicates come from `shared/duplicates.ts`: same phone, same email, same name, or a very similar name. Flags only, never a block (D-022, D-045). |
| `adminUpsertEntry(year, weekId, playerId, entry)` | Enter or replace a player's picks for them (paper sheet, text, or phone call). `entry` is `{ source, picks, tiebreakerTotal, paperPhotoPath, markPaid }`, checked by `shared/paperEntry.ts`: picks only for games on the sheet (a blank is left out and scores as a miss, D-056), a whole-number tiebreaker from 0 to 200, a photo path inside this week's `paperSheets/` folder or null, and `markPaid` as `cash`, `etransfer`, or null. Only while the week is `open` and the server clock is before `lockAt`, or while a `backfilled` week is `locked` (D-071; no reason, no late badge). The player must be on the roster, active, and not merged. A new entry gets `enteredBy: 'admin'`; an existing one keeps who first entered it. `displayName` is copied from the roster profile. With `markPaid`, the payment is marked paid in the same transaction, exactly as `adminSetPayment` would (its own `payment.set` audit entry). Audit logged as `entry.adminUpsert` with the picks before and after. An omitted field arrives as null and means the same. |
| `adminLateOverride(year, weekId, playerId, entry, reason)` | The same entry, after the lock: once `lockAt` has passed or the week is `locked`, and until the winner is published (D-054). `reason` is required, 5 to 300 characters. Sets `lateOverride: { reason, by, at }` on the entry, which shows as a "Late entry" badge. Refused while picks are still open and in a backfilled week (use `adminUpsertEntry` for both), and once the week is `final`. If results are already in, the entry's `record` is written straight away. Audit logged as `entry.lateOverride` with the reason. |
| `adminDeleteEntry(year, weekId, playerId, reason)` | Remove an entry with its picks and payment record. `reason` is required. Refused while the entry is marked paid (undo the payment first, so the pot never changes without its own audit entry, D-055) and once the week is `final`. The roster profile and any stored photo stay. Audit logged as `entry.delete` with everything that was removed. |
| `adminSetWeekStatus(year, weekId, status)` | `draft → open` (only when `weekProblems` in `shared/weeks.ts` is empty, judged by the server clock), `open → draft` (only while the week has no entries), `open → locked` (lock early; also sets `revealed: true`). Audit logged as `week.status` with before and after. `final` is reached through results and the winner, not this callable. |
| `adminEnterResults(year, weekId, results, mnfTotal)` | Replace the week's results (home, away, or tie per game) and the Monday night total. Only while the week is `locked`; refused once `final` (D-047, corrections arrive in Sprint 6). Unchanged input writes nothing. Audit logged as `week.results`. The records are written by `onResultsWritten`. |
| `adminCorrectResults(year, weekId, results, mnfTotal, reason)` | Fix a result after the winner is published. Only for a `final` week, with every result, the Monday night total, and a typed reason (5 to 300 characters). Scores the week again with the same code that published it, from the entries' own picks and payments at that moment. Replaces `winner` if it changed (keeping the original `publishedAt`), sets `correctedAt`, rewrites every entry's `record`, and **clears `payoutSent` when the winner changes** (D-068). Unchanged results write nothing. Refused if no paid entry could win. The week stays `final`. Audit logged as `week.correction` with results and winner before and after, and the reason. |
| `adminPreviewWinner(year, weekId)` | Read-only: standings, the pot, and the winner "if the games ended now" with a plain-words explanation, from the entries' own picks and payments (`shared/scoring.ts`). The same code publishes the winner. |
| `adminPublishWinner(year, weekId, expectedPlayerIds)` | Needs a `locked` week with a result for every game and the Monday night total. Recomputes the winner from the picks and payments at that moment. If it differs from `expectedPlayerIds` (what the admin reviewed), nothing is published. Writes `winner`, sets `status='final'`, writes each entry's `record`. Audit logged as `week.winnerPublished`. Season standings and all-time stats are computed in Sprint 7 from the final weeks, not here. |
| `adminMarkPayout(year, weekId, sent)` | Record that the payout was sent, or undo it. Only once the winner is published. Audit logged as `week.payout`. |
| `adminRecomputeStandings(year)` | Work the season's standings and everyone's all-time stats out again from the final weeks. They refresh on their own after `adminPublishWinner`, `adminCorrectResults`, `adminApproveClaim`, `adminUnlinkClaim`, and `adminMergePlayers`; a failure there is logged, not thrown, so this is the way to run it again. Returns how many players are on the standings. |
| `adminSeasonReport(year)` | The Reports screen in one round trip (`shared/reports.ts`): for each week that is not a draft, entries, paid and unpaid counts, the pot, the winner and each share, payout sent, new and returning players, average correct picks, the most-picked team, the biggest upset, and the names of unpaid players. Admin only. |
| `adminListClaims()` | The pending claims, oldest first. Each has what the player typed, their email, the website profile their login already has (if any, with weeks played), and up to five likely roster matches, best first: same phone, then same name, then a similar name (`shared/claims.ts`), each with weeks played and whether it is already linked. `suggestedPlayerId` is the best match that can still be claimed. A match that is already linked is shown but cannot be approved, and `sharedSuggestion` marks two requests pointing at one profile. Only roster profiles (`origin: 'admin'`) are offered. |
| `adminApproveClaim(claimId, playerId)` | Link the claimant's login to a roster profile by setting `claimedByUid`. The claim must be pending, and the profile must be a live roster profile with no login. If the claimant's login already has a website profile, it is merged into the roster profile in the same transaction (see `adminMergePlayers`). Sets the claim to `approved` with `resolvedPlayerId`. Audit logged as `claim.approved`, plus `player.merged` when a merge happened. Never automatic (D-004). |
| `adminRejectClaim(claimId, note?)` | Set a pending claim to `rejected`, with an optional friendly note the claimant sees. Links nothing. Audit logged as `claim.rejected`. |
| `adminUnlinkClaim(playerId)` | Undo a wrong approval: clear `claimedByUid` on a roster profile, so that login can no longer see or change it. Entries are untouched. The approved claim becomes `rejected` with a standing note. Refused for a profile made on the website. Entries that a merge moved onto the profile stay there (D-063). Audit logged as `claim.unlinked`. |
| `adminMergePlayers(fromId, intoId)` | Two profiles are one person. Every entry of `fromId` (with its picks and payment) is rewritten under `intoId` and the old documents deleted, since entries are keyed by player. A published winner naming `fromId` is repointed. `fromId` is kept as a record with `mergedInto`, `active: false`, and no login. If only `fromId` had a login, it moves to `intoId`. **Refused if both entered the same week** (D-062). Cannot be undone. Audit logged as `player.merged` with the weeks moved. Season standings and all-time stats are computed from the final weeks in Sprint 7, so there is nothing else to repoint yet. |

**Player-callable (signed-in)**

| Function | Purpose |
|---|---|
| `requestClaim(claimedName, claimedPhone?)` | Creates a pending claim holding what the player typed. Always answers `{ status: 'pending' }`, whoever they name. Needs a saved account, not a guest login (D-060). Refused if the login is already linked to a roster profile, already has a request waiting, or has asked three times in 24 hours. |
| `adoptGuestProfile(guestIdToken)` | Called after a guest saves their account with an email that already has an account, so the app signed in to that account instead. Verifies the guest's anonymous ID token, then moves the guest's profile to the caller by setting `claimedByUid` (the `playerId` and its entries do not change). If the caller already has a profile, returns `needs_admin` and changes nothing; the admin merges with `adminMergePlayers`. Audit logged as `player.guestMoved`. |

**Triggers and schedules**

| Function | Purpose |
|---|---|
| `lockWeeks` (scheduled, every minute) | For every `open` week whose `lockAt` has passed: set `status='locked'` and `revealed=true`, audit log it as `system:lockWeeks`, and recount the week. Safe to repeat. Uses the collection-group index on `weeks` (`status`, `lockAt`). The rules already reject late entry writes on their own, so the worst case is picks revealing up to a minute after the lock. |
| `onEntryWritten` | Recount `entryCount` and `paidCount` when an entry is created or deleted (not on edits). |
| `onPaymentWritten` | Recount when a `payment/current` is created or its `paymentStatus` changes. |
| `onResultsWritten` | When a week's `results` or `mnfTotal` change, write each entry's `record`. Ignores every other change to the week (status, counters). |
| `sendSaturdayReminder` (scheduled, Phase 4) | Email reminder to players who haven't entered and have an email on file. Guests have none, so the admin reminder list (Sprint 8) is the main path. |

---

## 6. Week lifecycle

```
draft --(admin opens)--> open --(lockAt, automatic, or admin locks early)--> locked --(results + publish)--> final
  ^                        |
  +--(admin, no entries)---+
```

- **Setting up a draft:** the admin pastes one game per line (`shared/weeks.ts` `parseMatchups`), or fills the box from ESPN's schedule feed and checks it (`shared/schedule.ts`, D-051). No day or time means Sunday 1:00 PM; the last line is Monday night, 8:15 PM by default. The default lock is Saturday 11:59 PM Toronto time. A week opens only with 1 to 14 Sunday games (D-050), one Monday night game as the tiebreaker, no team twice, and a lock that is in the future and before the first kickoff.

- **draft:** visible to admin only. Games and lock time are editable.
- **open:** players can create and edit entries until `lockAt`.
- **locked:** entries are read-only for players. `revealed=true`. Picks visible to all.
- **final:** results entered and the winner published. A wrong result is fixed with `adminCorrectResults`, which re-scores the week, is audit logged with a reason, and leaves a public "Result corrected" note. Entries cannot be added, changed, or removed in a final week (D-054).

---

## 7. Scoring and tiebreaker

**Record:** one win per correct pick across all of the week's games (15 on a full sheet). The record is shown as `wins - losses`, for example `11 – 4`. A pick that is missing, or wrong, is a loss. **A tied game is not a win for anyone** (`config.pool.tieGameRule`, default `no_win`, D-008) and counts toward losses, so every record adds up to the games decided (D-046). The pool setting can also be `win_for_all` or `half_win`; `shared/scoring.ts` supports all three.

**Eligibility:** only `paymentStatus == 'paid'` entries count toward the pot. Whether unpaid entries are *eligible to win* is `config.pool.unpaidEligibleToWin` (see open decisions; default `false`).

**Winner algorithm**

1. Take eligible entries with the highest win count.
2. If one entry remains, it wins.
3. Otherwise apply the tiebreaker using each tied entry's `tiebreakerTotal` against actual `mnfTotal`:
   1. Entries with `prediction >= mnfTotal` rank above entries below it. Among those, the **lowest** prediction (closest to the total) wins.
   2. If nobody met or exceeded the total, the **highest** prediction (closest) wins.
4. If two or more entries share the same qualifying prediction, the **pot is split** evenly between them.

Example from the paper sheet: actual total 46. Player A predicts 58 (met or exceeded), Player B predicts 45 (below). Player A wins.

**Pot:** `paid entries × entryFeeCents`. Displayed live in the admin payments queue and on the results screen. When the winner is published the pot is **recounted from the payments at that moment**, not read from `week.paidCount` (D-046).

**Split pots:** the pot is divided evenly among the winners and each share is rounded down to the cent. Any leftover cents (`leftoverCents`) are shown to the admin, never hidden.

**Where this lives:** `shared/scoring.ts` (`scorePicks`, `pickWinners`, `explainOutcome`). The admin preview and the published winner both come from it, with unit tests for the paper-sheet example (46: a guess of 58 beats 45), the all-below case, a split pot with leftover cents, and unpaid entries.

---

## 8. Indexes (initial)

- `payment` collection group: `paymentStatus ASC, updatedAt DESC` (payments queue)
- `payment` collection group: `paymentMethod ASC, paymentStatus ASC`
- `weeks`: `status ASC, weekNumber DESC` (players' current-week lookup, filtered to open, locked, and final)
- `weeks` collection group: `status ASC, lockAt ASC` (the `lockWeeks` scheduler)

The two `payment` collection-group indexes above are not used yet: the payments queue reads one week at a time through `adminListEntries`. They are kept for the Sprint 7 reports.
- `claims`: `status ASC, createdAt DESC`
- `players`: `phone ASC` (duplicate flags), `displayName ASC` (roster search)
- `auditLog`: `at DESC`

---

## 9. Drafts and offline

Picks drafts autosave to `localStorage`, keyed by `{year}:{weekId}`, from the first tap. They sync to Firestore only on explicit submit. Drafts hold no PII beyond what the player types, and they are cleared on successful submit. The player's name, phone, and usual payment are also remembered on the device so the next week's form starts filled in.

**Submit order:** find the profile with `where('claimedByUid', '==', uid)` (D-034); create `players/{uid}` if there is none, or update its name, phone, usual payment, and age confirmation. Then, in one batch: the entry (create, or update its name and `picksSubmittedAt`), `payment/current`, and `private/picks`. The profile must be committed first because the entry rules read it.

---

## 10. Derived display values (not stored)

Computed in shared code (`shared/`) so the web app and functions agree. Pure functions with unit tests.

**Confirmation code.** Shown on the entry receipt and next to the entry in the admin view. Six characters from an unambiguous alphabet (no `0/O`, `1/I/L`), taken from a hash of `year`, `weekId`, `playerId`, and `picksSubmittedAt` in milliseconds. It changes on every edit, so a player's code always matches their latest saved picks. It is a reference for conversations ("my code was K7M3QX"), not a security token. The audit log stays the record of truth.

**Best possible record.** `wins + gamesNotYetDecided`, shown next to the current record on the live leaderboard. A tied game counts per `config.pool.tieGameRule`.

**Pick marks.** Per pick: correct (✔), wrong (✖), or not played yet (○), from `week.results`. Always icon plus color.

**Leaderboard.** After the reveal, every entry ranked by wins, with losses, games remaining, and best possible record (`shared/reveal.ts` `leaderboard`). Players level on wins share a place. It shows records only: who can win the pot also depends on who has paid, which players never see (D-036), so the published winner is the word on that (D-069).

**Pick share.** Per game after reveal: the percent of entries on each side. Never computed or shown before `revealed == true` (`DECISIONS.md` D-021).
