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
| D-012 | 2026-10-04 | Cloud Functions region `northamerica-northeast1` (Montreal); create Firestore in Montreal or Toronto | Accepted |
| D-013 | 2026-10-04 | Local emulators use the `demo-tunas-pool` project id so no real Firebase login is needed for dev and tests | Accepted |
| D-014 | 2026-10-04 | Ravens red `#C60C30` kept for urgency and errors only; revisit if the commissioner prefers purple, black, and gold only | Provisional |

## Open (no default yet)
- Legal and regulatory check for running the pool (blocks public launch)
- e-Transfer address for `config/pool`
- How US-side players pay and receive winnings (see docs/PERSONAS.md §6)
- Age attestation wording and legal age to use
- Which spec changes from PERSONAS.md §6 "Spec Impact Log" to adopt
