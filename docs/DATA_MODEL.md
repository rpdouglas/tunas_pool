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

### 3.3 `claims/{claimId}`

| Field | Type | Notes |
|---|---|---|
| `requesterUid` | string | Must equal `request.auth.uid` on create. |
| `requesterEmail` | string \| null | From the auth token, for the admin to see. |
| `claimedName` | string | What the player typed. |
| `claimedPhone` | string | What the player typed. |
| `status` | `'pending' \| 'approved' \| 'rejected'` | Client creates only `'pending'`. |
| `suggestedPlayerId` | string \| null | Function-suggested best match (phone, then name). |
| `resolvedPlayerId` | string \| null | Set on approval. |
| `decidedBy` / `decidedAt` / `decisionNote` | string / Timestamp / string | Function-written. |
| `createdAt` | Timestamp | |

A claim never exposes the matched profile to the claimant. Only the admin sees `suggestedPlayerId`, via a callable.

### 3.4 `seasons/{year}`

`year`, `status` (`'active' | 'archived'`), `entryFeeCents` (default 2000), `createdAt`.

### 3.5 `seasons/{year}/weeks/{weekId}`

| Field | Type | Notes |
|---|---|---|
| `weekNumber` | number | NFL week number. |
| `status` | `'draft' \| 'open' \| 'locked' \| 'final'` | See §6. |
| `lockAt` | Timestamp | Players cannot write at or after this time. |
| `revealed` | boolean | Function flips to `true` at lock. Unlocks picks for everyone. |
| `games` | `Game[]` | 14 Sunday games + MNF, ordered. See below. |
| `mnfGameId` | string | The game whose total points is the tiebreaker. |
| `results` | `Record<gameId, 'home' \| 'away' \| 'tie'>` | Admin, via callable. |
| `mnfTotal` | number \| null | Actual combined MNF points. |
| `entryFeeCents` | number | Snapshotted from the season at week creation. |
| `entryCount` | number | Function-written (`onEntryWritten`). Entries this week. Starts at 0. For display; recounted, never incremented (D-048). |
| `paidCount` | number | Function-written (`onPaymentWritten`). Entries with `paymentStatus == 'paid'`. Displayed pot = `paidCount × entryFeeCents`. Starts at 0. The published pot is recounted at publish time (D-046). |
| `winner` | `WeekWinner \| null` | Function-written when published. |
| `payoutSent` | boolean | Admin records that the winner was paid (`adminMarkPayout`). Who and when are in the audit log (D-042). |
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
| `enteredBy` | `'self' \| 'admin'` | |
| `source` | `'web' \| 'paper' \| 'text' \| 'phone'` | |
| `paperPhotoPath` | string \| null | Storage path, admin only. |
| `lateOverride` | `{ reason: string; by: string; at: Timestamp } \| null` | Set only by the override callable. |
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

`displayName`, `weeksPlayed`, `wins`, `losses`, `weeklyTitles`, `weekRecords: Record<weekId, {wins, losses}>`, `updatedAt`. Only players with a claimed profile **or** an admin-roster profile appear. Guest-only (unclaimed self-serve) players are weekly-only by design. They show on weekly leaderboards but not season standings.

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
| `adminListEntries(year, weekId)` | The payments queue in one round trip: each entry with name, phone, email (admin only), declared payment, status, record, and possible duplicates. Duplicates come from `shared/duplicates.ts`: same phone, same email, same name, or a very similar name. Flags only, never a block (D-022, D-045). |
| `adminUpsertEntry(year, weekId, playerId, entryFields, picksDoc)` | Enter or edit picks for a player. Allowed while open. Rejects after lock. |
| `adminLateOverride(year, weekId, playerId, entryFields, picksDoc, reason)` | Post-lock entry or edit. `reason` required. Sets `lateOverride`. |
| `adminDeleteEntry(year, weekId, playerId, reason)` | Remove an entry. |
| `adminSetWeekStatus(year, weekId, status)` | `draft → open` (only when `weekProblems` in `shared/weeks.ts` is empty, judged by the server clock), `open → draft` (only while the week has no entries), `open → locked` (lock early; also sets `revealed: true`). Audit logged as `week.status` with before and after. `final` is reached through results and the winner, not this callable. |
| `adminEnterResults(year, weekId, results, mnfTotal)` | Replace the week's results (home, away, or tie per game) and the Monday night total. Only while the week is `locked`; refused once `final` (D-047, corrections arrive in Sprint 6). Unchanged input writes nothing. Audit logged as `week.results`. The records are written by `onResultsWritten`. |
| `adminPreviewWinner(year, weekId)` | Read-only: standings, the pot, and the winner "if the games ended now" with a plain-words explanation, from the entries' own picks and payments (`shared/scoring.ts`). The same code publishes the winner. |
| `adminPublishWinner(year, weekId, expectedPlayerIds)` | Needs a `locked` week with all 15 results and the Monday night total. Recomputes the winner from the picks and payments at that moment. If it differs from `expectedPlayerIds` (what the admin reviewed), nothing is published. Writes `winner`, sets `status='final'`, writes each entry's `record`. Audit logged as `week.winnerPublished`. Season standings and all-time stats are computed in Sprint 7 from the final weeks, not here. |
| `adminMarkPayout(year, weekId, sent)` | Record that the payout was sent, or undo it. Only once the winner is published. Audit logged as `week.payout`. |
| `adminListClaims()` | Returns pending claims with `suggestedPlayerId`. |
| `adminApproveClaim(claimId, playerId)` | Link `claimedByUid`, merge if needed. |
| `adminRejectClaim(claimId, note?)` | Reject with a friendly note. |
| `adminUnlinkClaim(playerId)` | Undo a wrong approval. |
| `adminMergePlayers(fromId, intoId)` | Manual merge, for example duplicate guests. |

**Player-callable (signed-in)**

| Function | Purpose |
|---|---|
| `requestClaim(claimedName, claimedPhone)` | Creates a pending claim and computes `suggestedPlayerId`. Rate limited. |
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

- **Setting up a draft:** the admin pastes one game per line (`shared/weeks.ts` `parseMatchups`). No day or time means Sunday 1:00 PM; the last line is Monday night, 8:15 PM by default. The default lock is Saturday 11:59 PM Toronto time. A week opens only with 14 Sunday games, one Monday night game as the tiebreaker, no team twice, and a lock that is in the future and before the first kickoff.

- **draft:** visible to admin only. Games and lock time are editable.
- **open:** players can create and edit entries until `lockAt`.
- **locked:** entries are read-only for players. `revealed=true`. Picks visible to all.
- **final:** results entered and the winner published. Corrections are allowed but are audit logged and flagged.

---

## 7. Scoring and tiebreaker

**Record:** one win per correct pick across all 15 games. The record is shown as `wins - losses`, for example `11 – 4`. A pick that is missing, or wrong, is a loss. **A tied game is not a win for anyone** (`config.pool.tieGameRule`, default `no_win`, D-008) and counts toward losses, so every record adds up to the games decided (D-046). The pool setting can also be `win_for_all` or `half_win`; `shared/scoring.ts` supports all three.

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

**Pick share.** Per game after reveal: the percent of entries on each side. Never computed or shown before `revealed == true` (`DECISIONS.md` D-021).
