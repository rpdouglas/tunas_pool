# Weekly 649 Bingo: build spec review

2026-10-20 · reviewed against `main` at c6daa96 (after D-109) · source: `docs/bingo/BUILD_SPEC.md`

A dated snapshot, read-only history like every file in `docs/reports/`. What survives review moves into `DATA_MODEL.md`, `FIRESTORE_RULES.md`, `DECISIONS.md`, and `BINGO_PLAN.md` in Sprint 11; this file is not a source of truth.

**Summary.** The spec is strong on the money flow (server-enforced cutoff, a person approves every draw, cents, config snapshotted per cycle, functions write everything that matters) and on the player economics (the join window and the late-card finding are the right call). It needs work in three places before code: two **gates** that sit outside the code (the legal basis, and a written exception to the project's own responsible-play rules), several **conflicts with how the app already works** (where the member flag lives, who Devon is, how names are read), and a **data model** that doesn't yet hold the rules the spec states (cards that outlive a cycle, payments for a draw that hasn't happened). None of these is hard to fix; all are cheaper to fix on paper.

Findings are numbered so the plan and decisions can cite them (R-1 …).

---

## 1. Gates (decide before any bingo code)

**R-1. The legal basis comes first, not last.** The spec keeps the feature switched off until licensing is settled, which protects players but not the build. This one is materially different from the football pool: the pool pays out every dollar it takes (D-009), while bingo keeps 30 to 40% as an operator share and runs on a government lottery's numbers. In Canada, conducting a lottery scheme is a Criminal Code offence unless it is run by a province or under a provincial licence (s. 206, s. 207), and licences go to charitable or religious organisations for those purposes, not to an operator keeping a share. New York has its own rules on promoting gambling. This is not legal advice and it may be that there is a structure that works (0% operator, a licensed charity, a social game among members), but each of those changes the build (no operator %, different screens, different records). **Recommendation:** get the lawyer's answer before Sprint 12, and treat a "no, or only as X" answer as a re-plan, not a launch delay. The pool's own open decision (PROJECT_PLAN §7 item 1) can go to the same lawyer.

**R-2. The project's own rules say no to parts of this, so they need a written exception.** CLAUDE.md §10 puts "multiple entries per person per week" out of scope; PERSONAS Anti-persona D (The Chaser) names "multiple entries, side pots" as features that reward chasing; and the Responsible-Play Check (PERSONAS §0 step 9) says "Does this encourage spending beyond the fixed entry fee… If yes, redesign." Up to five cards, renewed every week, with a growing pot, fails that check as written. CLAUDE.md says to stop and flag when docs disagree rather than pick one. **Recommendation:** in Sprint 11, write a bingo responsible-play standard into PERSONAS (an addendum, with its own check) that states what bingo allows and what it never does, and amend CLAUDE.md §10 to point at it. The spec already has most of the content (cap, self-set limits that only staff can't raise, spend shown in dollars, plain odds); what's missing is making it the rule every bingo sprint is checked against.

**R-3. Real money in a shared Firebase project.** Bingo moves a lot more money than the pool (the spec's casual case is $33,700 a year at 50 people) and would live in `lilypad-strategy-design`, shared with other apps (D-015). The move to the pool's own project (D-100, `docs/MIGRATION.md`) is "not urgent" for the pool. **Recommendation:** make the migration a precondition of switching bingo on (Gate G2 in the plan), not of building it.

## 2. Conflicts with the app as built

**R-4. `players/{playerId}.bingoMember` is the wrong place.** Player documents are readable only by their owner and the admin (rules, players section; CLAUDE.md §8 keeps phones and emails that way). Rules can still `get()` it, but the counter role reads only what a player reads (D-095), and members can't read each other's names from it for the board. The board, history, and staff screens all need display names. **Fix:** a `bingoMembers/{playerId}` collection (`displayName`, `joinedAt`, `ageAttestedAt` copied, limits), function-written, readable by members and staff. Rules check membership with `exists(bingoMembers/...)`.

**R-5. Rules can't map a login to a player.** Every "only members" and "only their own card" rule needs the caller's `playerId`. The board solved this with the function-written `logins/{uid}` pointer, always re-checked with `ownsPlayer()` (D-102, FIRESTORE_RULES row 59). The spec doesn't mention it. **Fix:** reuse it: `bingoRedeemCode` calls the same `joinBoard` logic, and bingo rules read through `loginPath()`.

**R-6. Devon's role widens; say so.** The spec has "the admin or Devon" confirming **cash or e-Transfer** and approving draws. D-095 says the counter confirms **cash only** ("never confirm or undo an e-Transfer, which only the commissioner can check against the bank") and **never results**. Either is a fine choice, but bingo can't silently differ from the pool. **Fix:** a decision (D-11x) listing exactly what the counter can do in bingo, mirrored in the functions and their tests.

**R-7. Guests and accounts.** The pool lets guests play; the board requires a saved account (D-102). Bingo involves recurring money and a card that lasts months, so a guest login that vanishes with the browser (PROJECT_PLAN §6 risk) is worse here. **Recommendation:** redeeming the code requires a saved account (Google or email) and the 18+ attestation the pool already records (D-037), or a staff-entered paper member.

**R-8. "Renew" can't take money.** Online payment is out of scope (CLAUDE.md §10). The card screen's renew button can only be an intent ("I'll pay cash" / "I sent an e-Transfer"), as the pool's `paymentIntent` is. Also unaddressed: **paying ahead** for several draws. Prepayment creates a running balance, which the Chaser rules forbid ("no credit, no IOUs, no running balances"). **Recommendation:** pay per draw only, no prepay, in v1; state it.

## 3. Data model

**R-9. Cards outlive a cycle, but they're stored under one.** "Cards carry over: every existing card keeps its numbers, progress resets to zero" (build rules) and "every card is cleared" (step 9) disagree, and `bingoCycles/{cycleId}/cards/{cardId}` can't carry over without copying. **Fix:** split the card from its progress: `bingoCards/{cardId}` (owner, numbers, created, active) lives across cycles; `bingoCycles/{cycleId}/entries/{cardId}` holds that card's part in one cycle (joined draw, paid draws, hits). "Carry over" then means "is eligible to renew for week one". This also makes the 5-card cap a count of a player's active `bingoCards`, which is what the spec intends (5 per person, not 5 new ones per cycle).

**R-10. Payments hang off a draw that doesn't exist yet.** Payments are `draws/{drawDate}/payments/{cardId}`, but the draw document is created by the fetch after the draw. Staff record money all week before it. **Fix:** a draw week document is created when the week opens (status `upcoming`, then `proposed`, `approved`, or `skipped`), and payments live under it from day one. Add `upcoming` to the status list.

**R-11. Hits should be derived, not added to.** As specced, `applyDraw` increments `hits` on each card. Then a correction after approval (a typo approved by mistake, which the spec has no path for) means un-applying. The pool already learned this: standings are "worked out again from the entries every time, never added to" (DATA_MODEL §3.8). **Fix:** a card's crossed-off numbers are a pure function of the cycle's approved draws and that card's paid draws (`shared/bingo.ts`); `applyDraw` recomputes and writes them, so it's idempotent, and a post-approval correction (admin, with a reason, before payout is marked) just reruns it.

**R-12. Two rules for when a new card starts.** "A card created mid-week counts from the next draw" (data model) and "a new card is only sold for the next cycle's first draw" (join window) describe different products. **Fix:** the join window wins; outside it, `bingoCreateCard` refuses with "Cards for the next game open after this one is won" and the player can be told (queued, not charged).

**R-13. Late money: received vs confirmed.** "Money received after the cutoff only counts for the next draw" ties credit to when staff confirm it. Cash handed over at 5:50 PM and confirmed at 7 PM, or an e-Transfer that arrived at 5 PM and was checked Thursday, would be credited late. **Fix:** staff enter when it was **received** (default now, can be set earlier with a reason before the draw is approved); the function credits the draw whose cutoff that time is before. Record both times.

**R-14. The invite code hash shouldn't sit in a readable config.** Members need `bingo/config` (price, cutoff, odds text). A short code's hash there can be brute-forced offline. Also, `createRateLimit` in `functions/src/clientErrors.ts` is per-instance memory, not a real limit. **Fix:** keep the hash in an admin-only `bingo/secret`; count redeem attempts per login in Firestore (as D-109 stamps posts) and lock after a few; make codes long enough (8+ characters) that guessing is pointless; let the admin rotate the code.

**R-15. Splits need a written order.** "Cents from an uneven split go to the pot's last winner": define "last" (the plan proposes: winners ordered by card ID, remainder cents one each from the first, so no one gets more than a cent extra and it's deterministic). Two identical cards owned by the same person count as two winners. Pot and operator share should be computed per draw from paid cards and rounded once per draw, so the totals are exact.

**R-16. Test cycles.** "A dry run in a test season": cycles aren't seasons. **Fix:** a `test: true` flag on a cycle (or the pool's `-test` ID convention), excluded from reports and the concentration view.

## 4. Product and fairness

**R-17. Only Wednesday draws?** Lotto 6/49 draws Wednesday and Saturday. The spec uses Wednesday only (a Thursday-to-Wednesday week). Confirm that's intended; it doubles cycle length versus using both.

**R-18. The 26-week cap needs a full rule.** "Cards with the most numbers crossed off split the pot" (open item) also needs: what if those cards are tied with different paid-week counts, does an unpaid card on the cap draw qualify, and does the operator share still apply. Write it as a worked example in DATA_MODEL, the way the tiebreaker is (§7).

**R-19. The board ranks people by closeness to winning.** A leaderboard of "who's 1 away" is the most chase-inducing screen in the feature (R-2), and it shows every member's numbers and name (open item). **Recommendation:** show the pot and how many cards are at 5, 4, 3 (counts), and your own cards' standing; names on the board only if Ryan decides it after the responsible-play standard is written.

**R-20. The concentration view must stay aggregate.** "Admin sees concentration (share of spend from 4-5 card players, number of people at the cap)" is good as totals. A named list of heavy spenders would cross the Chaser rule "we do not detect or profile individual players." State it: totals only.

**R-21. Odds in plain words need real numbers.** "The average return is about the share left after the operator percentage" is right on average but the model shows cards that join late get 6 to 16 cents per dollar. With the join window, say the average and that ties are common, computed from the cycle's own config.

**R-22. Notifications.** "Notifies staff" when a draw is fetched: push and email aren't built (CLAUDE.md §10; D-079 email needs a mail service). **Fix:** a Back Office banner ("A draw is waiting for approval") is the v1 notification.

## 5. Delivery

**R-23. Commit the simulation.** Sprint 12's acceptance is "a simulated cycle matches the Monte Carlo model", but the model isn't in the repo. Commit it as a seeded script (`scripts/bingo-sim.ts`) built on `shared/bingo.ts`, so the engine and the economics are checked by the same code.

**R-24. Sprint sizes.** Spec Sprint 12 bundles the engine, two functions, and all the rules; Sprint 14 bundles every staff screen and the fetch. With this repo's definition of done (rules tests first, integration tests per callable, styleguide entries, smoke visits, docs in the same commit), the plan splits these so each sprint ends green and mergeable.

**R-25. The hidden route.** Lazy chunk, `noindex`, not linked: fine, and the spec rightly says the rules are the real gate. Add: the route renders "not found" (not "enter a code") while `bingo/config.enabled` is false, so the feature isn't discoverable before launch.

## 6. What's already right (keep)

Server-enforced cutoff; a person approves every draw before anything is credited; manual entry before automatic fetch; config snapshotted into the cycle; integer cents; functions write every money and result field; audit on every action; the join window, the cap, self-set limits that staff can't raise, spend shown in dollars; ties split equally; mobile-first at 375px with the existing design system; the lazy chunk.
