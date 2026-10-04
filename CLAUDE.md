# CLAUDE.md — Tunas Weekly Football Pool Pick 'Em

> Governance file for Claude Code. Read this first, then the docs it points to.
> If code and docs disagree, stop and flag it. Do not silently pick one.

## 1. What we're building

A mobile-first website that replaces the paper "Tunas Weekly Football Pool Pick 'Em" sheet.

- Players pick one winner for each of the 14 Sunday NFL games plus Monday Night Football (15 picks), and enter an MNF total-points tiebreaker.
- Players choose a payment method: **Cash** or **e-Transfer**, and **Will do** or **Already did**.
- The admin (Ryan) confirms payments, enters picks on behalf of players (seniors who use paper), enters results, and publishes the weekly winner.
- The pool runs **year over year**. Season standings and all-time history attach to a permanent `playerId`.

Entry fee is $20. Pot = paid entries × $20. Best record wins. Tiebreaker is MNF total points (see `docs/DATA_MODEL.md` §7).

## 2. Stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript (strict), Vite |
| Styling | Tailwind CSS v3 + a small CSS file for brand tokens |
| Data fetching | TanStack Query over Firestore (`onSnapshot` where real-time matters) |
| Backend | Firebase: Firestore, Cloud Functions (2nd gen, TypeScript), Auth, Hosting, Storage |
| Auth | Anonymous by default, upgradable to Google or email link via `linkWithCredential` |
| Testing | Vitest, React Testing Library, `@firebase/rules-unit-testing` against the emulator |
| Tooling | Firebase Emulator Suite for all local work |

## 3. Docs hierarchy (docs-as-code)

```
CLAUDE.md                  <- you are here
docs/
  DATA_MODEL.md            <- collections, fields, enums, scoring, functions
  FIRESTORE_RULES.md       <- security rules + rationale + test matrix
  PERSONAS.md              <- ten personas, anti-personas, persona tests (build every feature against these)
  DESIGN_SYSTEM.md         <- colors, type, components, voice, accessibility
  PROJECT_PLAN.md          <- phases, sprints, acceptance criteria
  ACTIVE_CYCLE.md          <- current sprint (create at Sprint 0; update every sprint)
  DECISIONS.md             <- ADR-style log of decisions (create at Sprint 0)
```

Rules for docs:
- Any schema, rule, or function-contract change updates the matching doc **in the same commit**.
- `firestore.rules` must match the code block in `docs/FIRESTORE_RULES.md`. Treat the file as the source and sync the doc.
- Record every non-obvious decision in `DECISIONS.md` with date and rationale.

## 4. Architecture principles

1. **`playerId` is permanent identity. `uid` is a login attached to it.** Every entry, stat, and standing hangs off `playerId`. Claiming a roster profile links a login to a `playerId`. It never migrates data.
2. **Entry document ID = `playerId`.** This enforces one set of picks per person per week at the database level.
3. **Picks are private until reveal.** Picks and the tiebreaker live in a separate `private/picks` document. Rules only expose them to the owner and admin until the week is revealed.
4. **The server enforces the lockout.** Rules check `week.status == 'open'` and `request.time < week.lockAt`. Never trust the client clock.
5. **Anything that needs an audit trail goes through a callable Cloud Function.** Payments, admin entry edits, post-lock overrides, results, claims, merges, and unlinks are Admin SDK writes that also write `auditLog`. Clients cannot write `auditLog`.
6. **Clients never write derived data.** Standings, stats, `revealed`, and the winner are written by functions only.
7. **Admin = custom claim `admin: true`.** No separate admin login. Set the claim with a one-off script, never from client code.
8. **Mobile first.** Design at 375px wide, thumb-reachable tap targets (min 44px), then scale up. Most players are on phones, and the admin is often at the shop counter.
9. **No NFL logos or league IP.** Use team names and brand colors only. The site uses the Baltimore Ravens palette (purple `#241773`, black, gold, red for urgency only), defined in `src/styles/tokens.css`. The sheet's layout language is kept. The mascot is used only recolored, with all NFL marks removed. See `docs/DESIGN_SYSTEM.md` §10.
10. **The design system is the only source of visual decisions.** Colors, fonts, radii, and shadows come from `tokens.css` and `tailwind.preset.cjs`. No hard-coded hex values and no default Tailwind palette (it is intentionally removed). Prefer semantic utilities (`bg-surface`, `text-ink-muted`, `bg-action-primary`).

## 5. Conventions

- TypeScript `strict: true`. No `any` without a comment explaining why.
- Shared types live in `packages/shared` (or `src/shared`) and are imported by both the web app and functions. The types in `docs/DATA_MODEL.md` are the starting point.
- Feature-folder structure: `src/features/{entry,admin,claims,leaderboard,auth}/...`.
- Firestore access is wrapped in typed converters and hooks, so no raw `getDoc` in components.
- Timestamps are Firestore `Timestamp` on the server. Display in `America/Toronto`.
- Money is stored as integer cents (`entryFeeCents: 2000`).
- Accessible by default: labels, focus states, and sufficient contrast. Many players are older. Follow `docs/DESIGN_SYSTEM.md` §9 (48px targets, 16px minimum text, two-tone focus ring, never color alone).
- Every new UI component gets an entry in the dev-only `/styleguide` route showing all of its states.
- Player screens use the Game Day surface, and admin screens use the Back Office surface (`docs/DESIGN_SYSTEM.md` §7).
- Keep copy friendly and plain. No jargon in player-facing UI.

## 6. Commands

```bash
npm run dev            # Vite dev server
npm run emulators      # firebase emulators:start (auth, firestore, functions, storage)
npm run test           # Vitest
npm run test:rules     # rules unit tests (emulator)
npm run typecheck      # tsc --noEmit across web + functions
npm run build          # production build
firebase deploy --only hosting,firestore:rules,functions
```

## 7. Workflow (Recursive Build Methodology)

1. Read `docs/ACTIVE_CYCLE.md` for the current sprint goal and task list.
2. **Run the Persona Check** (`docs/PERSONAS.md` §0) on every feature before building: name the primary persona, apply their UX constraints as acceptance criteria, and run the Rosalie, Dale, Gerald, Commissioner, Border, Welcome, and Responsible-Play tests.
3. Implement only what is in scope for the sprint. Log scope creep in `PROJECT_PLAN.md` under *Parked*.
4. Write rules tests **before** or alongside any rules change.
5. Run `typecheck`, `test`, and `test:rules` before declaring a task done.
6. Update docs, then update `ACTIVE_CYCLE.md` with status and anything learned.
7. Use subagents for parallelizable work (for example: rules tests, UI components, function stubs). Review diffs before merging.

**Definition of done:** typechecks clean, tests pass, rules tests cover new paths, docs updated, works on a 375px viewport, and works in the emulator end to end.

## 8. Hard "never" list

- Never write a client path that sets `paymentStatus`, `claimedByUid`, `revealed`, standings, or audit entries.
- Never expose `players/*` phone numbers or emails to anyone but the owner and admin.
- Never reveal picks or tiebreakers before `revealed == true`.
- Never allow client writes to an entry after lock. Post-lock changes are admin-only via the override callable, with a required reason.
- Never auto-claim a roster profile. Every claim requires admin approval (v1 decision).
- Never put secrets or the admin claim script in the client bundle.
- Never commit `.env*` files or service account keys.

## 9. Known open decisions

Tracked in `docs/PROJECT_PLAN.md` §7. Do not guess on these. Ask Ryan, or use the stated default and note it in `DECISIONS.md`.

## 10. Out of scope for v1

Multiple entries per person per week, phone OTP login, online payment processing, ESPN auto-import of schedules and scores (planned as a suggestion feature later), push notifications, auto-claim by verified email (designed for, switched off).
