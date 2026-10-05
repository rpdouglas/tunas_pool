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
    function isPaymentIntent(v) { return v in ['will_do', 'already_did']; }

    // ---------- players (roster + self-serve profiles) ----------
    match /players/{playerId} {
      // PII (phone, email, notes): owner and admin only.
      allow read: if isAdmin() || ownsPlayer(playerId);

      // Self-serve: playerId must equal the caller's uid, claimed by that uid.
      allow create: if
        (signedIn()
          && playerId == request.auth.uid
          && request.resource.data.claimedByUid == request.auth.uid
          && request.resource.data.origin == 'self'
          && request.resource.data.keys().hasOnly([
               'displayName', 'phone', 'email', 'claimedByUid', 'origin',
               'usualPayment', 'active', 'createdAt', 'updatedAt'])
          && request.resource.data.displayName is string
          && request.resource.data.displayName.size() > 0
          && request.resource.data.displayName.size() <= 60)
        ||
        // Admin roster: unclaimed, admin-origin.
        (isAdmin()
          && request.resource.data.claimedByUid == null
          && request.resource.data.origin == 'admin');

      // Owner may edit contact info only. Admin may edit anything except the link.
      allow update: if
        (ownsPlayer(playerId)
          && request.resource.data.diff(resource.data).affectedKeys()
               .hasOnly(['displayName', 'phone', 'email', 'usualPayment', 'updatedAt']))
        ||
        (isAdmin()
          && request.resource.data.claimedByUid == resource.data.claimedByUid);

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
        allow create: if isAdmin() && request.resource.data.status == 'draft';
        allow update: if isAdmin()
          && resource.data.status == 'draft'
          && request.resource.data.status == 'draft'
          && request.resource.data.revealed == false;
        allow delete: if isAdmin() && resource.data.status == 'draft';

        // ----- entries (one per person per week; doc ID = playerId) -----
        match /entries/{playerId} {
          // Names, payment declaration, and paid badge are not secret. Picks are.
          allow read: if signedIn();

          allow create: if ownsPlayer(playerId)
            && weekIsOpen(year, weekId)
            && request.resource.data.playerId == playerId
            && request.resource.data.enteredBy == 'self'
            && request.resource.data.source == 'web'
            && request.resource.data.paymentStatus == 'unpaid'
            && request.resource.data.lateOverride == null
            && isPaymentMethod(request.resource.data.paymentMethod)
            && isPaymentIntent(request.resource.data.paymentIntent)
            && request.resource.data.displayName is string
            && request.resource.data.displayName.size() > 0
            && request.resource.data.displayName.size() <= 60
            && request.resource.data.keys().hasOnly([
                 'playerId', 'displayName', 'paymentMethod', 'paymentIntent',
                 'paymentStatus', 'enteredBy', 'source', 'paperPhotoPath',
                 'lateOverride', 'picksSubmittedAt', 'createdAt', 'updatedAt']);

          // Player edits: only their declaration and name, only while open.
          allow update: if ownsPlayer(playerId)
            && weekIsOpen(year, weekId)
            && request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['displayName', 'paymentMethod', 'paymentIntent',
                           'picksSubmittedAt', 'updatedAt'])
            && isPaymentMethod(request.resource.data.paymentMethod)
            && isPaymentIntent(request.resource.data.paymentIntent);

          // Players can withdraw before lock. Admin deletes go through a callable.
          allow delete: if ownsPlayer(playerId) && weekIsOpen(year, weekId);

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
              && request.resource.data.tiebreakerTotal <= 200;

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
- **Completeness (all 15 picks)** is enforced in the UI. A missing pick scores as a loss.
- **Self-serve profile ordering:** the client must create `players/{uid}` **before** its first entry write. Entry rules call `ownsPlayer()`, which needs the profile to exist.
- **Admin entry edits:** the admin cannot write entries or picks directly from the client. Use `adminUpsertEntry` while open, or `adminLateOverride` (reason required) after lock.
- **`claimedByUid` is never client-writable.** The owner-update rule limits affected keys, and the admin-update rule requires the field to be unchanged.

## 3. Storage rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /paperSheets/{year}/{weekId}/{file} {
      allow read, write: if request.auth != null && request.auth.token.admin == true;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

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
| 6 | Admin creates roster player with `claimedByUid: null` | allow |
| 7 | Admin creates roster player with a non-null `claimedByUid` | deny |
| 8 | Admin updates player and changes `claimedByUid` | deny |
| 9 | Owner creates entry while week open | allow |
| 10 | Owner creates entry at or after `lockAt` | deny |
| 11 | Owner creates entry when week is `draft`, `locked`, or `final` | deny |
| 12 | Owner creates entry with `paymentStatus: 'paid'` | deny |
| 13 | Owner updates `paymentStatus` | deny |
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
| 29 | Admin attempts to set `revealed: true` directly | deny |
| 30 | Admin writes an entry or picks directly from the client | deny |
| 31 | Unauthenticated read or write anywhere | deny |
| 32 | Storage: non-admin reads or writes `paperSheets/*` | deny |
