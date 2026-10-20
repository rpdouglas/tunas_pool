# Weekly 649 Bingo – Build Spec

Oct 20, 2026 · @Ryan

## Decisions so far

Weekly 649 Bingo is built inside the existing `tunas_pool` app (React 19, Vite, Firebase, database `db-tunaspool`) as an unlisted feature, reusing its players, logins, payments, roles and audit log.

| Decision | Choice |
| --- | --- |
| Access | Hidden route plus an invite code, checked by the database rules, not just the URL |
| Cards per person | Up to 5 per cycle |
| Duplicate cards | Allowed; identical cards win and split together |
| Draw numbers | Fetched automatically, then approved by the admin or Devon before anything is credited |
| Weekly renewal | Each card is paid for each draw; a missed week gets no credit, earlier crossed-off numbers stay |
| Price and operator % | Set in config, not hard-coded (options modelled: $10 or $20, 30 to 40%) |
| Scoring | Six main numbers only; bonus number ignored |

## How a week runs

A week runs Thursday to Wednesday, and the draw number only counts once a person has approved it.

1. **Join:** a player enters the invite code once. This sets a `bingoMember` flag on their `playerId`.
2. **Pick:** up to 5 cards per cycle, each six numbers from 1 to 49, picked by hand or quick-pick. Identical cards are allowed.
3. **Renew:** each card needs a payment for each draw, cash or e-Transfer, confirmed by the admin or Devon exactly as the pool does today.
4. **Cutoff:** Wednesday 6:00 PM Toronto time. The server enforces it. Money received after that only counts for the next draw, and staff must type a reason to confirm it.
5. **Draw fetched:** a scheduled function reads the official Wednesday Lotto 649 numbers after the draw. It saves them as a *proposed* draw and notifies staff. If the source is late, it retries Thursday morning and midday.
6. **Approve:** the admin or Devon checks the six numbers against the official result and taps Approve. The admin can also correct a number before approving, with a reason. Devon can approve but not edit.
7. **Apply:** on approval, a function crosses the numbers off every card that was paid for that draw. Unpaid cards keep their earlier hits but gain nothing.
8. **Win check:** a card with all six crossed off wins. If several finish on the same draw, they split the pot equally. The function records winners, the pot, the operator share, and an audit entry.
9. **Payout and reset:** staff mark each winner paid. The next cycle opens and every card is cleared.

A draw that is cancelled or postponed is marked skipped, and no card changes that week.

## Data model

All new collections live in `db-tunaspool`. Money is stored as integer cents. Hits, winners and totals are written by functions only.

| Path | Holds | Written by |
| --- | --- | --- |
| `bingo/config` | `enabled`, `priceCents`, `operatorPct`, `cutoff` (Wed 18:00 America/Toronto), `maxCardsPerPlayer` (5), `maxWeeks` (26), invite code hash | Admin |
| `bingoCycles/{cycleId}` | status (`open`, `won`, `capped`), start date, snapshot of price and operator % at start, running pot, winners, payouts | Functions |
| `bingoCycles/{cycleId}/cards/{cardId}` | `playerId`, `numbers` (six, sorted), `hits`, `lastCreditedDraw`, `createdAt` | Client creates via a function; functions update hits |
| `bingoCycles/{cycleId}/draws/{drawDate}` | six numbers, source, status (`proposed`, `approved`, `skipped`), approver, any correction and reason | Fetch function, then admin or counter approval |
| `bingoCycles/{cycleId}/draws/{drawDate}/payments/{cardId}` | `paid`, method (`cash`, `etransfer`), `confirmedBy`, `confirmedAt`, `late` | Staff through a callable |
| `players/{playerId}.bingoMember` | Boolean set by redeeming the invite code | Function |

A card created mid-week counts from the next draw. The card cap is enforced by the function that creates a card, counting that player's cards in the cycle inside a transaction, because rules cannot count documents. Price and operator % are copied into the cycle when it opens, so a config change never alters a running cycle.

## Functions and security rules

Every action that changes money, cards or results goes through a callable function that also writes the audit log.

| Function | What it does | Who can call it |
| --- | --- | --- |
| `bingoRedeemCode` | Checks the invite code (rate limited) and sets `bingoMember` | Signed-in player |
| `bingoCreateCard` | Validates six distinct numbers from 1 to 49, enforces the 5-card cap, creates the card for the next draw | Member |
| `bingoSetPayment` | Marks a card paid for a draw; after the cutoff it needs a reason and credits only the next draw | Admin, counter |
| `bingoFetchDraw` | Scheduled; reads the official numbers, saves a proposed draw, notifies staff, retries if late | Scheduler |
| `bingoApproveDraw` | Approves a proposed draw, then runs `applyDraw` | Admin, counter |
| `bingoCorrectDraw` | Changes a number before approval, with a reason | Admin only |
| `applyDraw` | Crosses off paid cards, finds winners, splits the pot, closes and reopens the cycle | Internal only |
| `bingoSetPayout` | Marks a winner paid | Admin, counter |

**Rules in plain words**

- Only `bingoMember` players and staff can read bingo data.
- Clients can never write cards' hits, draws, winners, payments or cycles.
- Staff see payment details; players see only their own card's paid status.
- Cents from an uneven split go to the pot's last winner, so payouts always add up exactly.

Each function gets integration tests against the emulator, and the scoring engine in `shared/bingo.ts` is tested against the same cycle simulation used to estimate cycle lengths.

## Hidden route and screens

The feature is a separate lazy-loaded chunk, so pool players never download it. It is not linked from Home, the Menu or any sitemap, and the page carries `noindex`. A hidden address is not security, so the invite code and `bingoMember` rules do the real gating. Everything stays off until `bingo/config.enabled` is true.

| Route | Screen | Who |
| --- | --- | --- |
| `/b` | Enter invite code (one time) | Anyone with the link |
| `/b/cards` | My cards: a 1 to 49 grid with crossed-off numbers, paid status, renew button, add card (max 5) | Member |
| `/b/board` | All cards ranked by how close they are to six, and the current pot | Member |
| `/b/history` | Past cycles: winners, pot, week of the win | Member |
| `/admin/bingo/draw` | Proposed draw with Approve, and Correct (admin only) | Admin, counter |
| `/admin/bingo/payments` | Weekly paid or unpaid for every card, then winner payouts | Admin, counter |
| `/admin/bingo/settings` | Price, operator %, cutoff, card cap, invite code, on/off | Admin |

Paper players are handled the way the pool handles them: staff enter cards on a player's behalf from the Back Office. Every screen follows the pool's design system, 375px mobile first, 48px targets, and text that is never colour-only.

## Joining mid-cycle, multiple cards and play limits

The first model assumed every card was in from week one and paid every week. A rerun with rolling joins, 1 to 5 cards per person and missed weeks (300 simulated years per case, $10 card, 40% operator) changes three things the build has to handle.

**1. Cycles are short.** With 50 people the paid cards per week run about 65 (casual), 98 (mixed) or 143 (keen). Cycles then last about 3.3 to 3.9 weeks on average, so 13 to 15 cycles a year, not the 7 to 9 in the earlier graphics. More than half of cycles end in a tie.

**2. A card bought mid-cycle is a bad deal.** It starts with nothing crossed off while the others are already part way. Across all completed cycles, cards in from week one got back about 63 to 67 cents per dollar. Cards that joined later got back about 6 to 16 cents. Allowing open joining would quietly take money from the newest players.

**3. Spend concentrates in the 4 to 5 card players.** Each card has the same return per dollar (about 60 cents), so nobody gets an edge from more cards, but they lose proportionally more.

| Scenario (50 people) | Avg cards per person | Paid cards per week | Revenue per year | Operator per year | Avg pot | Tie rate | Spend from 4-5 card players |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Casual | 1.6 | 65 | $33,700 | $13,500 | $1,530 | 46% | 19% |
| Mixed | 2.4 | 98 | $50,800 | $20,300 | $2,080 | 54% | 40% |
| Keen | 3.3 | 143 | $74,500 | $29,800 | $2,830 | 60% | 61% |

At 100 people the same scenarios roughly double the money and shorten cycles to about 3.1 to 3.5 weeks. At $20 a card, revenue and pot scale linearly. The casual, mixed and keen split is an assumption to be replaced with real numbers from the first test season, not a trait of any group of players.

### Build rules that follow

| Rule | What the build does |
| --- | --- |
| Join window | A new card is only sold for the next cycle's first draw. Buy-in opens after the winning draw is approved and closes at the Wednesday 6 PM cutoff of week one. Anyone arriving later is queued and told so. Closing joins cost about 2% of revenue in the model and removes the late-card disadvantage. |
| Cards carry over | After a win, every existing card keeps its numbers, progress resets to zero, and the player renews for week one like anyone else. |
| Missed weeks | A card that misses a week earns nothing for that draw but stays in the cycle. The board shows paid weeks per card. |
| Per-person cap | Max 5 cards per person per cycle, enforced in the creating transaction. Configurable lower. |
| Spend visibility | Each player sees what they have put in this cycle and this season, in plain dollars, on the card screen. |
| Self-set limits | A player can set a weekly card limit and pause for one or more cycles. Lowering applies immediately; raising takes a full cycle to apply. Staff cannot raise it for them. |
| Staff view | Admin sees concentration (share of spend from 4-5 card players, number of people at the cap each week) so unhealthy patterns are noticed early. |
| Clear odds | The rules screen states plainly that the average return is about the share left after the operator percentage, and that ties are common. |

Open decisions for this section: whether the join window is the first draw only or the first two (the model shows even week-two cards get back well under half), and whether self-set limits also apply to paper entries made by staff.

## Build plan

Following the repo's workflow: persona check first, rules tests before rules, docs updated in the same commit as code, and `typecheck`, `test` and `test:rules` before anything is called done. Sprint 10 is the active cycle, so this becomes a new Phase 6.

| Sprint | Goal | Done when |
| --- | --- | --- |
| 11 – Spec | `DATA_MODEL`, `FIRESTORE_RULES`, `DECISIONS`, `PROJECT_PLAN` Phase 6 and `ACTIVE_CYCLE` updated; persona and Responsible-Play checks run | Docs merged, no code |
| 12 – Engine | `shared/bingo.ts` (marks, winners, tie split, cap), `bingoCreateCard`, `applyDraw`, rules and rules tests | A simulated cycle matches the Monte Carlo model |
| 13 – Player side | Invite code, my cards, renew, board, history | A first-timer joins and adds a card at 375px without help |
| 14 – Staff side | Draw fetch, approval and correction, payments, payouts, settings | A full test cycle runs from cards to payout in the emulator |
| 15 – Hardening | Audit text, smoke run, accessibility, a dry run in a test season | No real money; the dry run ends with a correct payout |

The draw fetch is built last in Sprint 14 behind manual entry. Staff can type the numbers at first, and the automatic fetch is added once a reliable source is confirmed.

## Open items

- [ ] **Draw source:** confirm a reliable official source for the Wednesday Lotto 649 numbers. Until then staff type them in.
- [ ] **Payment timing:** confirm the rule that money must be in hand by Wednesday 6 PM, with after-cutoff confirmations credited to the next draw only.
- [ ] **No-winner cap:** after 26 weeks, do the cards with the most numbers crossed off split the pot, as the rules sheet says?
- [ ] **Price and operator %:** pick the launch values; the app reads them from config.
- [ ] **Age:** match the pool's existing 18+ attestation, since Lotto 649 is 18+ in Ontario.
- [ ] **Border test:** can New York players join at par, given the draw is Canadian and payment is cash or e-Transfer?
- [ ] **Who sees whose cards:** the board shows display names and numbers to members; confirm that is acceptable.
- [ ] **Licensing:** the feature stays switched off until the legal basis for running it is settled.
- [ ] **Repo access:** committing these docs to `tunas_pool` needs push access, or they can be copied in from the Codespace.
