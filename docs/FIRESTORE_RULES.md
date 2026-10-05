# FIRESTORE_RULES.md — Tunas Pick 'Em

Security rules, rationale, and the test matrix. The code block below is the source for `firestore.rules`. Keep them in sync.

These rules deploy to the named database `db-tunaspool` only (`firestore.database` in `firebase.json`). The project's `(default)` database belongs to other apps and must not receive them (`DECISIONS.md` D-015). The rules use the `{database}` wildcard, so nothing in the rules text depends on the database name.

## 1. Design summary

- **Admin:** custom claim `admin == true`.
- **Ownership:** a signed-in user owns a `playerId` when `players/{playerId}.claimedByUid == request.auth.uid`.
- **Lockout:** player writes require `week.status == 'open'` **and** `request.time < week.lockAt`.
- **Hidden picks:** `private/picks` is readable by owner and admin, or by anyone once `week.revealed == true`.
- **Admin writes that need an audit trail** (payments, admin entry edits, results, claims, overrides, merges) are **not allowed from the client**. They go through callable functions using the Admin SDK, which also write `auditLog`.
- **Admin direct writes** are limited to low-risk setup: roster profiles (but never `claimedByUid`), week drafts, and pool config.
- Anonymous users count as signed in. That is intentional, since guests are first-class.

## 2. Rules

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- helpers ----------
    function signedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return signedIn() && request.auth.token.admin == true;
    }

    function playerPath(playerId) {
      return /databases/$(database)/documents/players/$(playerId);
    }

    function ownsPlayer(playerId) {
      return signedIn()
        && exists(playerPath(playerId))
        && get(playerPath(playerId)).data.claimedByUid == request.auth.uid;
    }

    function weekPath(year, weekId) {
      return /databases/$(database)/documents/seasons/$(year)/weeks/$(weekId);
    }

    function weekIsOpen(year, weekId) {
      let w = get(weekPath(year, weekId)).data;
      return w.status == 'open' && request.time < w.lockAt;
    }

    function weekIsRevealed(year, weekId) {
      return get(weekPath(year, weekId)).data.revealed == true;
    }

    function isPaymentMethod(v) { return v in ['cash', 'etransfer']; }

    // Times the client claims must be the server's (DECISIONS.md D-040).
    function isNowOrNull(v) { return v == null || v == request.time; }

    function isDisplayName(v) { return v is string && v.size() > 0 && v.size() <= 60; }
    function isPaymentIntent(v) { return v in ['will_do', 'already_did']; }

    // ---------- players (roster + self-serve profiles) ----------
    match /players/{playerId} {
      // PII (phone, email, notes): owner and admin only. Checked against the doc itself so a
      // login can find its profile with where('claimedByUid', '==', uid): after a guest's profile
      // moves to an existing account, or a claim is approved, playerId no longer equals the uid.
      allow read: if isAdmin()
        || (signedIn() && resource.data.claimedByUid == request.auth.uid);

      // Self-serve: playerId must equal the caller's uid, claimed by that uid.
      allow create: if
        (signedIn()
          && playerId == request.auth.uid
          && request.resource.data.claimedByUid == request.auth.uid
          && request.resource.data.origin == 'self'
          && request.resource.data.keys().hasOnly([
               'displayName', 'phone', 'email', 'claimedByUid', 'origin',
               'usualPayment', 'ageAttestedAt', 'active', 'createdAt', 'updatedAt'])
          && isDisplayName(request.resource.data.displayName)
          && isNowOrNull(request.resource.data.get('ageAttestedAt', null)))
        ||
        // Admin roster: unclaimed, admin-origin, with a name. No email or account is needed.
        (isAdmin()
          && request.resource.data.claimedByUid == null
          && request.resource.data.origin == 'admin'
          && request.resource.data.keys().hasOnly([
               'displayName', 'phone', 'email', 'claimedByUid', 'origin',
               'usualPayment', 'notes', 'active', 'createdAt', 'updatedAt'])
          && isDisplayName(request.resource.data.displayName)
          && request.resource.data.active is bool);

      // Owner may edit contact info only. Admin may edit the roster details, never the link,
      // the origin, or a merge (functions do those).
      allow update: if
        (ownsPlayer(playerId)
          && request.resource.data.diff(resource.data).affectedKeys()
               .hasOnly(['displayName', 'phone', 'email', 'usualPayment', 'ageAttestedAt', 'updatedAt'])
          && isDisplayName(request.resource.data.displayName)
          && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['ageAttestedAt'])
              || request.resource.data.ageAttestedAt == request.time))
        ||
        (isAdmin()
          && request.resource.data.claimedByUid == resource.data.claimedByUid
          && request.resource.data.diff(resource.data).affectedKeys()
               .hasOnly(['displayName', 'phone', 'email', 'usualPayment', 'notes', 'active', 'updatedAt'])
          && isDisplayName(request.resource.data.displayName)
          && request.resource.data.active is bool);

      allow delete: if false; // deactivate via `active`; merges handled by functions

      match /stats/{doc} {
        allow read: if isAdmin() || ownsPlayer(playerId);
        allow write: if false; // functions only
      }
    }

    // ---------- claims ----------
    match /claims/{claimId} {
      allow read: if isAdmin()
        || (signedIn() && resource.data.requesterUid == request.auth.uid);

      // Players may only create their own pending claim via the callable
      // `requestClaim`. Direct client creates are denied so the function can
      // rate limit and compute `suggestedPlayerId`.
      allow create, update, delete: if false;
    }

    // ---------- pool config ----------
    match /config/{doc} {
      // Public-safe fields only. Keep secrets out of this collection.
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    // ---------- audit log ----------
    match /auditLog/{logId} {
      allow read: if isAdmin();
      allow write: if false; // functions only
    }

    // ---------- seasons ----------
    match /seasons/{year} {
      allow read: if signedIn();
      allow write: if isAdmin();

      // ----- weeks -----
      match /weeks/{weekId} {
        // Drafts are admin-only. Everyone signed in can read open/locked/final.
        allow read: if isAdmin() || (signedIn() && resource.data.status != 'draft');

        // Admin may build/edit a week only while it is a draft (or create it).
        // Opening, locking, results, and winner go through callables.
        // Derived fields (revealed, counters, results, winner) start empty and are function-written.
        // `backfilled` lets sheets be entered after the lock without a reason (D-071), so no client
        // may set it, even on a draft.
        allow create: if isAdmin()
          && request.resource.data.status == 'draft'
          && request.resource.data.revealed == false
          && request.resource.data.entryCount == 0
          && request.resource.data.paidCount == 0
          && request.resource.data.winner == null
          && !request.resource.data.keys().hasAny(['backfilled', 'correctedAt']);
        allow update: if isAdmin()
          && resource.data.status == 'draft'
          && !request.resource.data.diff(resource.data).affectedKeys().hasAny([
               'status', 'revealed', 'entryCount', 'paidCount', 'results', 'mnfTotal',
               'winner', 'payoutSent', 'backfilled', 'correctedAt']);
        allow delete: if isAdmin() && resource.data.status == 'draft';

        // ----- entries (one per person per week; doc ID = playerId) -----
        match /entries/{playerId} {
          // Public part: what leaderboards need. No payment details (D-036), no picks.
          allow read: if signedIn();

          allow create: if ownsPlayer(playerId)
            && weekIsOpen(year, weekId)
            && request.resource.data.keys().hasOnly([
                 'playerId', 'displayName', 'enteredBy', 'source', 'paperPhotoPath',
                 'lateOverride', 'picksSubmittedAt', 'createdAt', 'updatedAt'])
            && request.resource.data.playerId == playerId
            && request.resource.data.enteredBy == 'self'
            && request.resource.data.source == 'web'
            && request.resource.data.lateOverride == null
            && request.resource.data.get('paperPhotoPath', null) == null
            && isDisplayName(request.resource.data.displayName)
            && request.resource.data.picksSubmittedAt == request.time;

          // Player edits: their name and a fresh submission time, only while open.
          allow update: if ownsPlayer(playerId)
            && weekIsOpen(year, weekId)
            && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['displayName', 'picksSubmittedAt', 'updatedAt'])
            && isDisplayName(request.resource.data.displayName)
            && request.resource.data.picksSubmittedAt == request.time;

          // Players can withdraw before lock. Admin deletes go through a callable.
          allow delete: if ownsPlayer(playerId) && weekIsOpen(year, weekId);

          // ----- private payment declaration and status (D-036) -----
          // Never revealed. paymentStatus, paidAt, and paidBy are function-written.
          match /payment/{doc} {
            allow read: if doc == 'current' && (isAdmin() || ownsPlayer(playerId));

            allow create: if doc == 'current'
              && ownsPlayer(playerId)
              && weekIsOpen(year, weekId)
              && request.resource.data.keys().hasOnly([
                   'paymentMethod', 'paymentIntent', 'paymentStatus', 'updatedAt'])
              && request.resource.data.paymentStatus == 'unpaid'
              && isPaymentMethod(request.resource.data.paymentMethod)
              && isPaymentIntent(request.resource.data.paymentIntent);

            allow update: if doc == 'current'
              && ownsPlayer(playerId)
              && weekIsOpen(year, weekId)
              && request.resource.data.diff(resource.data).affectedKeys()
                   .hasOnly(['paymentMethod', 'paymentIntent', 'updatedAt'])
              && isPaymentMethod(request.resource.data.paymentMethod)
              && isPaymentIntent(request.resource.data.paymentIntent);

            allow delete: if doc == 'current'
              && ownsPlayer(playerId)
              && weekIsOpen(year, weekId);
          }

          // ----- private picks + tiebreaker -----
          match /private/{doc} {
            allow read: if isAdmin()
              || ownsPlayer(playerId)
              || weekIsRevealed(year, weekId);

            allow create, update: if doc == 'picks'
              && ownsPlayer(playerId)
              && weekIsOpen(year, weekId)
              && request.resource.data.keys().hasOnly(['picks', 'tiebreakerTotal', 'updatedAt'])
              && request.resource.data.picks is map
              && request.resource.data.picks.size() <= 15
              && request.resource.data.tiebreakerTotal is int
              && request.resource.data.tiebreakerTotal >= 0
              && request.resource.data.tiebreakerTotal <= 200
              && request.resource.data.updatedAt == request.time;

            allow delete: if doc == 'picks'
              && ownsPlayer(playerId)
              && weekIsOpen(year, weekId);
          }
        }
      }

      // ----- standings (function-written) -----
      match /standings/{playerId} {
        allow read: if signedIn();
        allow write: if false;
      }
    }

    // ---------- default deny ----------
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Notes on the rules

- **Pick values** (`'home' | 'away'`) and that each key is a real `gameId` can't be fully validated in rules without loops. The `submitEntry` flow validates shape on the client and `onResultsWritten` ignores unknown keys. If stricter validation is wanted later, move submission into a callable.
- **Completeness (a pick for every game, up to 15)** is enforced in the UI. A missing pick scores as a loss.
- **Self-serve profile ordering:** the client must create `players/{uid}` **before** its first entry write. Entry rules call `ownsPlayer()`, which needs the profile to exist.
- **Admin entry edits:** the admin cannot write entries or picks directly from the client. Use `adminUpsertEntry` while open, or `adminLateOverride` (reason required) after lock.
- **Roster (Sprint 4):** an admin adds and edits roster profiles directly from the client. A new roster profile must be unclaimed, `origin: 'admin'`, with a name of 1 to 60 characters and only the roster fields (rows 6, 7, 40). An admin edit may touch `displayName`, `phone`, `email`, `usualPayment`, `notes`, `active`, and `updatedAt` only: never the link, the origin, a merge, or the age confirmation (rows 8, 41). Profiles are never deleted; `active: false` retires one. Only an admin can list the roster (row 42). These writes are not audit logged (D-057).
- **Backfilled weeks (D-071):** `backfilled: true` on a week lets the admin enter sheets after the lock as normal entries. That would be a way round the lock if a client could set it, so the week rules refuse it on create and on every update, drafts included (row 49). Only a script with the Admin SDK sets it. `correctedAt` is kept out of client writes the same way.
- **Reveal and corrections (Sprint 6):** no rule changed. The week page reads the entries list and each entry's `private/picks` only after `revealed == true`, which the picks rule has always required (rows 20, 21, 47). A correction to a final week is `adminCorrectResults` with the Admin SDK: the week update rule only allows draft edits, so no client can write `correctedAt`, results, or the winner (row 48).
- **Claims (Sprint 5):** no rule changed. Rows 44 to 46 pin down that asking reveals nothing: the claim document is readable only by its requester and the admin and is never client-writable, and a roster profile, its picks, and its payment are readable only by the login in `claimedByUid`. Approval and unlinking are the Admin SDK changing that one field.
- **`claimedByUid` is never client-writable.** The owner-update rule limits affected keys, and the admin-update rule requires the field to be unchanged.
- **Payment is private (D-036):** the public entry has no payment fields, so leaderboards and the reveal can read entries freely. Method and intent live in `payment/current`, which only the owner and admin can read, before or after the reveal. Players may change method and intent while the week is open; `paymentStatus`, `paidAt`, and `paidBy` are function-written.
- **Function-written entry fields (Sprint 3):** `record` is written only by functions. It is not in the create or update key lists, so a player cannot set it (row 37). Results, the winner, the payout flag, and the status are never client-writable by anyone, admin included (row 38): the audited callables write them.
- **Server times (D-040):** `picksSubmittedAt` on the entry and `updatedAt` on the picks must equal `request.time` (the client sends `serverTimestamp()`). The receipt's time and confirmation code come from that value.
- **Listing weeks:** players must filter by `status in ['open', 'locked', 'final']`. The rule checks each document, so an unfiltered query is rejected because it could include drafts.
- **Finding your profile:** a login reads its profile with `where('claimedByUid', '==', uid)`, which the player read rule allows because it checks the document's own `claimedByUid`. After `adoptGuestProfile` or an approved claim, the `playerId` is no longer the login's `uid`, so the client must never assume `players/{uid}`. A direct read of a profile that does not exist is denied rather than returned empty, so use the query.
- **Draft weeks:** an admin edits a draft directly from the client, but the rules keep derived fields out of reach: a new week must start with `revealed: false`, zero counters, and no winner, and draft edits cannot touch `status`, `revealed`, the counters, results, the winner, or `payoutSent`. Status changes go through `adminSetWeekStatus`.

## 3. Storage rules

Paper-sheet photos live in the pool's own bucket, `tunaspool-paper-sheets` (D-029, D-058), never the project's shared default bucket. `firebase.json` names the deploy target `paperSheets` and `.firebaserc` maps it to the bucket, so `firebase deploy --only storage` can only reach that bucket.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Photos of paper sheets (D-029). Admin only, images only, 5 MB at most: the app shrinks a
    // phone photo well below that before it uploads.
    match /paperSheets/{year}/{weekId}/{file} {
      allow read, delete: if request.auth != null && request.auth.token.admin == true;
      allow create, update: if request.auth != null && request.auth.token.admin == true
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

The app shrinks a phone photo to about 1600px before it uploads, so 5 MB is generous. The path is `paperSheets/{year}/{weekId}/{playerId}-{time}.jpg`, and `adminUpsertEntry` only accepts a `paperPhotoPath` inside that week's folder.

## 4. Admin claim bootstrap

One-off Node script, run locally with a service account (never shipped to the client):

```ts
import { getAuth } from 'firebase-admin/auth';
await getAuth().setCustomUserClaims(ADMIN_UID, { admin: true });
// The admin signs out and back in (or force-refreshes the ID token) to pick it up.
```

## 5. Test matrix (`npm run test:rules`)

Each row is at least one passing and one failing test.

| # | Scenario | Expected |
|---|---|---|
| 1 | Anonymous user creates `players/{uid}` for themselves | allow |
| 2 | Anonymous user creates `players/{otherId}` | deny |
| 3 | Owner updates own `phone` | allow |
| 4 | Owner updates `claimedByUid` | deny |
| 5 | Non-owner reads `players/{id}` | deny |
| 5b | A login queries `players` by its own `claimedByUid`; queries for another uid or without the filter | allow / deny |
| 6 | Admin creates roster player with `claimedByUid: null` | allow |
| 7 | Admin creates roster player with a non-null `claimedByUid` | deny |
| 8 | Admin updates player and changes `claimedByUid` | deny |
| 9 | Owner creates entry while week open | allow |
| 10 | Owner creates entry at or after `lockAt` | deny |
| 11 | Owner creates entry when week is `draft`, `locked`, or `final` | deny |
| 12 | Owner creates `payment/current` with `paymentStatus: 'paid'` | deny |
| 12b | Owner puts payment fields on the public entry | deny |
| 13 | Owner updates `paymentStatus` or `paidAt`; changes method or intent while open | deny / allow |
| 14 | Owner creates an entry for someone else's `playerId` | deny |
| 15 | Second submit for same `playerId` edits the same doc (no duplicate possible) | allow, one doc |
| 16 | Owner writes picks while open | allow |
| 17 | Owner writes picks after lock | deny |
| 18 | Picks `tiebreakerTotal` negative, non-integer, or over 200 | deny |
| 19 | Picks map with more than 15 keys | deny |
| 20 | Other signed-in user reads `private/picks` before reveal | deny |
| 21 | Other signed-in user reads `private/picks` after `revealed == true` | allow |
| 22 | Owner and admin read `private/picks` before reveal | allow |
| 23 | Any client creates, updates, or deletes `claims` directly | deny |
| 24 | Claimant reads own claim; other users read it | allow / deny |
| 25 | Any client writes `auditLog`, `standings`, or `stats` | deny |
| 26 | Admin reads `auditLog` | allow |
| 27 | Non-admin reads a `draft` week | deny |
| 28 | Admin edits a week while `draft`; edits after `open` | allow / deny |
| 29 | Admin attempts to set `revealed: true` directly (on create or update) | deny |
| 29b | Admin sets `entryCount`, `paidCount`, or `winner` from the client | deny |
| 30 | Admin writes an entry or picks directly from the client | deny |
| 31 | Unauthenticated read or write anywhere | deny |
| 32 | Storage: non-admin reads or writes `paperSheets/*` | deny |
| 33 | Other player reads `payment/current`, before or after reveal; owner and admin read it | deny / allow |
| 34 | Client sets `picksSubmittedAt` or picks `updatedAt` to anything but the server time | deny |
| 35 | `ageAttestedAt` set to anything but the server time | deny |
| 36 | Player lists weeks filtered to `open`, `locked`, `final`; unfiltered or `draft` | allow / deny |
| 37 | Player writes `record` on an entry (create or update); any signed-in user reads it | deny / allow |
| 38 | Admin writes `results`, `mnfTotal`, `winner`, `payoutSent`, or `status` on a week from the client | deny |
| 39 | Admin reads any entry's `payment/current` and `private/picks` and lists entries; another player reads `payment/current` | allow / deny |
| 40 | Admin creates a roster player with only a name; with an empty or over-long name, a non-boolean `active`, `mergedInto`, or `origin: 'self'`; a player creates one | allow / deny / deny |
| 41 | Admin edits roster details and `active`; changes `origin`, `mergedInto`, or `ageAttestedAt`, blanks the name, or deletes the profile | allow / deny |
| 42 | Admin lists all `players`; a player lists them, filters by `origin`, or reads a roster profile | allow / deny |
| 43 | Storage: admin uploads a paper-sheet photo that is not an image, or is over 5 MB; uploads, replaces, and deletes an image; a player deletes one | deny / allow / deny |
| 44 | A login with a pending or rejected claim reads the roster profile it named, queries `players` by that phone or name, reads that profile's picks, payment, or stats, or writes as that player | deny |
| 45 | A player queries `claims` by their own `requesterUid`; lists all claims, filters by status, reads another login's claim, approves their own claim, or creates one directly; admin lists claims | allow / deny / allow |
| 46 | Once `claimedByUid` is set to a login (approval), it reads the profile, finds it by query, reads its picks and payment, and edits the entry while open, but cannot hand the profile on or mark it paid; once cleared (unlink), all of that is denied again | allow / deny / deny |
| 47 | Any signed-in player lists a revealed week's entries and reads each entry's picks; reads a payment there; reads picks in a week not yet revealed; rewrites revealed picks | allow / deny / deny / deny |
| 48 | Admin or player writes `correctedAt`, `results`, `winner`, or `payoutSent` on a final week from the client | deny |
| 49 | Admin creates a draft week with `backfilled` or `correctedAt` set, or sets `backfilled` on a draft or a locked week; creates and edits a plain draft | deny / allow |
