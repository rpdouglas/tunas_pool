# ACTIVE_CYCLE.md

**Sprint 0: Project setup** · Phase 0 (Foundation) · Started: October 2026

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
- [ ] Create the Firebase project (Firestore in Montreal or Toronto) and enable Auth providers
- [ ] `firebase use --add`, fill `.env.local`, deploy hello-world to Hosting
- [ ] Confirm `npm run test:rules` passes in the Codespace (needs Java; first run downloads the emulator)
- [ ] Add an axe accessibility check against `/styleguide` in CI
- [ ] Verify fonts render (Alfa Slab One, Barlow Condensed, Barlow) and check the styleguide at 375px
- [ ] Obtain the Tuna mascot artwork (Ravens palette, no NFL marks): DESIGN_SYSTEM §10
- [ ] Confirm the open decisions in DECISIONS.md with the commissioner

## Acceptance (from PROJECT_PLAN.md)
`npm run emulators`, `dev`, `test`, `test:rules`, and `typecheck` all run clean. A hello-world is live on Hosting.

## Notes / learned
- (add as you go)
