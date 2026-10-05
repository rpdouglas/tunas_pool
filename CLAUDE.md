# CLAUDE.md — Tunas Weekly Football Pool Pick 'Em

> Governance file for Claude Code. Read this first, then the docs it points to.
> If code and docs disagree, stop and flag it. Do not silently pick one.

## 1. What we're building

A mobile-first website that replaces the paper "Tunas Weekly Football Pool Pick 'Em" sheet.

- Players pick one winner for each Sunday NFL game (up to 14; fewer in bye weeks) plus Monday Night Football (up to 15 picks), and enter an MNF total-points tiebreaker.
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
  BRAND_ASSETS.md          <- catalog of supplied artwork and what is cleared to use (originals in brand/originals/)
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
9. **No NFL logos or league IP.** Use team names and brand colors only. The site uses the Baltimore Ravens palette (purple `#241773`, black, gold, red for urgency only), defined in `src/styles/tokens.css`. The sheet's layout language is kept. The mascot is used only recolored, with all NFL marks removed, except the artwork the commissioner cleared in `docs/BRAND_ASSETS.md` (D-053). See `docs/DESIGN_SYSTEM.md` §10.
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
npm run test:rules     # rules tests and the functions' integration tests (Firestore emulator)
npm run test:a11y      # axe, fonts, and 375px checks on /styleguide and the sign-in pages (Playwright)
# The four test:e2e:* flows below are parked (D-066): run them only when asked.
npm run test:e2e:emulator  # full browser flows against running emulators + dev server (see the script header)
npm run test:e2e:mock-week # the Phase 1 gate: 12 players, payments, results, winner, payout (needs the Functions emulator)
npm run test:e2e:paper-entry # Sprint 4: roster, a paper sheet with a photo, a late entry (needs the Functions and Storage emulators)
npm run test:e2e:claims    # Sprint 5: ask to link, approve, history, unlink, reject, merge (needs the Functions emulator)
npm run typecheck      # tsc --noEmit across web + functions
npm run build          # production build
firebase deploy --project prod --only functions:tunaspool   # CI does this after the site deploy when functions changed; or the "Deploy functions" workflow
```

Deployment targets (see `DECISIONS.md` D-015):

| Thing | Value |
|---|---|
| Firebase project | `lilypad-strategy-design` (alias `prod`). **Shared with other apps.** |
| Hosting site | `tunaspool` → https://tunaspool.web.app |
| Firestore database | `db-tunaspool` (named, location `nam5`). Never `(default)`. |
| Storage bucket | `tunaspool-paper-sheets` (deploy target `paperSheets`, D-058). Never the default bucket. |
| Local and CI | `demo-tunas-pool` (emulator only, the `.firebaserc` default) |

- **Merging to `main` deploys to production.** After CI passes, the `deploy` job in `.github/workflows/ci.yml` releases Hosting, Firestore rules, and Firestore indexes (`DECISIONS.md` D-019). Treat every merge, and every rules change in particular, as a release. Functions deploy after the site deploy when `functions/`, `shared/`, or `firebase.json` changed (`DECISIONS.md` D-041), and can be re-run with the manual **Deploy functions** workflow (D-035). Storage is not automated.
- For a manual deploy, always pass `--project prod` and an explicit `--only` list. Never run a bare `firebase deploy`.
- Never deploy `storage` or anything targeting the `(default)` database without asking Ryan: those are shared with other apps in the project.
- Get every Firestore handle with `FIRESTORE_DATABASE_ID` from `shared/config.ts`.

## 7. Workflow (Recursive Build Methodology)

1. Read `docs/ACTIVE_CYCLE.md` for the current sprint goal and task list.
2. **Run the Persona Check** (`docs/PERSONAS.md` §0) on every feature before building: name the primary persona, apply their UX constraints as acceptance criteria, and run the Rosalie, Dale, Gerald, Commissioner, Border, Welcome, and Responsible-Play tests.
3. Implement only what is in scope for the sprint. Log scope creep in `PROJECT_PLAN.md` under *Parked*.
4. Write rules tests **before** or alongside any rules change.
5. Run `typecheck`, `test`, and `test:rules` before declaring a task done.
6. Update docs, then update `ACTIVE_CYCLE.md` with status and anything learned.
7. Use subagents for parallelizable work (for example: rules tests, UI components, function stubs). Review diffs before merging.

**Definition of done:** typechecks clean, tests pass, rules tests cover new paths, the functions' integration tests cover new callables, docs updated, and works on a 375px viewport (`test:a11y` covers the styleguide).

**Browser end-to-end runs are parked (D-066).** Do not write a new `test:e2e:*` flow for a sprint or re-run the existing ones as part of finishing a task. They need the emulators, a dev server, and several browser pages at once, which the Codespace cannot hold reliably, and chasing its "Page crashed" failures cost more time than the runs saved. The scripts stay in the repo. Run one only when Ryan asks, and if a page crashes, say so and move on.

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

Multiple entries per person per week, phone OTP login, online payment processing, ESPN auto-import of scores (planned as a suggestion feature later; the schedule suggestion in week setup is in, `DECISIONS.md` D-051), push notifications, auto-claim by verified email (designed for, switched off).
