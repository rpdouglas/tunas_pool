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
| `displayName` | string | Shown on leaderboards. |
| `phone` | string \| null | Private. Normalized E.164 (`+1613...`). Used for duplicate flags. |
| `email` | string \| null | Private. Optional. |
| `claimedByUid` | string \| null | Client can never change this. |
| `origin` | `'self' \| 'admin'` | How the profile was created. |
| `usualPayment` | `PaymentMethod \| null` | Roster convenience for admin entry. |
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
| `entryCount` | number | Function-written (`onEntryWritten`). Entries this week. Starts at 0. |
| `paidCount` | number | Function-written (`onEntryWritten`). Entries with `paymentStatus == 'paid'`. Pot = `paidCount × entryFeeCents`. Starts at 0. |
| `winner` | `WeekWinner \| null` | Function-written when published. |
| `payoutSent` | boolean | Admin records that the winner was paid. |
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
  record: { wins: number; losses: number };
  mnfPrediction: number;     // winning tiebreaker value, shown as "(38 points)"
  potCents: number;
  publishedAt: Timestamp;
};
```

### 3.6 `seasons/{year}/weeks/{weekId}/entries/{playerId}`

Public-ish document. **No picks, no tiebreaker, no phone.**

| Field | Type | Notes |
|---|---|---|
| `playerId` | string | Must equal the document ID. |
| `displayName` | string | Denormalized for leaderboards. |
| `paymentMethod` | `'cash' \| 'etransfer'` | |
| `paymentIntent` | `'will_do' \| 'already_did'` | Player-declared. |
| `paymentStatus` | `'unpaid' \| 'paid'` | **Admin only.** Only `paid` counts toward the pot. |
| `paidAt` / `paidBy` | Timestamp / string | Function-written. |
| `enteredBy` | `'self' \| 'admin'` | |
| `source` | `'web' \| 'paper' \| 'text' \| 'phone'` | |
| `paperPhotoPath` | string \| null | Storage path, admin only. |
| `lateOverride` | `{ reason: string; by: string; at: Timestamp } \| null` | Set only by the override callable. |
| `picksSubmittedAt` | Timestamp | Time of the latest submit or edit. Sprint 2 adds a rule requiring `request.time`, so it is server time. Basis of the confirmation code (§10). |
| `createdAt` / `updatedAt` | Timestamp | |

### 3.7 `.../entries/{playerId}/private/picks`

| Field | Type | Notes |
|---|---|---|
| `picks` | `Record<gameId, 'home' \| 'away'>` | Up to 15 keys. |
| `tiebreakerTotal` | number | MNF predicted combined points. |
| `updatedAt` | Timestamp | |

Readable by the owner and admin. Readable by everyone once `week.revealed == true`.

### 3.8 `seasons/{year}/standings/{playerId}` (function-written)

`displayName`, `weeksPlayed`, `wins`, `losses`, `weeklyTitles`, `weekRecords: Record<weekId, {wins, losses}>`, `updatedAt`. Only players with a claimed profile **or** an admin-roster profile appear. Guest-only (unclaimed self-serve) players are weekly-only by design. They show on weekly leaderboards but not season standings.

### 3.9 `config/pool`

`entryFeeCents`, `etransferEmail`, `etransferInstructions`, `contactEmail`, `defaultLockRule` (for example Saturday 23:59 America/Toronto), `tieGameRule` (see open decisions), `unpaidEligibleToWin` (boolean).

### 3.10 `auditLog/{logId}` (function-written, admin-read)

`at`, `actorUid`, `action` (enum below), `target` (path), `before`, `after`, `reason` (required for overrides), `year`, `weekId`.

Actions: `payment.set`, `entry.adminUpsert`, `entry.lateOverride`, `entry.delete`, `week.status`, `week.results`, `week.winnerPublished`, `week.correction`, `claim.approved`, `claim.rejected`, `claim.unlinked`, `player.merged`.

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
| `adminSetPayment(year, weekId, playerId, status)` | Mark paid or unpaid. Audit logged. |
| `adminUpsertEntry(year, weekId, playerId, entryFields, picksDoc)` | Enter or edit picks for a player. Allowed while open. Rejects after lock. |
| `adminLateOverride(year, weekId, playerId, entryFields, picksDoc, reason)` | Post-lock entry or edit. `reason` required. Sets `lateOverride`. |
| `adminDeleteEntry(year, weekId, playerId, reason)` | Remove an entry. |
| `adminSetWeekStatus(year, weekId, status)` | Open, lock early, or finalize. |
| `adminEnterResults(year, weekId, results, mnfTotal)` | Save results and recompute the leaderboard. Re-runs after Final are flagged as `week.correction`. |
| `adminPublishWinner(year, weekId)` | Compute the winner, write `winner`, update standings and stats. |
| `adminMarkPayout(year, weekId, sent)` | Record that the payout was sent. |
| `adminListClaims()` | Returns pending claims with `suggestedPlayerId`. |
| `adminApproveClaim(claimId, playerId)` | Link `claimedByUid`, merge if needed. |
| `adminRejectClaim(claimId, note?)` | Reject with a friendly note. |
| `adminUnlinkClaim(playerId)` | Undo a wrong approval. |
| `adminMergePlayers(fromId, intoId)` | Manual merge, for example duplicate guests. |
| `getDuplicateFlags(year, weekId)` | Entries sharing phone, email, or normalized name, plus similar names (fuzzy match). Flags for a human check only, never a block. No device or IP signals (`DECISIONS.md` D-022). |

**Player-callable (signed-in)**

| Function | Purpose |
|---|---|
| `requestClaim(claimedName, claimedPhone)` | Creates a pending claim and computes `suggestedPlayerId`. Rate limited. |

**Triggers and schedules**

| Function | Purpose |
|---|---|
| `lockWeeks` (scheduled, every minute near lock) | At `lockAt`: set `status='locked'` and `revealed=true`. |
| `onEntryWritten` (Sprint 3) | Recompute the week's `entryCount` and `paidCount` on any entry create, update, or delete. |
| `onResultsWritten` | Recompute per-entry wins and the weekly leaderboard. |
| `sendSaturdayReminder` (scheduled, Phase 4) | Email reminder to players who haven't entered and have an email on file. Guests have none, so the admin reminder list (Sprint 8) is the main path. |

---

## 6. Week lifecycle

```
draft --(admin opens)--> open --(lockAt, automatic)--> locked --(results + publish)--> final
```

- **draft:** visible to admin only. Games and lock time are editable.
- **open:** players can create and edit entries until `lockAt`.
- **locked:** entries are read-only for players. `revealed=true`. Picks visible to all.
- **final:** results entered and the winner published. Corrections are allowed but are audit logged and flagged.

---

## 7. Scoring and tiebreaker

**Record:** one win per correct pick across all 15 games. The record is shown as `wins - losses`, for example `11 - 4`.

**Eligibility:** only `paymentStatus == 'paid'` entries count toward the pot. Whether unpaid entries are *eligible to win* is `config.pool.unpaidEligibleToWin` (see open decisions; default `false`).

**Winner algorithm**

1. Take eligible entries with the highest win count.
2. If one entry remains, it wins.
3. Otherwise apply the tiebreaker using each tied entry's `tiebreakerTotal` against actual `mnfTotal`:
   1. Entries with `prediction >= mnfTotal` rank above entries below it. Among those, the **lowest** prediction (closest to the total) wins.
   2. If nobody met or exceeded the total, the **highest** prediction (closest) wins.
4. If two or more entries share the same qualifying prediction, the **pot is split** evenly between them.

Example from the paper sheet: actual total 46. Player A predicts 58 (met or exceeded), Player B predicts 45 (below). Player A wins.

**Pot:** `paid entries × entryFeeCents`. Displayed live in the admin payments queue.

---

## 8. Indexes (initial)

- `entries` collection group: `paymentStatus ASC, createdAt DESC` (payments queue)
- `entries` collection group: `paymentMethod ASC, paymentStatus ASC`
- `claims`: `status ASC, createdAt DESC`
- `players`: `phone ASC` (duplicate flags), `displayName ASC` (roster search)
- `auditLog`: `at DESC`

---

## 9. Drafts and offline

Picks drafts autosave to `localStorage`, keyed by `{year}:{weekId}`, from the first tap. They sync to Firestore only on explicit submit. Drafts hold no PII beyond what the player types, and they are cleared on successful submit.

---

## 10. Derived display values (not stored)

Computed in shared code (`shared/`) so the web app and functions agree. Pure functions with unit tests.

**Confirmation code.** Shown on the entry receipt and next to the entry in the admin view. Six characters from an unambiguous alphabet (no `0/O`, `1/I/L`), taken from a hash of `year`, `weekId`, `playerId`, and `picksSubmittedAt` in milliseconds. It changes on every edit, so a player's code always matches their latest saved picks. It is a reference for conversations ("my code was K7M3QX"), not a security token. The audit log stays the record of truth.

**Best possible record.** `wins + gamesNotYetDecided`, shown next to the current record on the live leaderboard. A tied game counts per `config.pool.tieGameRule`.

**Pick marks.** Per pick: correct (✔), wrong (✖), or not played yet (○), from `week.results`. Always icon plus color.

**Pick share.** Per game after reveal: the percent of entries on each side. Never computed or shown before `revealed == true` (`DECISIONS.md` D-021).
