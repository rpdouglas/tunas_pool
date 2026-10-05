# 👥 Persona-Based Development Model — Tunas Weekly Football Pool Pick 'Em

**Version:** 1.0 · **Last Updated:** October 2026 · **Next Review:** After the Phase 1 soft launch (Sprint 3)

**Change Log:**
- v1.0 — Initial set of ten personas (Dale, Rosalie, Bernie, Jen, Troy, Dwayne, Kayla, Gerald, The Commissioner, Devon), five anti-personas, season arc, overlap register, pool constraints register, spec-impact log, and assumptions to validate

---

## §0 How to Use This Document in Development

Every feature in the Tunas pool is built against these personas. The pool is a community pool: mostly Akwesasne locals who enjoy a weekly wager, a smaller group from Cornwall who come through The Pawn Shop or are friends of Tuna, and a small contingent on the New York side who play at par with everyone else.

> **Personas are working models, not demographics.** Names are placeholders. Details are informed assumptions about how the pool runs today (paper sheets handed in at the shop, picks texted to Tuna) and must be validated with the commissioner and real players (see §7). Never use a persona to stereotype a real person or the community. When a persona and a real player disagree, the real player is right and the persona gets updated.

**For every new feature or spec:**

1. **Identify the primary persona** this feature serves.
2. **Apply their UX Constraints** as acceptance criteria, not guidelines.
3. **Run the Rosalie Inclusion Test.** Can someone who never touches the app still enter, pay, see results, and receive winnings with equal fairness? If not, redesign.
4. **Run the Dale Deadline Test.** Does it work at 11:40 PM Saturday, one thumb, weak signal, 20 minutes to lock? If it adds a step, cut a step.
5. **Run the Gerald Trust Test.** Could a skeptical player verify this without taking anyone's word for it? Money is involved. Fairness has to be visible.
6. **Run the Commissioner Counter Test.** Can the commissioner do this one-handed, with a customer waiting, in about 10 seconds, and undo it?
7. **Run the Border Test.** Does this work identically for a player on the NY side with no Canadian bank account? ("At par" means equal, not nearly equal.)
8. **Run the Welcome Test.** Can a first-timer from Cornwall understand it with zero insider vocabulary, and does it avoid exposing them to the group before they're ready?
9. **Run the Responsible-Play Check.** Does this encourage spending beyond the fixed entry fee, create IOUs or tabs, or reward chasing losses? If yes, redesign.
10. **Check the privacy test.** Would a reasonable player feel watched, ranked, or exposed by this (phone numbers, who has or hasn't paid, who owes)? If yes, redesign.

**The primary persona rule:** Design decisions are optimised for the primary persona. Secondary personas are tested against the result. Never design for an average of all personas.

---

## §1 Persona Hierarchy

| Role | Persona | Why |
| :--- | :--- | :--- |
| **Primary Inclusion Anchor** | Rosalie | Sets the floor. If a person who never uses the app is treated unfairly, the site has failed, however slick it is for everyone else. |
| **Primary Engagement Driver** | Dale | The weekly regular. His entry rhythm, deadline behavior, and retention are the pool's heartbeat and most of its volume. |
| **Primary Trust Anchor** | Gerald | Money is on the line. If Gerald can verify the process, everyone else can trust it. |
| **Primary Operations Driver** | The Commissioner + Devon | The pool lives or dies on the admin's weekly workload. Payments, paper entry, results, and payout must be fast and recoverable. |
| **Primary Growth Driver** | Kayla + Dwayne | Kayla's shares and Dwayne's group of eight bring in new players. The group and share flows are the main organic growth loops. |
| **Primary Conversion Drivers** | Bernie, Jen, Troy | Bernie moves from texting to self-entry. Jen is the newcomer's first impression. Troy tests whether "at par" is real. |

---

## §2 Season Arc

Players move through the season and across seasons. The same person may be Jen in Week 1 and Dale by Week 8.

```
Pre-season    → Roster setup, paper players added, claims (Rosalie, Bernie)
Weeks 1-3     → First entries, first loss, first payment (Jen, Bernie, Troy)
Weeks 4-10    → Rhythm. Regulars lock in, group captains collect (Dale, Dwayne, Kayla)
Mid-season    → The Slump: a bad month, "I'm out of it," falling attendance (highest churn risk)
Holiday weeks → Odd schedules, early locks, double-header Sundays (all personas)
Late season   → Standings matter, disputes surface (Gerald)
Playoffs/SB   → Higher attention, possibly bigger stakes (decision for the commissioner)
Rollover      → New season, roster carries over, claims renewed (Commissioner, Rosalie)
```

**Stage transition design rules:**
- **Week 1 (first contact):** No red "unpaid" states. No exposure of other players' names, numbers, or payment status. Rules and tiebreaker explained in plain words before the first pick.
- **After the first loss (Weeks 2-3):** Lead with "this week is a fresh pot," not with the loss. Weekly pot, not season standing, is the hook.
- **The Slump (mid-season):** Never make a player feel mathematically eliminated. Every week is a new winner-take-all pot. Weekly framing beats season framing. No streak-based pressure.
- **Holiday and odd-schedule weeks:** Lock time and game list changes are announced at the top of the screen, not buried in the games.
- **Late season:** Surface the audit-friendly views (submission times, tiebreaker explanation, corrections note) before disputes need them.
- **Rollover:** The roster carries over untouched. Claims and approvals persist. Seniors never have to "re-register."

---

## §3 The Personas

---

### 1. "Dale" (The Regular)
> *"I'm in every week. Don't make me think about it. Just let me get my picks in before it locks."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Akwesasne local, core weekly player |
| **Entry Method** | Self-serve on his phone, usually Saturday night |
| **Payment** | e-Transfer most weeks, cash at the shop when he's passing through |
| **System Archetype** | **The Regular** (High Frequency) |
| **Core Motivation** | Win the weekly pot, beat his friends, keep the Sunday ritual going. |
| **Tech Literacy** | Moderate. Phone-first, no patience for forms. Mid-range Android, data plan not unlimited. |
| **Environment** | Saturday night between 9 PM and midnight, on the couch or out. One thumb, portrait, notifications competing. Signal can be uneven. |
| **Community Notes** | Plays other pools and sports bets too. Competitive and joking. Talks about the pool in group chats. Trust in the pool is already high, and he will defend it if it stays fair. |

#### 📖 Bio & Narrative
Dale is 41, works rotating shifts, and has played the paper pool since it started. He plays because it's fun and competitive, and a $640 pot is a good Sunday. He doesn't read instructions. He knows how the pool works because he's played it for years. His habit is to make his picks late, often within the last hour, after checking lines and arguing with friends. Twice he has texted Tuna at 11:58 PM asking to be added. He cares about two things: it's fast, and it's fair.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Thursday evening, relaxed, picks early. | Smooth entry, clear confirmation, "Edit until Saturday 11:59 PM." |
| **Typical case** | Saturday 10 PM, a few picks decided, rest by gut. | Draft autosaves, progress bar, one-tap payment choice remembered from last week. |
| **Worst case** | Saturday 11:40 PM, 20 minutes left, weak signal, partial picks, hasn't paid. | Countdown is unmissable. Submit works on a flaky connection and confirms it saved. If signal drops, the draft survives. Payment never blocks submission. |

> **Design rule:** All Dale-facing features are designed for the worst case: the last 20 minutes before lock.

#### 🎯 Goals & Needs
* **Speed:** Picks in under 90 seconds once he's decided.
* **Certainty:** A clear receipt: "You're in. 15 of 15 picks saved at 10:47 PM."
* **Memory:** Name, phone, and usual payment method prefilled.
* **Lock honesty:** A clear, consistent lock time. No surprises about whether he made it.
* **Reveal:** After lock, see what everyone picked and where he stands.

#### 🚧 Frustrations & Pain Points
* **Friction:** Accounts, passwords, email verification, or anything between him and the picks.
* **Ambiguity:** "Did it go through?" with no receipt.
* **Deadline cruelty:** An entry rejected at 11:59:30 with no explanation.
* **Tiebreaker confusion:** Losing a tie and not understanding the rule.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Deadline-Proof Speed.**
* *Rule:* Guest entry requires no account, no email, and no password. Account creation is offered after submit, never before.
* *Rule:* Picks save locally from the first tap. A dropped connection never loses a draft.
* *Rule:* Submit shows a plain confirmation with a timestamp and a "picks locked in" state. If the write failed, say so loudly and offer retry.
* *Rule:* Payment choice never blocks submission. Entry and payment are separate truths.
* *Rule:* The countdown shows the server's lock time in Eastern, with a visible warning under one hour.

#### 🛠️ Key Feature Alignment
* **Four-section entry form with sticky progress bar** (Sprint 2).
* **Local draft autosave.**
* **Confirmation screen with timestamp and lock countdown.**
* **Post-lock reveal grid and live leaderboard** (Sprint 6).

#### 🔄 Journey Arc — Stage Transition
Dale's risk is the mid-season slump after a bad month. Streak-style pressure would hurt, so instead:
- Frame each Saturday as a fresh pot.
- Show the "last week's winner" banner to keep the social hook strong.
- Never show a "you're out of the season" state for weekly play.

#### 🏆 Success Metrics
* **Time-to-submit:** Median seconds from first tap to confirmed submit.
* **Last-hour failure rate:** Submissions that fail or are rejected in the final hour (target: zero for valid attempts).
* **Consecutive-week retention:** % of players with 3+ weeks who play the next week.

#### 🖼️ Asset Metadata
> All paths reference entries in `src/data/assets.ts` ASSETS dictionary. Do not hardcode paths in components.
* `ASSETS.personas.dale.headshot`
* `ASSETS.personas.dale.full_body`
* Bio content rendered by `PersonaBioCard`, not a separate image asset.

---

### 2. "Rosalie" (The Paper Loyalist)
> *"I hand my sheet in, I pay, and I find out how I did. That's all I need."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Community elder, long-time player |
| **Entry Method** | Paper sheet handed in at the shop, or given to a family member to bring in |
| **Payment** | Cash, handed over with the sheet |
| **System Archetype** | **The Paper Loyalist** (Inclusion Anchor) |
| **Core Motivation** | Take part, see friends and neighbours, enjoy the Sunday games. |
| **Tech Literacy** | Low. Basic phone, calls and the odd text. Doesn't use accounts, email, or apps. |
| **Environment** | At home or at the shop in person. Reading glasses on. Prefers large print. Never enters a screen herself. |
| **Community Notes** | Knows most players personally. Trusts people, not screens. Names matter: spell hers right. She is a respected part of the pool, never a "problem user." |

#### 📖 Bio & Narrative
Rosalie is 72 and has played since she was handed her first sheet. She picks carefully at the kitchen table and hands the sheet in with cash. She isn't against technology. It just doesn't fit how she wants to play, and she shouldn't have to adapt. Her interface to the new site is the commissioner. She wants her name right, her picks right, and to hear whether she won. If a family member helps her, that's a kindness, not a requirement.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Hands in her sheet early in the week, chats, pays, done. | Entry is recorded faithfully in about a minute. She gets a quick "Got it, Rosalie." |
| **Typical case** | Hands it in Friday or Saturday with a few others. | Paper-order entry mode, source tag "paper," marked paid on the spot. |
| **Worst case** | She asks, "Did you get mine?" and nobody can tell her. | The admin roster shows "entered / not yet." Every paper entry can store a photo of the sheet. |

> **Design rule:** All Rosalie-facing flows are tested without a screen on her side. If she needs the app to be treated fairly, the design is wrong.

#### 🎯 Goals & Needs
* **Accurate transcription:** Her sheet entered exactly as written, in the same game order.
* **Recognition:** Her name displayed the way she wants it.
* **Results she can hear or read:** A printed leaderboard at the counter, or someone who can tell her.
* **Equal treatment:** Same rules, same lock, same fairness as everyone else.

#### 🚧 Frustrations & Pain Points
* **Forced digitization:** "Just do it on the website" is not an answer.
* **Errors in transcription:** Her pick recorded wrong with no way to check.
* **Exclusion:** Not knowing the lock moved, or not seeing standings.
* **Tiny type:** Anything she'd be expected to read on a phone.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Never Require a Screen.**
* *Rule:* The paper sheet is generated from the same week data as the site, so it always matches. It has a large-print option.
* *Rule:* Admin paper-entry mode mirrors the paper's game order, so transcription is a straight copy.
* *Rule:* Paper entries can attach a photo of the original sheet, so any dispute is settled by the sheet.
* *Rule:* A weekly printable leaderboard and winner announcement exists for the counter.
* *Rule:* Rosalie never has to create an account, give an email, or "re-register" at season rollover.

#### 🛠️ Key Feature Alignment
* **Roster profiles and "Entering for someone" mode** (Sprint 4).
* **Print-friendly weekly sheet and printable results** (Sprint 8).
* **Source tags and paper photo attachment.**
* **Claim-later with approval,** if a family member helps her join.

#### 🔄 Journey Arc — Stage Transition
Rosalie rarely transitions, and that's fine. If a grandchild offers to set her up, the claim flow links her existing history to a login, with the commissioner's approval. Her paper path continues to work alongside it.

#### 🏆 Success Metrics
* **Transcription accuracy:** Disputed paper entries per season (target: zero).
* **Entry coverage:** % of paper players with a recorded entry every week they played.
* **Zero-exclusion check:** Number of features shipped that require a screen on the player's side to be treated fairly (target: zero).

#### 🖼️ Asset Metadata
* `ASSETS.personas.rosalie.headshot`
* `ASSETS.personas.rosalie.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 3. "Bernie" (The Texter)
> *"I just text Tuna my picks. Why would I make an account?"*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Local regular, comfortable with texting, resistant to accounts |
| **Entry Method** | Texts his picks as a list. Today, the commissioner transcribes them. |
| **Payment** | e-Transfer or cash, depending on the week |
| **System Archetype** | **The Texter** (Conversion Candidate) |
| **Core Motivation** | Get his picks in with the least effort. |
| **Tech Literacy** | Moderate. Texts and Facebook daily. Avoids anything that smells like "sign up." |
| **Environment** | Anywhere. Types a quick text, sends, moves on. Sometimes mistypes team names. |
| **Community Notes** | The current "paperless" behavior is people like Bernie texting a pasted list. The site has to be easier than that, or he won't switch. |

#### 📖 Bio & Narrative
Bernie is 55. He's a phone user, not a computer user. He knows the pool well and has no complaint about the current process, other than occasionally wondering if his text was seen. He'd switch only if it were clearly easier than texting: a link that opens straight to the picks, no password, done in a minute. If it asks him to "create an account," he'll go back to texting.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Taps a link, picks, submits in a minute. | Guest entry, instant confirmation, "Save your picks next time?" is optional. |
| **Typical case** | Texts a list of teams. | Admin transcribes in quick-entry mode with source "text." |
| **Worst case** | Sends a list with a typo ("Bears or Bills?") and misses the deadline unconfirmed. | Admin sees ambiguity flagged. A reply from the commissioner is easy to send. A timestamped record exists of when the text arrived. |

> **Design rule:** The site must beat texting on speed and certainty, or Bernie stays on texting. Texting must remain a supported path.

#### 🎯 Goals & Needs
* **Zero setup:** Open and play.
* **Confirmation:** Know his picks were seen.
* **Familiarity:** Terms and team names match what he'd text.

#### 🚧 Frustrations & Pain Points
* **Account walls:** Any form before the picks.
* **Silence:** Sending a text and not knowing if it counted.
* **Rework:** Re-typing his name and number every week.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Easier Than Texting.**
* *Rule:* A shareable weekly link opens directly to the entry form. No login screen.
* *Rule:* Identity is name and phone, remembered on the device. Account upgrade is offered after submit.
* *Rule:* Admin quick-entry accepts pasted text lists and shows the interpretation for the admin to confirm. Ambiguous names are flagged.
* *Rule:* Every text-sourced entry records source "text" and the time it was received.

#### 🛠️ Key Feature Alignment
* **Guest-first entry, anonymous auth, optional upgrade** (Sprint 1-2).
* **Admin paste-and-confirm quick entry** (Sprint 4).
* **"Share this pool" link with pre-written message** (Sprint 8).

#### 🔄 Journey Arc — Stage Transition
After 2-3 successful self-serve entries, offer a gentle "Save your picks and track your season?" prompt. If he declines, never ask more than once every few weeks.

#### 🏆 Success Metrics
* **Text-to-site conversion:** % of texters who submit through the site within 4 weeks of launch.
* **Text-entry error rate:** Ambiguous or corrected text entries per week.
* **Upgrade acceptance rate:** % of guests who save an account after a prompt.

#### 🖼️ Asset Metadata
* `ASSETS.personas.bernie.headshot`
* `ASSETS.personas.bernie.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 4. "Jen" (The Guest)
> *"I'm not really a football person. A friend said I should join. I just don't want to do it wrong."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Cornwall resident, Pawn Shop customer or friend of Tuna |
| **Entry Method** | Self-serve, first time, from a shared link |
| **Payment** | e-Transfer (she's rarely carrying cash) |
| **System Archetype** | **The Guest** (Newcomer) |
| **Core Motivation** | Join in, have a bit of fun, not look foolish. |
| **Tech Literacy** | High for apps, low for football jargon. |
| **Environment** | Evening at home, phone, reading carefully. Wants to understand before committing $20. |
| **Community Notes** | She's joining a community pool, so she's the guest. The site should feel welcoming without presuming familiarity. She'll worry about her phone number being shared and about who sees whether she paid. |

#### 📖 Bio & Narrative
Jen is 34. She knows a few players and has seen the sheet at the shop. She's comfortable with apps but unsure what "pick 'em" or "MNF tiebreaker" mean, and nervous about getting the payment or the picks wrong in front of people she doesn't know well. She'll read the rules once, carefully, and won't ask. If anything feels confusing, she quietly doesn't join.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Clear rules, easy form, e-Transfer details right there. | A warm "Welcome," a short "How it works," and a simple first entry. |
| **Typical case** | Unsure about a couple of terms, wants reassurance on privacy. | Plain-language hints on tap, a one-line privacy note on the info step. |
| **Worst case** | Confused by the tiebreaker, afraid her entry is "wrong," doesn't want to ask. | Friendly inline help, a confirmation that shows exactly what was saved, and an easy way to fix it before lock. |

> **Design rule:** The Welcome Test. If a first-timer needs insider knowledge to finish the form, redesign it.

#### 🎯 Goals & Needs
* **Understanding:** What it is, what it costs, how winning works.
* **Privacy reassurance:** Who sees her name and phone.
* **Easy payment:** e-Transfer details she can copy.
* **Low stakes feel:** One fixed fee, no pressure.

#### 🚧 Frustrations & Pain Points
* **Insider jargon:** "Pick 'em," "MNF," "tiebreaker" with no explanation.
* **Exposure:** Her number or payment status visible to strangers.
* **Pressure:** Red "unpaid" labels or urgency language in her first week.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Plain Words, Safe Start.**
* *Rule:* A collapsible "How it works" is available on the entry form, written without football jargon. Tiebreaker explained with the sheet's own example.
* *Rule:* Phone numbers are never visible to other players. Payment status is never shown to other players.
* *Rule:* Display name defaults to first name and last initial. Players can choose a nickname.
* *Rule:* No red or shaming states for payment in the first weeks. "Payment pending" is neutral gold, not red.
* *Rule:* No odds, spreads, or betting advice in the UI. The pool has no spreads.

#### 🛠️ Key Feature Alignment
* **"How it works" panel and tiebreaker explainer.**
* **Display-name privacy default.**
* **Copy-field e-Transfer instructions.**
* **Neutral payment-pending badge.**

#### 🔄 Journey Arc — Stage Transition
Jen's critical moment is the first loss. Her second-week experience should lead with "new week, new pot" and make re-entry one tap. After three weeks she may behave like Dale. Treat her as a returning player once she has entered twice.

#### 🏆 Success Metrics
* **First-entry completion rate:** % of first-time visitors who submit.
* **Week-2 return:** % of first-time players who play again the following week.
* **Help usage:** Taps on "How it works" (a high number signals confusing copy).

#### 🖼️ Asset Metadata
* `ASSETS.personas.jen.headshot`
* `ASSETS.personas.jen.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 5. "Troy" (The Cross-Border Player)
> *"I play the same as everybody. Just don't make me explain why I can't e-Transfer."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Player on the US (New York) side, treated at par |
| **Entry Method** | Self-serve, or through a friend |
| **Payment** | Cash when he crosses to the shop, or via a friend. Interac e-Transfer typically needs a Canadian bank account, which he may not have. |
| **System Archetype** | **The Cross-Border Player** (Parity Test) |
| **Core Motivation** | Play in the same pool, on the same terms, as his friends and family. |
| **Tech Literacy** | Moderate to high. |
| **Environment** | Phone, home or work on the US side. Mobile service near the border may switch between carriers and networks, so connectivity can be inconsistent. |
| **Community Notes** | Many players have family and friends on both sides. The pool is treated as one pool. "At par" means a $20 entry is $20, with no currency conversion and no second-class treatment. |

#### 📖 Bio & Narrative
Troy is 38 and lives on the US side. He has a US phone number and likely a US bank account. He's been in the pool for years through friends. He's not asking for special treatment, just for the site not to assume he's Canadian. Forms asking for a province or postal code, a phone validator that rejects his number, or payment instructions that only work with Interac will each quietly exclude him.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Pays cash at the shop on a weekend visit, picks online. | Works the same as for any local. |
| **Typical case** | Needs someone to bring his $20 across, or settles up later. | Payment method options work for him. Admin marks it paid when received. |
| **Worst case** | Can't pay by the deadline because the only digital option is Canada-only. | Entry is accepted. Payment is tracked separately. Nothing makes him feel second-class. |

> **Design rule:** The Border Test. Every feature is checked for a player with a US phone, US bank, and no Canadian anything.

#### 🎯 Goals & Needs
* **Parity:** Same fee, same rules, same pot, same treatment.
* **Payment path:** At least one payment method that works for him.
* **Payout path:** A way to receive winnings that works for him.
* **No Canada-only assumptions:** In forms, copy, or validation.

#### 🚧 Frustrations & Pain Points
* **Canada-only fields:** Province, postal code, Canadian-format phone validation.
* **Interac-only instructions:** No alternative offered.
* **Ambiguous currency:** Unclear whether $20 or $640 means CAD or USD.
* **Roaming surprises:** A heavy app that drains data when his phone switches networks.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Parity by Default.**
* *Rule:* Phone fields accept any valid North American number (+1). No province, postal code, or address is collected.
* *Rule:* Payment options never assume Interac. Cash at the shop and "someone else is paying for me" are first-class choices. Additional methods are an open decision (see §7).
* *Rule:* Amounts are shown as "$20" with a single, consistent statement that the pool is at par. No conversion UI.
* *Rule:* Payout method is recorded per winner (cash pickup, e-Transfer, or other), so the commissioner knows how to pay him.
* *Rule:* The app stays light, caches the draft, and tolerates network switches without losing picks.

#### 🛠️ Key Feature Alignment
* **Neutral phone validation (NANP).**
* **Flexible payment method list and payout record.**
* **Lightweight, offline-tolerant entry flow.**
* **Group/captain payment** (see Dwayne).

#### 🔄 Journey Arc — Stage Transition
Troy is the cross-border test case, not a stage. If a US-friendly payment method is added later, nothing in his history changes. He just gets another option.

#### 🏆 Success Metrics
* **Parity check:** Number of features that fail the Border Test at release (target: zero).
* **US-side entry completion:** Submission rate for US-number players versus Canadian-number players.
* **Payment completion gap:** Share of US-side entries marked paid before lock compared with Canadian-side entries.

#### 🖼️ Asset Metadata
* `ASSETS.personas.troy.headshot`
* `ASSETS.personas.troy.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 6. "Dwayne" (The Captain)
> *"I've got eight guys at work in a group chat. I collect their picks, I collect their money, I send it all in."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Local organizer of a small group (family, crew, or workplace) |
| **Entry Method** | Collects picks in a group chat and forwards them |
| **Payment** | One bundled e-Transfer or cash for the whole group ($160 for eight) |
| **System Archetype** | **The Captain** (Growth Driver) |
| **Core Motivation** | Keep his group in the pool with the least admin for himself. |
| **Tech Literacy** | Moderate to high. Lives in group chats. |
| **Environment** | Friday and Saturday evenings, phone in hand, scrolling a group chat and copying picks. |
| **Community Notes** | Groups like Dwayne's bring in several players at once, often including people who'd never sign up alone. |

#### 📖 Bio & Narrative
Dwayne is 47. He started collecting picks for his crew because it was easier than everyone texting Tuna separately. He holds the cash, sends one payment, and sends one big message with eight pick lists. He's your best growth channel and your biggest design gap: under a one-login-one-person model, he can't enter eight people from his phone.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Gets all eight picks early, sends them in one go. | A way to submit for his group, or a clean handoff to the commissioner. |
| **Typical case** | Waits on two guys until Saturday night. | Clear per-person status ("6 of 8 in") visible to him. |
| **Worst case** | Pays $160 for eight, but the commissioner has to figure out who it covers. | One bundled payment can be matched to several entries in one action. |

> **Design rule:** One payment may cover many entries. The admin must be able to record that in one step.

#### 🎯 Goals & Needs
* **Group submission:** Enter picks for named group members.
* **Bundled payment:** One payment, many entries.
* **Group status:** See who's in and who's missing.
* **Group sharing:** A link or message to forward to his group.

#### 🚧 Frustrations & Pain Points
* **One-login limit:** Can't enter others from his own phone.
* **Payment matching:** The commissioner has to guess which entries a $160 payment covers.
* **Chasing:** He's the one who gets blamed when a guy is late.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: One Payment, Many Entries.**
* *Rule (v1):* Admin can select several entries and mark them paid together with a "paid as group by Dwayne" note.
* *Rule (v1):* Admin quick-entry supports pasting several people's lists in one go, each tagged to a roster player.
* *Rule (v2):* Captain role. A signed-in player can manage a small group of profiles they created (`managedByUid`), enter picks for them, and see their group's status. Each member can later claim their own profile.
* *Rule:* A captain never sees a group member's picks to compare before lock, beyond what they entered themselves. Picks stay private.

#### 🛠️ Key Feature Alignment
* **Bulk mark-paid with a shared payment note** (Sprint 3-4).
* **Multi-entry paste in admin quick entry** (Sprint 4).
* **Captain/group management** (post-v1, see §6).

#### 🔄 Journey Arc — Stage Transition
Group members who like the pool become independent players (Dale or Jen). The captain's profile model makes each member's claim a link, not a migration.

#### 🏆 Success Metrics
* **Group entries per week:** Entries tagged as group-sourced.
* **Bundle-payment matching time:** Admin seconds to reconcile a group payment.
* **Member graduation:** % of group members who later self-enter.

#### 🖼️ Asset Metadata
* `ASSETS.personas.dwayne.headshot`
* `ASSETS.personas.dwayne.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 7. "Kayla" (The Hype)
> *"If I win, everyone's going to hear about it. If I lose, nobody needs to know."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Younger local player, social-media native |
| **Entry Method** | Self-serve, usually Friday or Saturday |
| **Payment** | e-Transfer |
| **System Archetype** | **The Hype** (Viral Driver) |
| **Core Motivation** | Bragging rights, group chat banter, the fun of a close finish. |
| **Tech Literacy** | Digital native. Expects polish. |
| **Environment** | Phone, always on, screenshots everything, shares to stories and group chats. |
| **Community Notes** | She brings her friends in. She'll share a winner card or a results screenshot in seconds, so what's on the screen is what gets shared. |

#### 📖 Bio & Narrative
Kayla is 23, plays because her friends do, and treats the pool as a social event. She wants the leaderboard to be fun and the winner banner to look great. She will screenshot whatever's on her screen and post it. She's not trying to expose anyone, but she will, accidentally, if the screen shows phone numbers or payment status.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | She wins. | A winner banner worth sharing, with no private data on it. |
| **Typical case** | Midweek banter, checks the leaderboard. | Clear, fun leaderboard with display names. |
| **Worst case** | She loses badly and her mistake gets screenshotted by a friend. | Share cards are opt-in and show only what she chooses. Nothing about payment appears on any shareable surface. |

> **Design rule:** Anything shareable is safe to screenshot. No phone numbers, payment status, or surnames by default.

#### 🎯 Goals & Needs
* **Shareable moments:** A picks card after lock, a winner card, a weekly recap.
* **Fun leaderboard:** Clear ranks, who's tied, who's hot.
* **Easy invites:** A link to send friends.

#### 🚧 Frustrations & Pain Points
* **Ugly screens:** A leaderboard that looks like a spreadsheet.
* **No share option:** Having to screenshot clumsily.
* **Privacy leaks:** A friend's phone number visible in the screenshot.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Safe to Share.**
* *Rule:* Share cards show display name, picks (after lock), and record only. Never phone, payment status, or email.
* *Rule:* Share is opt-in per card. No auto-posting.
* *Rule:* No streak or loss-chasing mechanics ("double or nothing," "win it back"). Fun framing is about this week, not recovering losses.
* *Rule:* A player can set a nickname so that the leaderboard shows what they're comfortable with.

#### 🛠️ Key Feature Alignment
* **Winner banner, "share my picks" card, weekly recap** (Sprint 6-8).
* **Display-name and nickname setting.**
* **Pool invite link.**

#### 🔄 Journey Arc — Stage Transition
If Kayla stays, she becomes a Dale with a following. Her influence is how Jen-type newcomers arrive, so her shares need to land on a welcoming first screen.

#### 🏆 Success Metrics
* **Share rate:** % of players who share a card after lock.
* **Invite conversion:** New players arriving from shared links who complete an entry.
* **Privacy incidents:** Shared screens that exposed private data (target: zero).

#### 🖼️ Asset Metadata
* `ASSETS.personas.kayla.headshot`
* `ASSETS.personas.kayla.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 8. "Gerald" (The Auditor)
> *"Show me. Who picked what, when did they submit, and how exactly did that tiebreaker work out?"*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Long-time local player, respected voice in the group |
| **Entry Method** | Self-serve or paper, always keeps a copy |
| **Payment** | Cash or e-Transfer, keeps the receipt |
| **System Archetype** | **The Auditor** (Trust Anchor) |
| **Core Motivation** | Be sure the pool is run fairly, because money is on the line. |
| **Tech Literacy** | Moderate. Reads everything. Screenshots to prove things. |
| **Environment** | Sunday evening and Monday night, checking results against his own tally. Often on a phone, sometimes on a laptop. |
| **Community Notes** | He has seen pools go wrong elsewhere. If he's satisfied, he becomes the pool's best advocate. If he isn't, he says so publicly. |

#### 📖 Bio & Narrative
Gerald is 58 and has played for years. He once lost a pool to a tiebreaker he didn't understand, run by an organizer he didn't trust, and he remembers it. He isn't hostile. He's careful. He wants to see everyone's picks after lock, when each was submitted, how the pot was computed, and exactly how a tie was broken. He keeps his own tally and will check yours.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Everything matches his own tally. | Clear final standings and a winner explanation that reproduces his math. |
| **Typical case** | Checks the reveal grid and his own record. | Picks grid with submission times and a visible record per player. |
| **Worst case** | A tight tiebreaker and a result he doesn't expect. | A step-by-step "How the winner was decided" panel, with the actual MNF total, each tied player's prediction, and the rule applied. |

> **Design rule:** The Gerald Trust Test. Every fairness-relevant fact is visible, timestamped, and explainable without asking anyone.

#### 🎯 Goals & Needs
* **Transparency:** Everyone's picks visible after lock, with submission times.
* **Explainability:** A tiebreaker walk-through, with numbers.
* **Pot clarity:** Entries counted, entries paid, pot size, payout.
* **Honest corrections:** If a result is corrected, a visible note says so.

#### 🚧 Frustrations & Pain Points
* **Opacity:** "Trust me" results with no breakdown.
* **Silent edits:** A changed result with no trace.
* **Late changes:** Anything that smells like a pick edited after lock.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Verifiable by Anyone.**
* *Rule:* After lock, the full picks grid is visible to all signed-in players, with each entry's submission time. Before lock, picks are private to the owner and admin.
* *Rule:* The winner view includes a "How this was decided" panel: records, MNF actual, each tied player's prediction, which tiebreaker step applied, split or not.
* *Rule:* The pot is shown as paid entries × entry fee, with the count of paid and total entries.
* *Rule:* A result correction after Final shows a public "Result corrected" note with a timestamp. The detailed audit log stays admin-only.
* *Rule:* Late or overridden entries carry a visible "late entry (approved)" marker for anyone who views the grid.

#### 🛠️ Key Feature Alignment
* **Post-lock reveal grid with timestamps** (Sprint 6).
* **Winner explanation panel.**
* **Audit log and correction flag** (Sprint 3, 6).
* **Pot summary.**

#### 🔄 Journey Arc — Stage Transition
Gerald's trust is earned over a few weeks. Once he sees that reveals, timestamps, and explanations are consistent, his scrutiny drops and he becomes a trusted voice. A single unexplained result resets that.

#### 🏆 Success Metrics
* **Dispute count:** Unresolved disputes per season (target: zero).
* **Explainer use:** Views of the "How this was decided" panel after close results (a spike signals a confusing outcome).
* **Correction rate:** Post-Final corrections per season, each with a visible note.

#### 🖼️ Asset Metadata
* `ASSETS.personas.gerald.headshot`
* `ASSETS.personas.gerald.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 9. "The Commissioner" (The Operator)
> *"I've got a customer at the counter, a stack of sheets, and eleven texts. I need to get this done in ten seconds, and I need to be able to undo it."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | The pool operator (Tuna's seat), admin on the site |
| **Entry Method** | Admin tools: paper entry, text entry, payments, results, payout |
| **Payment** | Handles all channels: cash, e-Transfer notifications, group payments |
| **System Archetype** | **The Operator** (Operations Driver) |
| **Core Motivation** | Run a clean, fair pool without it becoming a second job. |
| **Tech Literacy** | High. Impatient with slow or fussy admin tools. |
| **Environment** | Mostly the shop counter, one-handed, interrupted constantly. Also late nights and Sunday/Monday for results. Phone first, sometimes laptop. |
| **Community Notes** | Knows every player. Handles seniors, texters, groups, and cross-border players. Absorbs every "can you just add me" request. |

> *This is a role, not a named individual. Whoever sits in the commissioner's seat is the persona.*

#### 📖 Bio & Narrative
The commissioner's week has a rhythm: set up the week early, nudge people midweek, chase payments Thursday through Saturday, lock Saturday night, enter results Sunday and Monday, announce a winner, and pay out. Between those, they transcribe paper sheets, decode texts, answer "did you get mine?", and handle disputes. The site only succeeds if it makes this weekly job shorter, not different.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | Midweek, quiet. Sets up the week and previews it in minutes. | Paste the matchups, set the lock, clone last week, preview, open. |
| **Typical case** | Saturday afternoon, payments rolling in, a few late requests. | Payments queue is the home screen. One tap to mark paid. One tap to undo. |
| **Worst case** | Saturday 11:50 PM: three "add me" texts, a bundled payment, a tied winner Monday, a dispute Tuesday. | Override requires a reason and is logged. Bundle payments are one action. The tiebreaker computes itself. The audit log answers the dispute. |

> **Design rule:** The Commissioner Counter Test. Every admin action is doable one-handed, in seconds, with an undo.

#### 🎯 Goals & Needs
* **Speed:** Mark payments, enter paper picks, and publish results quickly.
* **Safety:** Every action undoable and logged.
* **Visibility:** Who's entered, who's paid, who's missing, who's duplicated.
* **Fair-play protection:** Lock integrity, with controlled, reasoned overrides.
* **Payout:** Winner, amount, and payout method clear.

#### 🚧 Frustrations & Pain Points
* **Payment chasing:** Piecing together cash, e-Transfer emails, and group payments.
* **Transcription:** Typing 15 picks for each paper sheet.
* **Late requests:** Pressure to bend the lock.
* **Duplicates:** Players entering twice under different devices.
* **Disputes:** "That's not what I picked."

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Ten Seconds and an Undo.**
* *Rule:* The payments queue is the home screen. Marking paid is one tap with undo.
* *Rule:* Every admin write that matters (paid, entry edit, override, results, claim) goes through an audited action. No silent changes.
* *Rule:* Post-lock changes require a typed reason and show a visible badge.
* *Rule:* Admin screens keep 48px targets and work one-handed in portrait.
* *Rule:* Weekly setup, results, and payout each have a "done" state so the commissioner knows what's outstanding.

#### 🛠️ Key Feature Alignment
* **Payments queue, bulk and single mark-paid** (Sprint 3).
* **Week setup with clone and preview** (Sprint 1).
* **Roster, paper-entry mode, source tags, photo attachment** (Sprint 4).
* **Claims tab and audit log** (Sprint 5).
* **Results, winner, payout record, weekly report** (Sprint 3, 7).

#### 🔄 Journey Arc — Stage Transition
Weeks 1-3 are the heaviest as everyone learns. By mid-season the commissioner should spend most of their time on payments and results only. If the weekly workload isn't dropping by Week 6, the admin tools are failing.

#### 🏆 Success Metrics
* **Weekly admin time:** Total minutes per week (target: dropping to under 30 by mid-season).
* **Undo and correction rate:** Admin actions undone (a high number signals fragile UI).
* **Unresolved items at lock:** Entries with unknown payment or ambiguous picks.

#### 🖼️ Asset Metadata
* `ASSETS.personas.commissioner.headshot`
* `ASSETS.personas.commissioner.full_body`
* Bio content rendered by `PersonaBioCard`.

---

### 10. "Devon" (The Counter Hand)
> *"Someone hands me cash and a sheet while the boss is out. I just don't want to mess anything up."*

| Attribute | Profile |
| :--- | :--- |
| **Pool Segment** | Shop staff who covers the counter |
| **Entry Method** | Receives paper sheets and cash, may enter paper picks |
| **Payment** | Takes cash and marks it received |
| **System Archetype** | **The Counter Hand** (Delegate) |
| **Core Motivation** | Handle the customer in front of him quickly and correctly without needing to call the boss. |
| **Tech Literacy** | Moderate. Learns by doing. Doesn't know the pool's rules in depth. |
| **Environment** | Behind the counter, shop phone or tablet, customers waiting. Interrupted constantly. |
| **Community Notes** | Treated as trusted, but should not have power to change results, winners, or claims. |

> *Also a role, not a named individual.*

#### 📖 Bio & Narrative
Devon works the counter when the commissioner is away. A regular hands over a sheet and $20. Devon needs to record both without breaking anything, without needing to know the lock rules or the tiebreaker, and without being able to do something irreversible. Today there's no safe way to delegate, so the commissioner either handles everything or trusts a notebook.

#### 🌡️ Emotional State Spectrum
| State | Context | Design Response |
| :--- | :--- | :--- |
| **Best case** | One customer, a clean sheet, plenty of time. | Pick the player, enter picks in paper order, mark paid, done. |
| **Typical case** | A line forms, someone asks about last week's winner. | A quick-lookup roster and a printed or on-screen leaderboard answer it. |
| **Worst case** | Someone wants to be added after lock. | Devon cannot override. The screen says "Needs the commissioner," and the request is queued for approval. |

> **Design rule:** Delegates can do the daily work, never the irreversible work.

#### 🎯 Goals & Needs
* **Safe delegation:** Take cash, record paper picks, answer simple questions.
* **Guardrails:** Can't publish winners, change results, approve claims, or override the lock.
* **Accountability:** Everything Devon does is logged under his name.
* **Fast training:** Learned in a couple of minutes.

#### 🚧 Frustrations & Pain Points
* **Fear of breaking things:** Unclear which actions are reversible.
* **Missing permission:** Hitting a wall with no explanation.
* **Rules he doesn't know:** Being asked to judge lock or tiebreaker questions.

#### ⚡ UX Constraints & Rules
* **Primary Constraint: Safe, Narrow Permissions.**
* *Rule:* A "counter" role can mark cash received and enter paper or text picks while the week is open. It cannot enter results, publish winners, approve claims, delete entries, or override the lock.
* *Rule:* Blocked actions say what to do ("Ask the commissioner") and offer a one-tap request.
* *Rule:* All counter actions are logged with the actor's identity.
* *Rule:* The counter view shows only what's needed: roster, paper entry, payments, and the current week.

#### 🛠️ Key Feature Alignment
* **Role-scoped permissions via custom claims** (post-Sprint 4, see §6).
* **Counter-mode admin view.**
* **Per-actor audit trail.**

#### 🔄 Journey Arc — Stage Transition
Devon starts with the counter role only. If the commissioner wants to delegate more, permissions are raised one at a time, never as a blanket "admin" switch.

#### 🏆 Success Metrics
* **Delegated actions:** Share of paper entries and payments recorded by the counter role.
* **Blocked-action rate:** Attempts at actions outside the role (informs training and UI).
* **Correction rate:** Counter-role entries corrected later by the commissioner.

#### 🖼️ Asset Metadata
* `ASSETS.personas.devon.headshot`
* `ASSETS.personas.devon.full_body`
* Bio content rendered by `PersonaBioCard`.

---

## §4 Anti-Personas

Anti-personas document behaviors the product should not enable, or users who could be harmed by it. They are documented risks to design against, not people to police.

---

### Anti-Persona A — "The Double-Dipper"
> A player who enters twice under different devices or accounts to improve their odds.

**Risk:** Anonymous auth means a cleared browser creates a new identity, and a second entry could slip in.

**Design responses already in the plan:**
- Duplicate flags on matching phone numbers and names in the admin view.
- Only entries marked paid count toward the pot and winners.
- One entry per `playerId` per week, enforced by the document ID.

**Additional safeguards:** Show duplicate flags before the commissioner confirms payment. Never accuse automatically. The flag prompts a human check.

---

### Anti-Persona B — "The Late Pick Lobbyist"
> A player (or friend of the commissioner) who asks for a pick to be added or changed after lock.

**Risk:** Quiet exceptions destroy trust with Gerald and everyone like him.

**Design responses:**
- The lock is enforced on the server, not by the client clock.
- Post-lock changes require the commissioner's override with a typed reason, a visible badge, and an audit log entry.
- The counter role cannot override.

**Additional safeguard:** The reveal grid shows late entries with a visible "approved late entry" marker.

---

### Anti-Persona C — "The Underage Entrant"
> Someone below the legal gambling age in their jurisdiction joins the pool.

**Risk:** A public sign-up flow lowers the barrier to an under-age person entering. Legal ages differ between Ontario and New York.

**Design response:** Add a simple age attestation on first entry ("I confirm I'm of legal age to take part where I live"). The exact wording and the age to use are open decisions for the commissioner (see §7). Do not collect birthdates or ID.

---

### Anti-Persona D — "The Chaser"
> A player for whom gambling is becoming harmful: entering beyond their means, running a tab, or trying to win back losses.

**Risk:** "Will drop off cash" can turn into an informal tab. Features that reward chasing (multiple entries, side pots, "double or nothing," streak pressure) would make things worse.

**Design responses:**
- A fixed entry fee and one entry per person per week in v1.
- No credit, no IOUs, no running balances. Unpaid entries don't count, and the app never builds a "you owe" ledger.
- No loss-recovery framing, streak pressure, or "win it back" prompts.
- A discreet responsible-play link in the footer to support services for both sides of the border (for example ConnexOntario and the New York HOPEline). **Verify current numbers and links before launch.**
- The commissioner can quietly remove or pause an entry at their discretion.

**What we do not do:** detect or profile individual players. That would be surveillance and would violate the product's values.

---

### Anti-Persona E — "The Snoop"
> A player who wants to see rivals' picks before lock, or harvest other people's phone numbers.

**Risk:** Early picks let someone copy the leaders. A visible phone number is a privacy leak for seniors and newcomers.

**Design responses:**
- Picks live in a private document, unreadable by other players until the week is revealed.
- Phone numbers and emails are private to the owner and the admin.
- Claim requests reveal nothing about the profile being requested.
- Payment status and method are not shown to other players (see §6).

---

## §5 Persona Overlap Register

| Pair | Overlap | Resolution |
| :--- | :--- | :--- |
| Dale ↔ Gerald | Both long-time, competitive | **Speed vs. verification.** Dale optimises for fast entry, Gerald for proof. Resolve with a fast form and an after-the-fact record: confirmation receipt with timestamp for Dale, reveal grid and explanation panel for Gerald. Never slow Dale to satisfy Gerald. |
| Rosalie ↔ Bernie | Both rely on the commissioner | **Rosalie never self-serves. Bernie could.** Same admin tools serve both. Bernie is gently nudged toward the link, Rosalie never is. |
| Rosalie ↔ Kayla | Public leaderboard vs. privacy | **Display-name default.** First name and last initial, with nickname option. Seniors are never exposed by a share feature. |
| Jen ↔ Troy | Both outside the core group | **Welcome vs. parity.** Jen needs plain words and privacy. Troy needs payment that works. Both are served by neutral copy and flexible payment options. |
| Dale ↔ Dwayne | Individual vs. group | **One payment, many entries.** Dale's flow stays individual. Dwayne's needs are met by bulk admin actions now and a captain role later. |
| Kayla ↔ Gerald | Social sharing vs. trust | **Both want visibility.** Share cards are opt-in, safe to screenshot, and show only what is already public after lock. |
| Commissioner ↔ Devon | Full vs. delegated authority | **Roles, not a single admin switch.** The commissioner holds all permissions. The counter role gets daily work only. |
| Rosalie ↔ Commissioner | Fidelity vs. speed | **Transcription accuracy.** Paper order matching and a photo of the sheet protect Rosalie while keeping entry fast. |
| Jen ↔ Gerald | Newcomer vs. veteran | **Same facts, different depth.** The winner explanation is one tap deep. Jen never needs it, Gerald always can. |

---

## §6 Pool Constraints Register

Cross-persona facts that shape every build decision.

| Constraint | Detail | Personas |
| :--- | :--- | :--- |
| **Payments are mixed** | Cash at the shop, e-Transfer, bundled payments, and possibly friends paying for friends. | All |
| **Interac is Canada-only** | A US-side player typically can't send an e-Transfer. At least one payment path must work without it. | Troy, Dwayne |
| **At par** | A $20 entry is $20 for everyone. No conversion UI. State this once, clearly. | Troy, Jen |
| **Phone numbers are +1** | Canadian and US numbers share the same format. Validation must accept both. | Troy |
| **No Canada-only fields** | No province, postal code, or address. | Troy |
| **Seniors use paper** | Paper and text entry are first-class, not workarounds. | Rosalie, Bernie |
| **Names matter** | Spelling and display must be right. Default to first name and last initial. | Rosalie, Kayla, Jen |
| **Payment status is private** | Other players should not see who has or hasn't paid. | Jen, Rosalie |
| **Lock is a trust event** | Server-enforced, visible, never bent silently. | Gerald, Dale |
| **Signal is uneven** | Near the border and in rural areas, networks can drop or switch. The entry flow must be light and draft-safe. | Dale, Troy |
| **Fixed fee, no tabs** | One entry, one fee. No credit or IOUs. | The Chaser |
| **One payment, many entries** | Group payments need one-step matching. | Dwayne, Commissioner |

### Spec Impact Log

Changes this persona work suggests to the existing docs. Adopted so far: #1 (D-036), #5 and the phone part of #8 (D-038), and the age-attestation part of #9 (D-037). The rest are open in `DECISIONS.md`.

| # | Change | Driven by | Affects |
| :--- | :--- | :--- | :--- |
| 1 | **Hide `paymentMethod` and `paymentStatus` from other players.** Today any signed-in user can read the whole entry doc. Show only the owner and admin, or split them into a private sub-document. | Jen, Rosalie, Kayla | `FIRESTORE_RULES.md`, `DATA_MODEL.md` |
| 2 | **Bundle payments.** Add a `paymentGroupId` or `payments` collection so one payment can cover several entries, with a note. | Dwayne, Commissioner | `DATA_MODEL.md`, Sprint 3 |
| 3 | **Counter role.** Add a `role` custom claim (`admin` or `counter`) and a restricted callable set. | Devon | `FIRESTORE_RULES.md`, `DATA_MODEL.md`, Sprint 4 |
| 4 | **Payout method and record.** Capture how a winner wants to be paid and record the payout. | Troy, Commissioner | `DATA_MODEL.md`, Sprint 3 |
| 5 | **Display-name default** of first name and last initial, with a nickname option. | Rosalie, Kayla, Jen | `DATA_MODEL.md`, Sprint 2 |
| 6 | **Captain role** (`players.managedByUid`) so a player can manage a small group. | Dwayne | `DATA_MODEL.md`, post-v1 |
| 7 | **Submission timestamps** visible post-lock, a **"How this was decided"** winner panel, and a public **"Result corrected"** note. | Gerald | `DATA_MODEL.md`, Sprint 6 |
| 8 | **Payment method list** that doesn't assume Interac, and **NANP phone validation**. | Troy | Sprint 2 |
| 9 | **Age attestation** and a **responsible-play footer link**. | Underage Entrant, The Chaser | Sprint 2, Sprint 8 |
| 10 | **Printable leaderboard** for the counter, in addition to the weekly sheet. | Rosalie | Sprint 8 |

---

## §7 Assumptions to Validate

These personas are built on how the pool is described, not on research. Confirm with the commissioner and a few real players before treating them as fact.

1. **Who is Tuna?** Is the commissioner seat held by one person, and is anyone else helping at the counter?
2. **Paper vs. text vs. self-serve.** Roughly what share of weekly entries come from each today?
3. **How many seniors** play on paper, and do any have family who help them?
4. **How many US-side players** are there, and how do they pay and get paid today?
5. **Group captains.** How many people enter on behalf of a group, and how large are the groups?
6. **Payment mix.** What share is cash vs. e-Transfer, and how are e-Transfers matched to players now?
7. **Connectivity.** How common are dropped connections or network switches for players?
8. **Age and legal comfort.** What does the commissioner want for an age attestation, and what should the wording say?
9. **Responsible-play.** Is the commissioner comfortable with a footer support link and a quiet pause option?
10. **Playoffs and Super Bowl.** Does the pool continue through the playoffs, and does the fee or format change?

---

*Tunas Weekly Football Pool Pick 'Em · docs/PERSONAS.md · v1.0 · October 2026*
