# DECISIONS.md

ADR-style log. Add an entry for every non-obvious decision. Status: **Accepted** (settled) or **Provisional** (default applied, needs confirmation from the commissioner).

| ID | Date | Decision | Status |
| --- | --- | --- | --- |
| D-001 | 2026-10-04 | Entry document ID = `playerId`, enforcing one set of picks per person per week | Accepted |
| D-002 | 2026-10-04 | Self-serve `playerId` = the player's first `uid`; roster profiles use generated IDs | Accepted |
| D-003 | 2026-10-04 | Audited admin actions go through callable Cloud Functions; clients never write `paymentStatus`, `claimedByUid`, `revealed`, standings, or auditLog | Accepted |
| D-004 | 2026-10-04 | Every claim requires admin approval in v1 (no auto-claim) | Accepted |
| D-005 | 2026-10-04 | Design palette is Baltimore Ravens (purple `#241773`, black, gold, red for urgency only) on the paper sheet's layout language | Accepted |
| D-006 | 2026-10-04 | Use brighter UI gold `#D9AF26` (black text) for buttons; official gold `#9E7C0C` only for large text and graphics (3.9:1 on white) | Provisional |
| D-007 | 2026-10-04 | Fonts: Alfa Slab One (wordmark), Barlow Condensed (headings), Barlow (body), self-hosted via Fontsource | Provisional (confirm vs original artwork) |
| D-008 | 2026-10-04 | Tied NFL game: no one gets a win | Provisional |
| D-009 | 2026-10-04 | Only paid entries are eligible to win | Provisional |
| D-010 | 2026-10-04 | Tiebreaker among entries at or above the MNF total: lowest prediction wins | Provisional (confirm against how the pool has been run) |
| D-011 | 2026-10-04 | Default lock time Saturday 11:59 PM America/Toronto, editable per week | Provisional |
| D-012 | 2026-10-04 | Cloud Functions region `northamerica-northeast1` (Montreal). ~~Create Firestore in Montreal or Toronto~~: superseded by D-016 | Provisional (revisit region, see D-016) |
| D-013 | 2026-10-04 | Local emulators use the `demo-tunas-pool` project id so no real Firebase login is needed for dev and tests | Accepted |
| D-014 | 2026-10-04 | Ravens red `#C60C30` kept for urgency and errors only; revisit if the commissioner prefers purple, black, and gold only | Provisional |
| D-015 | 2026-10-04 | Production runs in the existing, shared Firebase project `lilypad-strategy-design` (alias `prod`) rather than a dedicated one. The pool is isolated by its own Hosting site `tunaspool` and its own named Firestore database `db-tunaspool`, both pinned in `firebase.json`. Auth users, custom claims (including `admin`), and the default Storage bucket are shared with the project's other apps; Ryan accepted this. The functions codebase is named `tunaspool` so deploys cannot prune other apps' functions | Accepted |
| D-016 | 2026-10-04 | Firestore database `db-tunaspool` was created in `nam5` (US multi-region), not Montreal or Toronto as D-012 planned. Location cannot be changed without recreating the database. Player data is therefore stored in the US | Accepted as built (confirm residency is acceptable) |
| D-017 | 2026-10-04 | Soft-launch domain is the Firebase default `https://tunaspool.web.app` (PROJECT_PLAN §7 item 8) | Accepted |
| D-018 | 2026-10-04 | All code reaches Firestore through `FIRESTORE_DATABASE_ID` in `shared/config.ts`; bare `getFirestore()` is not allowed because `(default)` belongs to other apps | Accepted |
| D-019 | 2026-10-05 | Continuous deployment: a push to `main` that passes CI deploys Hosting, Firestore rules, and Firestore indexes to production (`deploy` job in `ci.yml`, service-account key in the `FIREBASE_SERVICE_ACCOUNT` secret). `--force` makes `firestore.indexes.json` the source of truth for `db-tunaspool`. Functions are left out until they are implemented (16 stubs and a per-minute no-op today); Storage is left out because the bucket is shared (D-015) | Accepted |
| D-020 | 2026-10-05 | Adopted from the external plan review: a weekly home screen (built up over Sprints 2, 3, 6, 7), confirmation codes on receipts (S2), per-pick marks and best possible record (S6), past-weeks browser, player profiles, and extra admin stats (S7), an admin reminder list and a share card without payment status (S8), and fuzzy-name and email duplicate flags (S3). Hall of Fame parked until Sprint 10. See PROJECT_PLAN §4 and §8 | Accepted |
| D-021 | 2026-10-05 | No pre-lock pick hints ("most people picked…"). Any aggregate of picks before `revealed == true` leaks private picks and lets late pickers fade the crowd | Accepted |
| D-022 | 2026-10-05 | Duplicate detection uses phone, email, normalized name, and fuzzy name, as flags only. No device fingerprinting or IP matching: privacy-invasive, and false positives for households and for entries the admin makes from their own phone | Accepted |
| D-023 | 2026-10-05 | No streak stats (current or longest streak) on profiles, leaderboards, or a Hall of Fame. Follows the no-streak-pressure rule in PERSONAS (Slump stage, Kayla, The Chaser) | Accepted |
| D-024 | 2026-10-05 | Login upgrade: email link ships in Sprint 1 as the upgrade and recovery path for guests; Google sign-in moves to Sprint 7. The review suggested deferring all upgrades, but a guest who loses browser storage (cleared, or Safari removing data for sites not visited in 7 days) loses access to their entry. Claims stay in Phase 2 because they connect seniors' paper history | Accepted |
| D-025 | 2026-10-05 | The pot and entry count shown to players come from function-written `entryCount` and `paidCount` on the week doc, not from players counting entries. This keeps working if payment status is later hidden from other players (PERSONAS Spec Impact Log #1) | Accepted |
| D-026 | 2026-10-05 | Confirmation code is derived, not stored: a short hash of year, week, `playerId`, and `picksSubmittedAt` (DATA_MODEL §10). No schema change; Sprint 2 adds the rule that `picksSubmittedAt == request.time` so the time behind it is server time | Accepted |
| D-027 | 2026-10-05 | Reminders: the main path is an admin list of who hasn't entered or paid, with tap-to-text. The automatic email goes only to non-entrants with an email on file. Payment nudges are always admin-triggered | Accepted |

## Open (no default yet)
- Functions region now that Firestore is in `nam5`: stay in Montreal (D-012) or move to a US region next to the data. Must be settled before the first Firestore trigger is written, since a trigger's region is tied to the database location
- Storage in the shared project: `storage.rules` ends in deny-all and would replace the rules on the shared default bucket. Use a dedicated bucket for paper-sheet photos, or merge rules with the other apps. Do not deploy `storage` until decided
- Legal and regulatory check for running the pool (blocks public launch)
- e-Transfer address for `config/pool`
- How US-side players pay and receive winnings (see docs/PERSONAS.md §6)
- Age attestation wording and legal age to use
- Which spec changes from PERSONAS.md §6 "Spec Impact Log" to adopt
