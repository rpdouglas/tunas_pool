# Tunas 649 Bingo: state of the build and gap analysis

A dated snapshot, read-only history like every file in `docs/reports/`; reviewed against `main` at 90be701. Findings here are not decisions: what is accepted moves into `DECISIONS.md` and the governing docs. This file is not a source of truth.
2026-10-20. Read: `BINGO_PLAN`, `BUILD_SPEC`, the spec review, `DATA_MODEL` §11, `PERSONAS` §8, D-110 to D-135, `shared/bingo*.ts`, all of `functions/src/bingo/`, the rules, and the player and staff screens.
**Run:** `typecheck` is clean, and 279 unit tests pass across `shared` and the bingo UI. I did **not** run `test:rules`, the function integration tests, or `test:smoke`. The emulator suites are the ones that matter most for this feature.

## 1. How the game works

It is **cover-all (blackout) bingo played on Wednesday Lotto 6/49 numbers**.

- A **card** is six numbers from 1 to 49. A member can hold up to 5, and duplicates are allowed.
- Each Wednesday a card is **paid for that draw**: cash at the shop, or e-Transfer, by 6 PM. Staff record the money, and a card cannot be paid ahead of time.
- Staff type the six main numbers in. The admin or the counter approves them. Only then are the numbers crossed off every card that was paid for that draw. Hits are always recomputed from scratch, never added to.
- The first card to cross off all six wins the pot. Cards that finish on the same night split it. Cents are shared one each in card-ID order.
- **Pot** = revenue minus the operator share, which is rounded down per draw. After 26 weeks with no winner, the best cards paid for draw 26 split it. If nobody was paid for draw 26, the pot carries to the next game.
- When a game ends, all cards carry over with zero crossed off. New cards can only be bought before the first draw of a game, so no one joins at a disadvantage.
- Safeguards: members cannot prepay, there are no tabs, and nothing says a card is "close". The board shows counts only. Spend is shown in dollars. Limits and pauses lower at once, and raising a limit waits a full game. Staff cannot raise a limit for a player.

**The economics, from the repo's own simulation (D-130).** Games last about **6 weeks**, with roughly 8 to 10 games a year. A card costs about $60 a game and returns about the non-operator share (60¢ per $1 at 40%). About 1 game in 3 ends in a tie.

## 2. Implementation review

**Strengths (keep these)**

- **Pure, deterministic engine.** `evaluateCycle` is a pure function. It is idempotent and recomputed on every approval or correction, which makes corrections safe. The simulation is checked against a closed-form result, not just against itself.
- **Integrity of the money flow.**
  - Everything goes through a callable, runs in a transaction, and writes an audit entry.
  - The cutoff is enforced on the server.
  - Money is credited by `receivedAt`, not by when staff confirmed it.
  - The skipped-draw and game-end money moves are handled.
  - The code hash sits in an admin-only document, with attempt locking.
  - Rules are read-only for clients.
- **Responsible-play design is better than the industry baseline.** Raising a limit waits about 6 weeks. The Ontario iGaming standard asks for 24 hours. Staff cannot loosen a player's limit. There is no named spend view.
- **Process discipline.** Gates, ADRs, the review (R-1 to R-25), and a documented departure from the spec's own numbers.

**Findings, most important first**

| # | Severity | Finding |
|---|---|---|
| F-1 | **High** | **Hindsight window on payments.** `setPayment` and `creditPayment` only refuse a draw that is *approved* or *skipped*. After the numbers are typed in, the draw is `proposed`, and the Wednesday result is public by then. Staff can still record money with `receivedAt` set before 6 PM, with a reason, and the card gets credited for that draw. Insider cards could be "paid late but credited on time" after the winners are known. The audit log would show it, but nothing prevents it. See `payments.ts` L147-L169 and `bingo.ts` L113-L132. |
| F-2 | **High** | **No separation of duties.** Staff can hold and pay for their own cards (PR #57, DATA_MODEL §11.5). The same staff member can record their own payment, type the draw, approve it, and mark their own win paid. No rule stops this. For real money with an operator share, that is the central trust risk. |
| F-3 | Medium | **The "no late disadvantage" promise leaks.** The join window stops late *card purchases*. But a card left unpaid in week 1 and paid in week 2 is the same "late card" the window was meant to prevent. That choice is the player's own, but the rules and card screens never say that missing a week costs odds. The rules page says only that a missed week "crosses nothing off". |
| F-4 | Medium | **Odds text is hardcoded.** `oddsLines` says "with about 50 players, about 6 weeks, 1 in 3 tied" regardless of the real paid-card count. The odds are one of the main responsible-play promises, so the numbers should come from the live game. |
| F-5 | Low | **Latent config mismatch.** `bingoSetConfig` accepts `joinWindowDraws` of 2, but `createCard` only compares against the *first* draw's cutoff. The settings screen hardcodes 1, so this is unreachable today. Either remove the option or implement it. |
| F-6 | Low | **The board's "N cards in this game" includes unpaid cards.** A member can read that as the number of competing cards, which overstates it. |
| F-7 | Low | **Docs drift.** `BINGO_PLAN.md` line 5 still ends "Nothing is built yet." `DATA_MODEL` §11's intro says the fetch and dry run "come in Sprint 16", and §11.5 is still titled "planned". CLAUDE.md §3 makes code and docs agreeing a rule. |
| F-8 | Low | **Production transaction size is unproven.** D-134 already notes a ~600-write approval transaction passes in the emulator only. Run it once against real Firestore in the dry run. |
| F-9 | Low | **Quick-pick uses `Math.random`.** That is fine for fun. If a winner's card is ever disputed, a server-side `crypto.randomInt` is easier to defend. |

## 3. What similar games do

| Game | What it does | What it suggests for Tunas 649 Bingo |
|---|---|---|
| **Cover-all / blackout bingo** (halls) | Is the closest match. Progressive jackpots carry a "within N calls" rule and a consolation prize if nobody makes it, and the jackpot rolls over. | Your 26-week cap and carry-over already follow this. Halls also offer interim prizes. See option 1 below, which conflicts with your Bingo Check. |
| **Office lotto pools and syndicates** | Hold a signed roster, keep shared evidence of the numbers played, and use a named custodian. | Add a public per-game proof: draw numbers, card counts, the pot breakdown, and winners' cards. This serves Gerald. |
| **Keno and lottery-style games** | Have a fixed published payout table and hit-rate odds. | Your odds panel already does this in words. Make it live (F-4). |
| **Pick'em, Survivor, and Squares pools** (your own football pool) | Run weekly with a short, certain payoff. | Bingo's 6-week, mostly-zero experience is the thing most likely to cost you players. |
| **Regulated online operators** (Ontario iGaming) | Require visible limits, a 24-hour cooling-off before loosening a limit, and system-enforced limits. | You already meet or beat this. Not offered: a self-exclusion longer than a pause (the maximum is 52 games, about a year) and a "cooling-off" for new members. |
| **Draw data** | OLG has no public API. Third-party aggregators or scraping are the usual route. | D-134 parked this. See option 5. |

> [!IMPORTANT]
> One legal point for Ryan, not advice. G0 rests on JR Law's opinion, which lives with Ryan, not in the repo. General Canadian guidance says a private lottery with an *operator share* is the hard part: Criminal Code s.207 allows provincial or licensed-charity schemes. Make sure the written opinion names the operator share and the New York players. Also check that using "6/49" in the name and on screens does not touch OLG's trademark. Keep the opinion summary in `DECISIONS.md` or a private note.

## 4. Gap analysis and recommendations

**Must-do before real money (G2)**

1. **Close F-1.** Refuse payments for a draw once its numbers are `proposed`, or once it is past the draw time. Allow an admin-only override with a reason.
2. **Close F-2.**
   - Block a staff member from recording payment for their own card.
   - Block them from approving a draw, or marking a payout, when they hold a card.
   - Add a "second person approves" rule when a staff card is among the winners.
   - Alternatively, require the admin to approve any draw while staff cards are in play.
3. **Say it plainly (F-3).** Add one line on the card and rules screens: "Skipping a week means this card is behind the others."
4. **Live odds (F-4).** Compute the typical game length and tie rate from the current paid-card count, and fall back to the simulation when there is little data.
5. **Run the dry run** (README, "Tunas 649 Bingo"), including one real-Firestore approval of a large game (F-8).

**Valuable next**

6. **Trust and reporting.**
   - A per-game proof page: draw numbers, each approved draw, pot and operator split, and winners' card numbers (Gerald).
   - A staff ledger and CSV per game covering revenue, operator share, cash versus e-Transfer, payouts, and unpaid winners. I found no export or end-of-night reconciliation screen for the counter.
7. **Draw source.** Add a read-only cross-check, not an auto-approve. Fetch from a second source and warn on a mismatch. Keep human approval.
8. **Paper players (Rosalie).** A printable weekly sheet of each paper member's cards and paid status.
9. **Self-exclusion.** Add a longer option than a pause, with a plain way to ask staff to remove a member. The Responsible-Play standard should say who can reverse it, and the answer should be nobody but the member.

**Design options for Ryan (each has a trade-off)**

| Option | Upside | Cost |
|---|---|---|
| **Interim prize**, for example a small slice of the pot to the first card to reach 5 | Keeps casual players engaged during a long game | Conflicts with the Bingo Check: it creates an "almost there" state. I'd decide this deliberately and write it into PERSONAS §8 first. |
| **Add the Saturday draw** | Shorter games, so more wins and more turnover | Doubles weekly cost per card, so it raises spend. It also reverses D-122 and the Bingo Check should be re-run. |
| **Fixed weekly-play cap** in dollars | A harder guard than "5 cards" | One more number to explain. The card limit already does most of this. |
| **Lower price or fewer weeks** | A game is cheaper to try | Smaller pots. |

## 5. Overall

The engine and the money controls are strong, and the design is more careful about player harm than most comparable games. The build is ready for a dry run. Before real money, the two things that should block launch are **F-1 and F-2**. Both are about trust at the counter, not about the game's maths. The rest is polish.

I changed no code or docs. I can fix F-1, F-2 and the F-7 docs drift next, with tests and DECISIONS entries.
