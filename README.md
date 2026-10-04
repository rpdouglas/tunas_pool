# Tunas Weekly Football Pool Pick 'Em

Mobile-first web app replacing the paper weekly NFL pick'em sheet. React 19 + Vite + TypeScript (strict) + Tailwind v3 + Firebase (Firestore, Auth, Functions, Hosting, Storage).

Start with **CLAUDE.md**, then `docs/`:

| Doc | What it covers |
| --- | --- |
| `docs/PROJECT_PLAN.md` | Phases, sprints, acceptance criteria, open decisions |
| `docs/ACTIVE_CYCLE.md` | Current sprint status |
| `docs/DECISIONS.md` | Decision log |
| `docs/DATA_MODEL.md` | Collections, fields, scoring, Cloud Function contracts |
| `docs/FIRESTORE_RULES.md` | Security rules, rationale, test matrix |
| `docs/DESIGN_SYSTEM.md` | Ravens palette, type, components, accessibility |
| `docs/PERSONAS.md` | Personas and the persona tests every feature must pass |

## Quick start

```bash
npm install && npm --prefix functions install
npm run dev            # http://localhost:5173 (forwarded automatically in Codespaces)
# open /styleguide to see every component
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `tsc` for the web app and Cloud Functions |
| `npm run lint` | ESLint |
| `npm test` | Unit and component tests (Vitest + Testing Library) |
| `npm run test:rules` | Firestore rules tests in the emulator (needs Java) |
| `npm run emulators` | Firebase emulators (Auth, Firestore, Functions, Hosting, Storage, UI) |
| `npm run admin:claim -- <uid>` | Grant the admin custom claim (needs credentials) |

## Firebase setup (one time)

1. Create a Firebase project. Create Firestore in **Montreal (`northamerica-northeast1`) or Toronto**, and enable Storage.
2. Authentication: enable **Anonymous**, **Google**, and **Email link (passwordless)**.
3. Add a Web app and copy its config into `.env.local` (see `.env.example`).
4. In the terminal: `npx firebase login --no-localhost`, then `npx firebase use --add`.
5. Deploy: `npm run build && npx firebase deploy --only hosting,firestore:rules,firestore:indexes`.
6. Cloud Functions and the scheduler need the Blaze (pay-as-you-go) plan.

### Emulators in Codespaces
Rules tests (`npm run test:rules`) run entirely inside the Codespace. Pointing the *browser* app at the emulators
(`VITE_USE_EMULATORS=true`) uses `127.0.0.1`, which works with VS Code desktop port forwarding but is not verified
for browser-based Codespaces. If it fails there, develop against a real dev Firebase project instead.

## Conventions
See `CLAUDE.md`. Short version: `playerId` is permanent identity, picks are private until reveal, the server enforces
the lockout, audited actions go through callables, and no hard-coded hex values (use the tokens).
