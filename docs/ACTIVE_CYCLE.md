# ACTIVE_CYCLE.md

**Sprint 0: Project setup** · Phase 0 (Foundation) · Started: October 2026 · **Closed: 2026-10-05**

## Goal
Repo, emulators, CI, docs, rules skeleton, and the design system foundation running end to end.

## Tasks
- [x] Scaffold Vite + React 19 + TypeScript strict + Tailwind v3 + TanStack Query (`scaffold.sh`)
- [x] Docs in place: CLAUDE.md, DATA_MODEL, FIRESTORE_RULES, DESIGN_SYSTEM, PERSONAS, PROJECT_PLAN
- [x] Design tokens, brand CSS, Tailwind preset, self-hosted fonts (Fontsource)
- [x] `/styleguide` route: Button, Panel, SectionBar, StatusBadge, Field, pick button
- [x] Shared types package from DATA_MODEL (`shared/types.ts`)
- [x] `firestore.rules` + `storage.rules` extracted from FIRESTORE_RULES.md
- [x] Starter rules tests (matrix rows 1, 2, 4, 5, 9, 10, 12, 17, 20-23, 25, 26, 31)
- [x] Cloud Functions stubs for every callable in DATA_MODEL §5
- [x] CI workflow (typecheck, lint, unit tests, rules tests, build)
- [x] Firebase project chosen: shared `lilypad-strategy-design`, Hosting site `tunaspool`, Firestore database `db-tunaspool` in `nam5` (D-015, D-016)
- [x] Pin project alias `prod`, Hosting site, named database, and functions codebase in `.firebaserc` / `firebase.json`; `FIRESTORE_DATABASE_ID` in `shared/config.ts`
- [x] Enable Auth providers (Anonymous, Google, Email link) and add `tunaspool.web.app` to authorized domains
- [x] `firebase login`, add a Web app (`tunaspoolwebapp`), fill `.env.local`, deploy hello-world to Hosting (`--project prod`): live at https://tunaspool.web.app
- [x] Deploy `firestore:rules` and `firestore:indexes` to `db-tunaspool` (verified: release `cloud.firestore/db-tunaspool`; the `(default)` release was not touched)
- [x] Automatic deploy on merge to `main`: Hosting, Firestore rules, Firestore indexes (D-019)
- [→] Add functions to the deploy job once they are implemented: moved to Sprint 3, when the first functions do real work. Region decided (D-028)
- [x] Decide the functions region and the Storage bucket approach: `us-central1` for all functions (D-028), dedicated bucket created in Sprint 4 (D-029)
- [x] Confirm `npm run test:rules` passes in the Codespace (needs Java 21+; first run downloads the emulator)
- [x] Add an axe accessibility check against `/styleguide` in CI: `npm run test:a11y` (Playwright, WCAG 2.2 AA, 375px and desktop; D-030)
- [x] Verify fonts render (Alfa Slab One, Barlow Condensed, Barlow) and check the styleguide at 375px: checked by eye and now asserted in `test:a11y`
- [→] Obtain the Tuna mascot artwork (Ravens palette, no NFL marks): DESIGN_SYSTEM §10. Carried over; needed by Sprint 2 (Ryan)
- [x] Confirm the provisional decisions with the commissioner: D-006 to D-011 and D-014 accepted. Items with no default yet (legal check, e-Transfer address, US-side payments, age attestation, Spec Impact Log) stay open in DECISIONS.md

## Acceptance (from PROJECT_PLAN.md)
`npm run emulators`, `dev`, `test`, `test:rules`, and `typecheck` all run clean. A hello-world is live on Hosting.

## Notes / learned
- The production project is shared with other apps. A bare `firebase deploy`, or one without the `site` / `database` pins, would overwrite their Hosting site, `(default)` Firestore rules, or Storage rules.
- Nothing imports `src/lib/firebase.ts` yet, so the production bundle carries no Firebase config. The first real check of `.env.local` and the named database comes with the first feature that reads Firestore.
- `firebase-tools` 15 will not start the emulators on Java older than 21. CI and the devcontainer were pinned to 17, which failed `test:rules` in CI; both are now 21.
- 2026-10-05: an external plan review was triaged into PROJECT_PLAN (D-020 to D-027). Sprint 1 loses Google sign-in (now Sprint 7). Sprint 2 gains the weekly home screen, confirmation code, and a server-timestamp rule. Sprint 3 gains the week counters and wider duplicate flags. Sprint 0 scope is unchanged. The Sprint 0 Google provider setup stays; it is used in Sprint 7.
- The axe check runs on a production build with `VITE_ENABLE_STYLEGUIDE=true`, so it sees the same CSS players get. In cloud sessions, point Playwright at the preinstalled browser with `PW_CHROMIUM_PATH`; CI installs its own.
- `FUNCTIONS_REGION` lives in `shared/config.ts`. The functions build compiles `shared/` into `functions/lib/shared`, so functions import it directly.
- (add as you go)
