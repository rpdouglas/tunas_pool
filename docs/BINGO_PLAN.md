# BINGO_PLAN.md — Weekly 649 Bingo (Phase 6)

> The plan for building Weekly 649 Bingo inside `tunas_pool`, the same way the pool was built: docs first, rules tests before rules, one sprint at a time, each ending green and mergeable.
> Sources: `docs/bingo/BUILD_SPEC.md` (Ryan, 2026-10-20) and its review, `docs/reports/2026-10-20-bingo-spec-review.md` (findings R-1 to R-25).
> Status: **proposed**. Nothing here is built. Sprint 11 turns it into the governing docs.

## 1. Goal and non-goals

**Goal.** A hidden, invite-only weekly game on the Wednesday Lotto 6/49 numbers. Members buy up to five cards of six numbers for a cycle. Each paid draw crosses off matching numbers. The first cards to cross off all six split the pot. Staff confirm every payment and approve every draw. Everything that touches money or results is a function, audited, and tested against the emulator.

**Non-goals for v1:**
- Online payment or prepaying ahead (R-8).
- Push or email notifications (R-22).
- An automatic draw fetch before a reliable source is confirmed. Manual entry comes first.
- Saturday draws, unless Ryan decides otherwise (R-17).
- Any named view of who spends the most (R-20).
- Switching it on before the gates in §2 pass.

## 2. Gates

Gates sit outside the code. A sprint can't start, or the feature can't be switched on, until its gate passes. Each gate is recorded as a decision in `DECISIONS.md`.

| Gate | Before | Passes when | Owner |
|---|---|---|---|
| **G0 Legal basis** | Sprint 12, the first code | A lawyer has said whether and how this can run in Ontario (and for New York players), and the answer fits the spec. If it says "only as a charity", "only with 0% operator", or "no", the plan is re-cut before any code (R-1). | Ryan |
| **G1 Rules of the house** | Sprint 12 | The bingo responsible-play standard is in PERSONAS and CLAUDE.md §10 points at it (R-2). Sprint 11's open decisions are answered, or a stated default is logged. | Ryan, with Claude drafting |
| **G2 Launch** | `bingo/config.enabled = true` with real money | G0 holds for the final design. The dry run (Sprint 16) paid out correctly. The move to the pool's own Firebase project is done (D-100, R-3). Launch price, operator %, and code are set. The responsible-play link numbers are verified. | Ryan |

## 3. Phases at a glance

| Phase | Sprints | Outcome |
|---|---|---|
| 6a Spec | S11 | The spec, corrected by the review, is in the governing docs. Decisions are logged. Gates G0 and G1 are passed or the plan is re-cut. |
| 6b Engine and rules | S12 | `shared/bingo.ts` is proven against a committed simulation. Every bingo path in the security rules is tested. |
| 6c Functions | S13 | Every callable exists with integration tests. A full cycle runs end to end in the emulator with no UI. |
| 6d Player side | S14 | Join, cards, board, history, and rules screens at 375px, in the design system. |
| 6e Staff side | S15 | Draw entry and approval, payments, payouts, settings, paper cards, and the totals view, in the Back Office. |
| 6f Fetch and dry run | S16 | The automatic draw fetch (if a source is confirmed), hardening, and a full dry run in a test cycle with no money. |

These are the spec's Sprints 11 to 15, re-cut into six (R-24). The spec's Sprint 12 held the engine, two functions, and all the rules. Its Sprint 14 held every staff screen and the fetch. With this repo's definition of done, each would have ended half-finished.

## 4. Proposed data model (to settle in Sprint 11)

This is the spec's model with the review's fixes. Money is integer cents. ✍ marks function-written fields.

| Path | Holds | Read by | Written by |
|---|---|---|---|
| `bingo/config` | `enabled`, `priceCents`, `operatorPct`, cutoff (Wed 18:00 America/Toronto), `maxCardsPerPlayer` (5), `maxWeeks` (26), `joinWindowDraws` (1), odds text | members, staff | admin (rules: admin only, typed fields) |
| `bingo/secret` | invite code hash, `codeVersion` | nobody (functions) | function `bingoSetCode` (admin) |
| `bingoMembers/{playerId}` ✍ | `displayName`, `joinedAt`, `ageAttestedAt`, `limit` (cards per draw, pending raise), `pausedUntilCycle`, `paper` (staff-entered) | members (names only), staff, owner (limits) | `bingoRedeemCode`, `bingoSetLimit`, staff paper add (R-4) |
| `bingoRedeemAttempts/{uid}` ✍ | `count`, `lockedUntil` | nobody | `bingoRedeemCode` (R-14) |
| `bingoCards/{cardId}` ✍ | `playerId`, `numbers` (six, sorted), `active`, `createdAt`, `createdBy` | owner, staff; members see only what the board allows (R-19) | `bingoCreateCard`, `bingoRetireCard` (R-9) |
| `bingoCycles/{cycleId}` ✍ | `status` (`open`, `won`, `capped`), `test`, opened and closed dates, snapshot of price, operator % and caps, `potCents`, `operatorCents`, winners, payouts | members, staff | functions (R-16) |
| `bingoCycles/{c}/entries/{cardId}` ✍ | `playerId`, `joinedDraw`, `paidDraws[]`, `hits[]` (derived), `count` | owner, staff; board counts only | `bingoCreateCard` and renewals, `applyDraw` (R-9, R-11) |
| `bingoCycles/{c}/draws/{drawDate}` ✍ | `status` (`upcoming`, `proposed`, `approved`, `skipped`), `numbers`, `source`, `proposedBy`/`approvedBy`, `correction` and reason, `potCents` and `operatorCents` for that draw | members (approved only), staff | opened with the week, then `bingoEnterDraw` / fetch, `bingoApproveDraw`, `bingoCorrectDraw`, `bingoSkipDraw` (R-10) |
| `bingoCycles/{c}/draws/{d}/payments/{cardId}` ✍ | `method`, `receivedAt`, `confirmedBy`, `confirmedAt`, `late`, `reason`, `intent` (player's "will pay cash" / "sent an e-Transfer") | owner (paid or not, and intent), staff | `bingoSetPayment` (staff), `bingoSetIntent` (owner) (R-8, R-13) |
| `logins/{uid}` | the existing D-102 pointer | owner | `boardJoin` logic, reused (R-5) |

**Derived, never added to.** A card's hits are worked out from the cycle's approved draws and that card's paid draws, every time `applyDraw` runs (R-11). The winners, pot, and splits are worked out the same way. So approving twice, or correcting after approval, is safe.

## 5. Sprint plan

Every sprint follows CLAUDE.md §7:
- read `ACTIVE_CYCLE.md`;
- run the persona check, which for bingo includes the bingo responsible-play check from G1;
- write the rules tests before the rules;
- put docs in the same commit;
- run `typecheck`, `test`, and `test:rules`, plus `test:smoke` once screens exist;
- open one PR per sprint, which merging deploys.

Bingo stays dark in production throughout. `enabled` is false and the route renders "not found" (R-25), so merging each sprint is safe.

### Sprint 11 — Spec (Phase 6a, docs only)

**Goal:** the governing docs say exactly what will be built. The open decisions are answered or defaulted. G0 and G1 are passed or the plan is re-cut.

**Tasks:**
- `DECISIONS.md` gets D-110 onward:
  - the spec's seven "decisions so far", restated;
  - a line for every open item in §6 below, answered or with its default and **Provisional**;
  - G0 and G1 when they pass.
- `PERSONAS.md` gets a bingo addendum (R-2):
  - who plays it;
  - the bingo responsible-play standard (what bingo allows: up to 5 cards, weekly renewal; what it never does: prepay, tabs, named spend lists, "almost there" prompts, raising a limit for someone);
  - its check question for every bingo sprint;
  - CLAUDE.md §10 amended to point at it.
- `DATA_MODEL.md` gets a new §9 "Weekly 649 Bingo":
  - §4 above, made final;
  - the week as a timeline (Thursday open → Wednesday 6 PM cutoff → draw → approve → apply);
  - worked examples: a tie, an uneven split in cents, a missed week, the 26-week cap (R-18), a late payment received before the cutoff and confirmed after (R-13).
- `FIRESTORE_RULES.md`: the bingo rules in plain words and the test matrix rows drafted from row 67 onward, with no rules code yet.
- `PROJECT_PLAN.md`: Phase 6 in the phases table, pointing here. `ACTIVE_CYCLE.md`: Sprint 11.
- The persona check for the whole feature, written once and reused: Rosalie (a paper member), Gerald (can a member check a win?), the Commissioner and Devon (a week's work at the counter), Troy (the border test), Jen (the welcome), and the new responsible-play check.

**Acceptance:** docs merged with no code. Every open decision has a D-number. G0 and G1 are recorded, or the plan is revised.

### Sprint 12 — Engine and rules (Phase 6b)

**Goal:** the rules of the game exist as pure, tested code. The database refuses everything it should.

**Tasks:**
- `shared/bingo.ts`, all pure:
  - validate a card (six distinct numbers, 1 to 49);
  - quick-pick from an injected random source;
  - hits from approved draws and paid draws;
  - winners on a draw;
  - the split in cents (R-15);
  - pot and operator share per draw;
  - the 26-week cap ranking (R-18);
  - the join window (R-12);
  - which draw a payment is credited to, given `receivedAt` and the cutoff (R-13);
  - the limits (lower now, raise next cycle).
- `shared/bingo.test.ts`, with the worked examples from DATA_MODEL §9 as fixtures.
- `scripts/bingo-sim.ts`, seeded, built on `shared/bingo.ts` (R-23). It reproduces the spec's table (cycle length, tie rate, cents back per dollar by join week) within a stated tolerance, and a test runs a short version.
- `firestore.rules`: the bingo section, written after its tests.
  - Default deny.
  - Members and staff read through `logins/{uid}` and `bingoMembers`.
  - Owners read their own cards and payments.
  - Clients write only the payment intent and nothing else.
  - The board's reads are limited per R-19.
- `tests/rules`: the drafted rows. `docs/FIRESTORE_RULES.md` is synced.

**Acceptance:** the simulation matches the model, and every drafted rules row passes. Also all existing tests (343 unit, 162 rules and functions at D-109) still pass.

### Sprint 13 — Functions (Phase 6c)

**Goal:** every money and result action is a callable with an integration test, and a whole cycle runs in the emulator.

**Tasks:**
- `functions/src/bingo/`. Each callable checks its role, runs in a transaction, writes `auditLog` with a plain-words entry in `shared/auditText.ts`, and gets an integration test in `*.int.test.ts`.
- **Membership and cards:**
  - `bingoRedeemCode`: a saved account, 18+, the attempt counter, sets `bingoMembers` and `logins` (R-7, R-14).
  - `bingoSetCode` (admin).
  - `bingoCreateCard`: join window, cap, limit, pause.
  - `bingoRetireCard`.
  - `bingoSetLimit`: lowering applies now, raising waits a cycle, and staff can't raise it.
- **Payments:**
  - `bingoSetIntent` (owner).
  - `bingoSetPayment`: staff; `receivedAt`; a reason after the cutoff; the counter's scope per the R-6 decision.
- **Draws:**
  - `bingoEnterDraw`: manual, proposes.
  - `bingoApproveDraw`, then `applyDraw`, which is idempotent and recomputes.
  - `bingoCorrectDraw`: admin only, a reason, also after approval and before payout (R-11).
  - `bingoSkipDraw`.
- **Payout and the next cycle:**
  - `bingoSetPayout`.
  - Cycle close and open on a win or the cap, with config snapshotted into the new cycle.
- **The end-to-end test:** a script in the integration suite runs cards, then payments, then draws, then a tie win, then payout, then the next cycle. It covers a missed week, a late payment, the cap, and a correction.

**Acceptance:** the end-to-end integration test passes. Every callable refuses the wrong role and bad input, and every action has an audit entry.

### Sprint 14 — Player screens (Phase 6d)

**Goal:** a first-timer joins and adds a card at 375px without help.

**Tasks:**
- Lazy `src/features/bingo/` chunk, `noindex`, renders not found while disabled (R-25). The Game Day surface.
- **`/b`:** enter the code, with age, account, and plain words on what this is.
- **`/b/cards`:**
  - the 1 to 49 grid with crossed-off numbers, said in words as well as shown;
  - the paid weeks per card;
  - the "I'll pay cash / I sent an e-Transfer" intent;
  - add a card, by hand or quick-pick, up to the cap, with the join window explained;
  - the spend this cycle and this season in dollars;
  - limits and pause.
- **`/b/board`:** the pot, and counts of cards at 3, 4 and 5 (R-19). Names only if decided.
- **`/b/history`:** past cycles, winners, pot, the week of the win.
- **`/b/rules`:** the rules and the odds in plain words, from the cycle's config (R-21), and the responsible-play link.
- Every component gets a styleguide entry; `test:smoke` gets visits; `test:a11y` passes.

**Acceptance:** the Jen walkthrough (code to first card) and the Rosalie walkthrough (reading a card and knowing whether it's paid) both work at 375px and at Extra large text. The bingo responsible-play check passes for every screen.

### Sprint 15 — Staff screens (Phase 6e)

**Goal:** a full test cycle runs from cards to payout through the UI.

**Tasks:**
- Back Office, the Back Office surface:
  - **`/admin/bingo/draw`:** enter, approve, correct (admin), skip; the Back Office banner when a draw waits (R-22).
  - **`/admin/bingo/payments`:** every card for this draw, paid or not, cash or e-Transfer, late with a reason, then winner payouts. Built for the counter at the shop: one tap per card, Undo.
  - **`/admin/bingo/settings`:** price, operator %, cutoff, cap, weeks, code rotation, on and off. Changes apply from the next cycle, and the screen says so.
  - **Paper members and cards:** staff add a member and cards for someone without a phone, the way paper sheets work today.
  - **Totals view:** the share of spend from 4 to 5 card players and how many are at the cap, as totals only (R-20).
- The smoke run covers the staff screens.

**Acceptance:** in the emulator with a seeded test cycle, the commissioner and the counter do a month of weeks through the screens: payments, a late payment, a missed week, a draw with a typo corrected, a tie win, and payouts. The numbers match `shared/bingo.ts`.

### Sprint 16 — Fetch, hardening, dry run (Phase 6f)

**Goal:** ready for G2 except the gates outside the code.

**Tasks:**
- `bingoFetchDraw`, scheduled for Wednesday night with retries Thursday morning and midday, only if a reliable source is confirmed (open item). It proposes, never approves, and staff see the source beside the numbers. If no source is confirmed, it's parked and manual entry stays.
- Audit text for every bingo action, read on the Audit log screen.
- `test:smoke`, `test:a11y`, and a Lighthouse check on the bingo chunk. The pool's first screen doesn't grow: the bingo chunk never loads for pool players.
- **The dry run:** a test cycle (`test: true`) with real people and no money, over real Wednesdays, until a win and a payout are recorded correctly.
- README: running a bingo week, settling a bingo dispute.

**Acceptance:** the dry run ends with a correct payout, checked by hand against the draws. Then G2 is Ryan's.

## 6. Open decisions (answer in Sprint 11)

The spec's open items, plus those the review adds. Each becomes a D-number, answered, or given its default and marked **Provisional**, as the pool's were.

| # | Decision | Proposed default | From |
|---|---|---|---|
| 1 | Legal basis in Ontario and for New York players | none: gate G0 | spec, R-1 |
| 2 | The bingo responsible-play standard | as drafted in Sprint 11 | R-2 |
| 3 | Run bingo only after the move to its own project | yes (G2) | R-3 |
| 4 | What the counter can do in bingo (e-Transfers? approve draws?) | cash and draw approval, as the spec says; e-Transfers admin only, as D-095 | R-6 |
| 5 | Saved account and 18+ to join | yes, or a staff-entered paper member | R-7, spec |
| 6 | Prepay several draws | no | R-8 |
| 7 | Join window: first draw only, or first two | first draw only | spec |
| 8 | Self-set limits also bind staff-entered paper cards | yes | spec |
| 9 | Credit late money by when it was received, not when it was confirmed | yes | R-13 |
| 10 | Uneven split: order and remainder | by card ID, one cent each from the first | R-15 |
| 11 | The 26-week cap: who splits, and the worked example | the most crossed off among cards paid for the last draw | spec, R-18 |
| 12 | Wednesday only, or Wednesday and Saturday | Wednesday only | R-17 |
| 13 | Board: names and numbers, or counts only | counts only | spec, R-19 |
| 14 | Launch price and operator % | none: set at G2 | spec |
| 15 | Draw source for the automatic fetch | manual until confirmed | spec |
| 16 | Payment cutoff: Wednesday 6 PM, money in hand | yes | spec |

## 7. Cross-cutting (every bingo sprint)

- The bingo responsible-play check is in every sprint's persona check, beside the existing tests.
- No money path without an audit entry, and no audit entry without a plain-words line in `shared/auditText.ts`.
- `docs/FIRESTORE_RULES.md` stays in sync with `firestore.rules`. Edit the rules test file without running Prettier over it (D-109, learned).
- Bingo code never imports into the pool's first screen. Check the build's chunk list in each PR.
- Merging deploys. Bingo stays dark (`enabled` false, not found) until G2.

## 8. Risks

| Risk | Mitigation |
|---|---|
| The legal answer changes the product after it is built | G0 before any code (R-1) |
| A typo in an approved draw credits the wrong cards | Hits are derived and recomputed; correction is allowed until payout (R-11) |
| A payment confirmed late punishes someone who paid on time | Credit by `receivedAt` (R-13) |
| Heavy spenders, chasing | Cap, self-set limits staff can't raise, spend in dollars, no prepay, totals-only staff view, no "almost there" pushes (R-2, R-19, R-20) |
| Invite code guessed | Long code, hash in an admin-only doc, attempt counter in Firestore, rotation (R-14) |
| Pool players download bingo code | Separate lazy chunk, checked per PR |
| Splits don't add up | Integer cents, a written remainder rule, a test that totals always match (R-15) |
| The fetch source changes or is late | Manual entry first; the fetch only proposes |
