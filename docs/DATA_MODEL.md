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
    board/{messageId}                        (the weekly board, D-102)
    boardMutes/{playerId}                    (function-written)
    boardLast/{playerId}                     (the poster's last post time, D-109)
    boardReports/{messageId_playerId}        (staff-read)
  standings/{playerId}                       (function-written)
config/pool                                  (admin-written settings)
auditLog/{logId}                             (function-written)
logins/{uid}                                 (function-written pointer to a player, D-102)
```

Weekly 649 Bingo (planned, Phase 6) adds `bingo/*`, `bingoMembers`, `bingoRedeemAttempts`, `bingoCards`, and `bingoCycles` with its subcollections: see §11.

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

`year`, `status` (`'active' | 'archived'`), `entryFeeCents` (default 2000), `createdAt`, `archivedAt` (function-written).

A season is created by the admin's screens with its first week. `status` and `archivedAt` change only through `adminSetSeasonStatus`. An archived season stays fully viewable; the one thing it stops is opening a week in it. **There is no roster rollover:** players, logins, claims, and history are not tied to a season, so they carry over untouched (D-090).

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
- The Hall of Fame (D-108) is worked out in the browser from these documents across every real season; it stores nothing of its own.

### 3.8b The weekly board (D-102)

`seasons/{year}/weeks/{weekId}/board/{messageId}`: `playerId`, `displayName` (the poster's current name, checked by the rules), `text` (1 to 500 characters), `createdAt` (server time), `editedAt` (server time or null), `hidden` (boolean). Hiding adds `hiddenAt` and `hiddenBy` and empties `text`; the words are kept only in the audit log. Read by anyone who entered that week and by the staff; posted by a paid entrant with a saved account who isn't muted, from the week opening until three days after the winner is published. The writer may edit `text` or delete the post for ten minutes.

`.../boardMutes/{playerId}`: `reason`, `by`, `at`. Written by `boardMute`; read by the staff (who list them to lift one, D-109) and the muted player.

`.../boardLast/{playerId}`: `at` (server time). When the player last posted this week (D-109), written by the client in the same batch as each post; the rules allow one post every 30 seconds by comparing it. Read only by its owner; never deleted.

The Board tab's "3 new" count is kept per viewer in their own browser (`localStorage`, the time they last opened that week's board); nothing is stored for it.

`.../boardReports/{messageId}_{playerId}`: `messageId`, `playerId` (the reporter), `createdAt`. One per player per post; read by the staff.

`logins/{uid}`: `playerId`, `updatedAt`. Written by `boardJoin` only, so the rules can tell which player a login is. A pointer, never a grant: the rules re-check `players/{playerId}.claimedByUid`.

### 3.9 `config/pool`

`entryFeeCents`, `etransferEmail`, `etransferInstructions`, `contactEmail`, `defaultLockRule` (for example Saturday 23:59 America/Toronto), `tieGameRule` (see open decisions), `unpaidEligibleToWin` (boolean).

### 3.10 `auditLog/{logId}` (function-written, admin-read)

`at`, `actorUid`, `action` (enum below), `target` (path), `before`, `after`, `reason` (required for overrides), `year`, `weekId`.

Counter actions carry `actorRole: 'counter'` and `actorEmail`, so the Audit log says "Counter (devon@…)" (D-095).

Actions: `payment.set`, `entry.adminUpsert`, `entry.lateOverride`, `entry.delete`, `week.status`, `week.results`, `week.winnerPublished`, `week.payout`, `week.correction`, `claim.approved`, `claim.rejected`, `claim.unlinked`, `player.merged`, `player.delete`, `player.saved`, `player.guestMoved`, `season.status`, `board.hidden`, `board.mute`. Bingo's actions (planned) are listed in §11.5.

The Back Office shows the log in plain words (`shared/auditText.ts`), newest first, with the stored before and after under each entry. Entries written by a one-off script carry an actor that starts `script:`.

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
| `adminSetPayment(year, weekId, playerId, status, method?)` | Mark paid or unpaid on `payment/current`, with `paidAt` and `paidBy`. If the player never said how they'd pay, `method` is required and the payment is created as paid. Marking paid settles "will do" as "already did". A repeat tap changes nothing and writes no audit entry. Audit logged as `payment.set` with before and after. **The counter role may call it (D-095), for cash only:** it can mark cash received and undo a cash payment, and is refused ("Ask the commissioner") for an e-Transfer either way. |
| `adminListEntries(year, weekId)` | The payments queue in one round trip: each entry with name, phone, email (admin only), declared payment, status, record, and possible duplicates. Each row also says how the entry came in (`source`), who first entered it (`enteredBy`), and whether a sheet photo is stored (`hasPaperPhoto`). Duplicates come from `shared/duplicates.ts`: same phone, same email, same name, or a very similar name. Flags only, never a block (D-022, D-045). |
| `adminUpsertEntry(year, weekId, playerId, entry)` | Enter or replace a player's picks for them (paper sheet, text, or phone call). `entry` is `{ source, picks, tiebreakerTotal, paperPhotoPath, markPaid }`, checked by `shared/paperEntry.ts`: picks only for games on the sheet (a blank is left out and scores as a miss, D-056), a whole-number tiebreaker from 0 to 200, a photo path inside this week's `paperSheets/` folder or null, and `markPaid` as `cash`, `etransfer`, or null. Only while the week is `open` and the server clock is before `lockAt`, or while a `backfilled` week is `locked` (D-071; no reason, no late badge). The player must be on the roster, active, and not merged. A new entry gets `enteredBy: 'admin'`; an existing one keeps who first entered it. `displayName` is copied from the roster profile. With `markPaid`, the payment is marked paid in the same transaction, exactly as `adminSetPayment` would (its own `payment.set` audit entry). Audit logged as `entry.adminUpsert` with the picks before and after. An omitted field arrives as null and means the same. **The counter role may call it (D-095), for a new sheet only:** while the week is open, for an active player with no entry yet, marking at most cash paid. A sheet already in, anything after the lock, a backfilled week, an inactive player, and e-Transfer are refused with "Ask the commissioner". The spreadsheet import (D-096) calls it once per line, with `source: 'paper'` and no photo or payment, so each line is checked and audited like a typed-in sheet. |
| `adminLateOverride(year, weekId, playerId, entry, reason)` | The same entry, after the lock: once `lockAt` has passed or the week is `locked`, and until the winner is published (D-054). `reason` is required, 5 to 300 characters. Sets `lateOverride: { reason, by, at }` on the entry, which shows as a "Late entry" badge. Refused while picks are still open and in a backfilled week (use `adminUpsertEntry` for both), and once the week is `final`. If results are already in, the entry's `record` is written straight away. Audit logged as `entry.lateOverride` with the reason. |
| `adminDeleteEntry(year, weekId, playerId, reason)` | Remove an entry with its picks and payment record. `reason` is required. Refused while the entry is marked paid (undo the payment first, so the pot never changes without its own audit entry, D-055) and once the week is `final`. The roster profile and any stored photo stay. Audit logged as `entry.delete` with everything that was removed. |
| `adminDeletePlayer(playerId, reason)` | Delete a player who has no history, for good (D-094). Allowed only when they have **no weeks played**, **no login linked** (`claimedByUid`), and **no pending claim** naming them as the likely match; otherwise refused with a plain sentence pointing to Inactive or a merge. Removes the `players/{id}` profile and its `stats`. `reason` is required. With `dryRun: true` it changes nothing and returns `{ ok: true }` or `{ ok: false, code, message }` so the screen can say why before asking for a reason. The check runs again inside the transaction. Audit logged as `player.delete`; the log keeps the name and whether they had a phone, email, or note, never the phone, email, or note themselves. |
| `counterOverview(year, weekId)` | **Staff (admin or counter).** This week's roster for the counter screen: each non-merged player's name, active, origin, whether they are in, source, late, and payment status and method. **No phone, email, note, or pick.** A counter is refused a draft week. |
| `counterSavePlayer(playerId?, displayName, phone?, usualPayment?, force?)` | **Staff.** Add a roster player (`origin: 'admin'`, no email or note), or fix a name, a new phone, or the usual payment. Only what is sent changes, so a blank phone keeps the stored one. A possible double (same name or phone) comes back as `{ saved: false, matches }` for the person to decide; `force: true` adds anyway. Refuses a player who signed up on the website. Audit logged as `player.saved` with names only, never the phone. |
| `adminSetWeekStatus(year, weekId, status)` | `draft → open` (only when `weekProblems` in `shared/weeks.ts` is empty, judged by the server clock), `open → draft` (only while the week has no entries), `open → locked` (lock early; also sets `revealed: true`). Audit logged as `week.status` with before and after. `final` is reached through results and the winner, not this callable. |
| `adminEnterResults(year, weekId, results, mnfTotal)` | Replace the week's results (home, away, or tie per game) and the Monday night total. Only while the week is `locked`; refused once `final` (D-047, corrections arrive in Sprint 6). Unchanged input writes nothing. Audit logged as `week.results`. The records are written by `onResultsWritten`. The Results screen can fill the form from the public scores feed first (`shared/schedule.ts` `suggestResults`, D-085); that is client-side and saves nothing. |
| `adminCorrectResults(year, weekId, results, mnfTotal, reason)` | Fix a result after the winner is published. Only for a `final` week, with every result, the Monday night total, and a typed reason (5 to 300 characters). Scores the week again with the same code that published it, from the entries' own picks and payments at that moment. Replaces `winner` if it changed (keeping the original `publishedAt`), sets `correctedAt`, rewrites every entry's `record`, and **clears `payoutSent` when the winner changes** (D-068). Unchanged results write nothing. Refused if no paid entry could win. The week stays `final`. Audit logged as `week.correction` with results and winner before and after, and the reason. |
| `adminPreviewWinner(year, weekId)` | Read-only: standings, the pot, and the winner "if the games ended now" with a plain-words explanation, from the entries' own picks and payments (`shared/scoring.ts`). The same code publishes the winner. |
| `adminPublishWinner(year, weekId, expectedPlayerIds)` | Needs a `locked` week with a result for every game and the Monday night total. Recomputes the winner from the picks and payments at that moment. If it differs from `expectedPlayerIds` (what the admin reviewed), nothing is published. Writes `winner`, sets `status='final'`, writes each entry's `record`. Audit logged as `week.winnerPublished`. Season standings and all-time stats are computed in Sprint 7 from the final weeks, not here. |
| `adminMarkPayout(year, weekId, sent)` | Record that the payout was sent, or undo it. Only once the winner is published. Audit logged as `week.payout`. |
| `adminRecomputeStandings(year)` | Work the season's standings and everyone's all-time stats out again from the final weeks. They refresh on their own after `adminPublishWinner`, `adminCorrectResults`, `adminApproveClaim`, `adminUnlinkClaim`, and `adminMergePlayers`; a failure there is logged, not thrown, so this is the way to run it again. Returns how many players are on the standings. |
| `adminListSeasons()` | Every season, newest first, with its status and how many of its weeks are finished, being played, or in draft. |
| `adminSetSeasonStatus(year, status)` | Archive a season (`archived`) or reopen it (`active`). Archiving is refused while any week is open or locked. Sets or clears `archivedAt`. Audit logged as `season.status`. `adminSetWeekStatus` refuses to open a week in an archived season. |
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
| `boardJoin()` | Any signed-in login. Finds the one live (not merged) profile whose `claimedByUid` is the caller and writes `logins/{uid}` = `{ playerId }`, or deletes the pointer when there is none (D-102). Idempotent; the board screen calls it once per visit. |
| `boardHide(year, weekId, messageId, reason)` | Admin **or counter**. Hides a board post: sets `hidden`, `hiddenAt`, `hiddenBy`, and empties `text`. `reason` 5 to 300 characters. Hiding twice changes nothing. Audit logged as `board.hidden` with the words in `before`. |
| `boardMute(year, weekId, playerId, muted, reason)` | Admin **or counter**. Mutes a player on one week's board (`boardMutes/{playerId}`) or lifts it. `reason` required both ways. No change when already in that state. Audit logged as `board.mute`. |
| `reportClientError(message, stack, path, userAgent, release)` | Any signed-in login, guests included. Writes an uncaught script error from the web app to the functions' log (D-086). Text is cut to length and the path loses its query string. Limited per instance. Never fails the caller. |

**Triggers and schedules**

| Function | Purpose |
|---|---|
| `lockWeeks` (scheduled, every minute) | For every `open` week whose `lockAt` has passed: set `status='locked'` and `revealed=true`, audit log it as `system:lockWeeks`, and recount the week. Safe to repeat. Uses the collection-group index on `weeks` (`status`, `lockAt`). The rules already reject late entry writes on their own, so the worst case is picks revealing up to a minute after the lock. |
| `onEntryWritten` | Recount `entryCount` and `paidCount` when an entry is created or deleted (not on edits). |
| `onPaymentWritten` | Recount when a `payment/current` is created or its `paymentStatus` changes. |
| `onResultsWritten` | When a week's `results` or `mnfTotal` change, write each entry's `record`. Ignores every other change to the week (status, counters). |
| `sendSaturdayReminder` (scheduled, not built) | Email reminder to players who haven't entered and have an email on file. Carried over until an email-sending service is set up (D-079). The commissioner's tap-to-text reminders are the working path (D-078). |

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

---

## 11. Weekly 649 Bingo (Phase 6)

The settled design for `docs/BINGO_PLAN.md`, from D-110 to D-130. **Built so far (Sprint 12):** the rules (`firestore.rules`, rows 67 to 80), `shared/bingo.ts` (§11.4, with §11.6 as its fixtures), and the simulation (`shared/bingoSim.ts`, `scripts/bingo-sim.ts`). **Sprint 13:** the functions (§11.5, `functions/src/bingo/`), with an integration test each and a two-game test from cards to payout (`bingoGame.int.test.ts`). **Sprint 14:** the player screens (`src/features/bingo/`, one lazy chunk, D-132). **Sprint 15:** the staff screens (`src/features/bingo/staff/`, D-133). The automatic fetch and the dry run come in Sprint 16; if code and this section disagree, stop and flag it. Money is integer cents. ✍ marks a document only functions write. **No client writes any bingo document**: every change, a player's own intent and limits included, goes through a callable, so the rules for bingo are reads only.

### 11.1 Collections

```
bingo/config                                ✍ settings (bingoSetConfig)
bingo/secret                                ✍ invite code hash (nobody reads)
bingoMembers/{playerId}                     ✍ membership, limits, spend
bingoRedeemAttempts/{uid}                   ✍ code attempts (nobody reads)
bingoCards/{cardId}                         ✍ a card, across cycles
bingoCycles/{cycleId}                       ✍ one game, until won or capped
  entries/{cardId}                          ✍ that card's part in this cycle
  draws/{drawDate}                          ✍ one Wednesday draw
    payments/{cardId}                       ✍ that card's money for that draw
```

`cycleId` is the date of the cycle's first draw, `"2026-11-04"`. `drawDate` is the Wednesday of the draw, `"2026-11-11"`. `cardId` is generated by `bingoCreateCard` and never reused.

### 11.2 Documents

**`bingo/config`**: `enabled` (boolean; false renders every bingo route as "not found", D-128), `priceCents`, `operatorPct` (integer 0 to 100), `cutoff` (`{ weekday: 3, time: '18:00', tz: 'America/Toronto' }`, D-124), `maxCardsPerPlayer` (5), `maxWeeks` (26), `joinWindowDraws` (1, D-117), `updatedAt`, `updatedBy`. Read by members and staff. A change applies from the next cycle, because each cycle copies it when it opens.

**`bingo/secret`**: `codeHash` (a salted hash, never the code), `codeVersion`, `rotatedAt`. Read by nobody; only functions use it (R-14).

**`bingoMembers/{playerId}`**: `displayName` (copied from the profile), `joinedAt`, `ageAttestedAt` (copied from the profile, D-115), `paper` (true if the commissioner added them), `limit` (cards per draw, 1 to `maxCardsPerPlayer`), `pendingLimit` and `pendingFromCycle` (a raise waiting a cycle, D-118), `pausedThroughCycle` (the last cycle `number` sat out, or null), `spent` (`{ byCycle: { [cycleId]: cents }, byYear: { "2026": cents } }`, changed in the same transaction as every payment, its undo, and money moved into the next game, D-131). Read by the owner and staff; other members never read it (D-123).

**`bingoRedeemAttempts/{uid}`**: `count`, `windowStart`, `lockedUntil`. Five wrong codes in an hour lock that login for an hour. Read by nobody.

**`bingoCards/{cardId}`**: `playerId`, `numbers` (six distinct integers 1 to 49, sorted), `active` (false once retired), `createdAt`, `createdBy` (`uid`, or a staff `uid` for a paper card), `source` (`web`, `paper`). Read by the owner and staff. A player's **active** cards count toward the cap (D-110, R-9).

**`bingoCycles/{cycleId}`**: `number` (1, 2, 3, … in order; limits and pauses count by it), `status` (`open`, `won`, `capped`), `test` (boolean, left out of totals, R-16), `openedAt`, `closedAt`, `firstDraw`, `config` (the snapshot of price, operator %, cutoff, caps, and join window), `potCents`, `operatorCents`, `drawsApproved`, `board` (`{ at3, at4, at5, cards }`, counts only, D-123), `carriedInCents` and `carriedOutCents` (a pot carried by the cap, D-121), `winners` (on close: `[{ cardId, playerId, displayName, hits, shareCents, paidOut: { method, at, by } | null }]`), `closingDraw`. Read by members and staff.

**`bingoCycles/{c}/entries/{cardId}`**: `playerId`, `joinedDraw`, `paidDraws` (draw dates, kept in step with the payments), `hits` (sorted numbers crossed off, derived), `count` (`hits.length`). Read by the owner and staff.

**`bingoCycles/{c}/draws/{drawDate}`**: `status` (`upcoming`, `proposed`, `approved`, `skipped`), `cutoffAt` (the Timestamp of that week's cutoff), `numbers` (six, sorted, once proposed), `source` (`manual` or the fetch's source), `proposedBy`, `proposedAt`, `approvedBy`, `approvedAt`, `correction` (`{ before, reason, by, at }` or null), `paidCards`, `revenueCents`, `operatorCents`, `potAddCents`. Members read it once `approved` or `skipped`; staff read it always. It is created as `upcoming` the first time anything needs it (the cycle opening, or the first payment for that week), so payments have somewhere to live all week (R-10).

**`bingoCycles/{c}/draws/{d}/payments/{cardId}`**: `playerId`, `paid` (boolean), `method` (`cash`, `etransfer`), `receivedAt`, `confirmedAt`, `confirmedBy`, `late` (received after the cutoff of the draw it was meant for), `reason` (required when late, or when `receivedAt` is more than 5 minutes before the time it is recorded), `intent` (`'cash' | 'etransfer' | null`, the player's "I'll pay cash" / "I sent an e-Transfer", D-116), `movedFrom` (set when a skip or the end of a game moved it, D-129, D-131). Read by the owner (paid or not, and intent) and staff.

### 11.3 A bingo week

| When (America/Toronto) | What happens |
|---|---|
| The winning draw is approved | The cycle closes (`won`); a new one opens with today's config; its week-one draw is created `upcoming`. The **join window** opens (D-117). |
| Thursday to Wednesday 6:00 PM | Members add cards (week one only), say how they'll pay, and hand over money. Staff record it with `receivedAt`. |
| Wednesday 6:00 PM | The **cutoff**. Money received after it is credited to the next draw, marked late (D-119). In week one the join window closes. |
| Wednesday night | Lotto 6/49 is drawn. Staff type the six numbers (`proposed`), or the fetch proposes them (D-126). The Back Office shows a banner. |
| After it is proposed | The admin or the counter checks them against the official result and approves. `applyDraw` runs. |
| On approval | Hits, the pot, and the board counts are worked out again. A card with six crossed off wins. If none does and this was draw `maxWeeks`, the cap rule applies (D-121). |
| After a win | Staff mark each winner paid. Every card's progress starts at zero in the new cycle; cards carry over and renew for week one. |

A cancelled or postponed draw is **skipped** by the admin: no card changes, and money recorded for it moves to the next draw (D-129); a card already paid late for that next draw has the moved money go to the draw after it.

**When a game ends**, money already taken for a later draw of it (late money) moves to the same draw in the new game, or the new game's first draw, with the member's spend; intents for those draws are dropped, and the old game's later draw documents are removed (D-131). Draws are approved in order: an earlier draw must be approved or skipped first.

### 11.4 Working it out (`shared/bingo.ts`)

Everything here is a pure function, and `applyDraw` calls it every time, so nothing is ever added to (D-113, R-11).

- **Hits** of a card in a cycle = the union, over the cycle's `approved` draws the card was **paid** for, of `card.numbers ∩ draw.numbers`.
- **Per draw:** `revenueCents = paidCards × priceCents`; `operatorCents = floor(revenueCents × operatorPct / 100)`; `potAddCents = revenueCents − operatorCents`. The cycle's `potCents` is the sum of `potAddCents` over approved draws, the winning draw included.
- **Winners** on a draw = the paid cards whose hits reach six on it. Identical cards are separate winners (D-110).
- **Split** (D-120): `share = floor(pot / n)`, `remainder = pot − share × n`; winners ordered by `cardId`, the first `remainder` of them get one cent more.
- **Cap** (D-121): after draw `maxWeeks` with no winner, the winners are the cards **paid for that draw** with the highest `count`, split the same way. None paid → the pot carries into the next cycle.
- **Credited draw** for money received at `receivedAt` (`creditPayment`): the first draw whose cutoff is after `receivedAt`, moving past a skipped draw (D-119, D-129). It is **late** if that is after the cycle's earliest draw not yet approved or skipped. Refused if it is a draw already approved ("record it as received now"), before the cycle's first draw, or in the future; since `receivedAt` can't be in the future, nobody can pay ahead (D-116).
- **Join window:** a card may be created while the cycle has no approved draw and `now < firstDraw.cutoffAt` (with `joinWindowDraws: 1`).
- **Limit** (`cardsAllowed`, `changeLimit`, `pause`): cards a member may have paid for one draw = `min(limit, maxCardsPerPlayer)`, zero while paused. A raise sets `pendingLimit`, applied from cycle `pendingFromCycle` (the next one); a lower one applies now and cancels a waiting raise (D-118). A pause starts now; a longer pause applies now; ending a pause early still sits out the rest of this cycle. Staff are held to it too.

### 11.5 Functions (planned; all callables write `auditLog`)

| Function | Who | Does |
|---|---|---|
| `bingoStatus` | any signed-in login | Whether to show the bingo screens (enabled, or a member, or staff, D-132), the caller's player, and the rules screen's price, operator %, and weeks. Refreshes the `logins` pointer. |
| `bingoRedeemCode` | a signed-in player with a saved account | Checks the code against `bingo/secret` (attempts counted, R-14), requires `ageAttestedAt`, creates `bingoMembers` and the `logins` pointer (D-102). |
| `bingoAddMember` | admin, counter | Adds a paper member with their age confirmed in person (D-114, D-115). |
| `bingoSetCode` / `bingoSetConfig` | admin | Rotates the code (8 to 32 letters and numbers, compared without spaces, dashes, or case; stored as a salted hash, never logged); changes settings (applied from the next cycle). |
| `bingoStartCycle` | admin | Opens the first game (or one after a gap), with `test` if it's the dry run. Refused while a game is open; after that each win opens the next. |
| `bingoCreateCard` | member (staff included, for their own card); staff for a paper member, by naming them | Six distinct numbers or quick-pick; join window, cap, limit, and pause, counted inside the transaction. |
| `bingoRetireCard` | the owner; admin | `active: false`; earlier hits stay, it can't be paid again. |
| `bingoSetLimit` | the owner only | Lower now, raise next cycle, pause (D-118). |
| `bingoSetIntent` | the owner | Sets `intent` on this week's payment. |
| `bingoSetPayment` | admin; counter for cash | Records or undoes money with `receivedAt`, credited per §11.4 (D-114, D-119). |
| `bingoEnterDraw` | admin, counter | Types the six numbers: `proposed`. |
| `bingoApproveDraw` | admin, counter | `approved`, then `applyDraw`. |
| `bingoCorrectDraw` | admin | Changes numbers with a reason, before or after approval, until a payout is marked (D-129). |
| `bingoSkipDraw` | admin | `skipped`; its money moves on (D-129). |
| `bingoSetPayout` | admin; counter for cash | Marks a winner paid. |
| `applyDraw` | internal | Recomputes every entry, the pot, the board counts, winners; closes and opens cycles. Idempotent. |
| `bingoRoster` | admin, counter | Roster players not in bingo yet, names only, for adding a paper member (D-133). |
| `bingoTotals` | admin | Spend from 4-to-5-card players, members at the cap: totals only (D-128). |

Audit actions: `bingo.memberJoined`, `bingo.memberAdded`, `bingo.code`, `bingo.config`, `bingo.cardCreated`, `bingo.cardRetired`, `bingo.limit`, `bingo.payment`, `bingo.drawEntered`, `bingo.drawApproved`, `bingo.drawCorrected`, `bingo.drawSkipped`, `bingo.payout`, `bingo.cycle`. Each gets a plain-words line in `shared/auditText.ts`. `bingoSetIntent` is not audited, like the pool's `paymentIntent`.

### 11.6 Worked examples (Sprint 12's fixtures)

Price $10, operator 40% (stand-ins, D-125). Cutoff Wednesday 6:00 PM.

**A missed week.** Card `C-A` is `3 11 19 27 35 43`. Draw 1 (paid) is `5 11 22 27 40 48`: crossed off 11, 27. Draw 2 (not paid) is `3 9 14 35 38 41`: nothing, though 3 and 35 came up. Draw 3 (paid) is `1 3 17 30 33 46`: crossed off 3. Hits `3 11 27`, count 3. If 35 comes up in a later paid draw it is crossed off then.

**Per-draw money.** 98 cards paid for a draw: revenue 98,000¢, operator floor(98,000 × 40 / 100) = 39,200¢, pot adds 58,800¢.

**A three-way tie with an uneven split.** The pot at the winning draw is $2,080.00 = 208,000¢. Three cards finish: `C-0F2`, `C-3K9`, `C-7AB`. 208,000 ÷ 3 = 69,333 remainder 1. In card-ID order: `C-0F2` gets 69,334¢, `C-3K9` and `C-7AB` get 69,333¢ each. Total 208,000¢.

**The 26-week cap.** No card has six after draw 26; the pot is $4,123.45 = 412,345¢. Paid for draw 26, the best count is 5, held by `C-0412` and `C-0907`. `C-0133` also has 5 but was not paid for draw 26, so it can't win. 412,345 ÷ 2 = 206,172 remainder 1: `C-0412` gets 206,173¢, `C-0907` 206,172¢.

**Late money: received vs confirmed.** Cutoff Wednesday 2026-11-11 6:00 PM. Cash handed over 5:50 PM, recorded by Devon at 7:05 PM with `receivedAt` 5:50 PM and a reason ("handed over before six, busy counter"): credited to the 2026-11-11 draw, not late. An e-Transfer that arrived at 6:20 PM: credited to 2026-11-18, `late: true`, with a reason. Once the 2026-11-11 draw is approved, no `receivedAt` can be set before its cutoff.

**The join window.** The winning draw of a cycle is approved Thursday morning; the new cycle's first draw is the next Wednesday. A card created Monday joins at draw 1. A card asked for the Thursday after that is refused: "Cards for the next game open after this one is won."
