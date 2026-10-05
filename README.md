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
| `npm run test:rules` | Firestore rules tests and the functions' integration tests in the emulator (needs Java 21+) |
| `npm run test:a11y` | Axe, font, and no-horizontal-scroll checks on a production build (Playwright) |
| `npm run test:e2e:emulator` | Browser run of the sign-in, week-setup, and entry flows against running emulators (steps in `scripts/e2e-emulator.mjs`) |
| `npm run test:e2e:mock-week` | The Phase 1 gate in a browser: 12 players, payments, results, winner, payout (needs the Functions emulator; see `scripts/e2e-mock-week.mjs`) |
| `npm run emulators` | Firebase emulators (Auth, Firestore, Functions, Hosting, Storage, UI) |
| `npm run admin:claim -- <uid>` | Grant the admin custom claim (needs a project and credentials, see step 6 below) |

## Firebase setup (one time)

The pool runs inside the existing **`lilypad-strategy-design`** project, which is shared with other apps
(`DECISIONS.md` D-015). It has its own Hosting site (`tunaspool`, https://tunaspool.web.app) and its own named
Firestore database (`db-tunaspool`, location `nam5`). Both are pinned in `firebase.json`; the project is the
`prod` alias in `.firebaserc`. The default alias stays `demo-tunas-pool` so emulators and tests never touch it.

1. Authentication: enable **Anonymous**, **Google**, and **Email link (passwordless)**, and add
   `tunaspool.web.app` under Authentication > Settings > Authorized domains.
2. Add a Web app (linked to the `tunaspool` Hosting site) and copy its config into `.env.local` (see `.env.example`).
3. In the terminal: `npx firebase login --no-localhost`.
4. Deploy: `npm run build && npx firebase deploy --project prod --only hosting,firestore:rules,firestore:indexes`.
5. Cloud Functions and the scheduler need the Blaze (pay-as-you-go) plan. Deploy them with the **Deploy functions** workflow
   or `npx firebase deploy --project prod --only functions:tunaspool`.
6. Grant admin. Sign in at `/admin` with your email link and find your uid under Authentication > Users. The script
   needs a service-account key as well as the project:
   - In the Firebase console, open Project settings > Service accounts and choose **Generate new private key**.
   - Save the JSON **outside the repo** (for example `~/tunas-sa.json`) and never commit it.
   - Run `GOOGLE_APPLICATION_CREDENTIALS=~/tunas-sa.json GCLOUD_PROJECT=lilypad-strategy-design npm run admin:claim -- <uid>`.
   - Tap **Check again** on `/admin` to pick up the claim, then delete the key file and revoke the key in the console.

   With gcloud (installed in the dev container) you can skip the key file: run
   `gcloud auth application-default login --no-launch-browser`, then
   `gcloud auth application-default set-quota-project lilypad-strategy-design` if it asks for a quota project, and
   run the script with only `GCLOUD_PROJECT` set.

   To set the claim in the emulator instead, no key is needed:
   `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run admin:claim -- <uid>`.

**Deploys are automatic.** Every push to `main` that passes CI deploys Hosting, Firestore rules, and Firestore
indexes (the `deploy` job in `.github/workflows/ci.yml`). It authenticates with the `FIREBASE_SERVICE_ACCOUNT`
repo secret (a service-account key) and builds with web config fetched by `scripts/write-web-env.mjs`, so no env
file is committed. Indexes on `db-tunaspool` that are not in `firestore.indexes.json` are deleted. Storage is
still deployed by hand.

**Functions deploy after the site.** When a merge to `main` changes `functions/`, `shared/`, or `firebase.json`, the
`deploy` job runs `firebase deploy --only functions:tunaspool` right after the site, rules, and indexes (D-041). Only
this pool's codebase is deployed, so other apps' functions in the shared project are never touched. The manual
**Deploy functions** workflow (`.github/workflows/deploy-functions.yml`, `main` only) re-runs it. The
`FIREBASE_SERVICE_ACCOUNT` service account needs these roles on `lilypad-strategy-design`: Cloud Functions Admin,
Cloud Run Admin, Service Account User, Cloud Scheduler Admin, Eventarc Admin, and Artifact Registry Administrator.
The first deploy may also need the Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc, and Cloud
Scheduler APIs enabled (a project owner can enable them in the console). If a deploy reports a missing permission,
add the role it names. The site and rules deploy first, so a permissions problem shows as a red `deploy` job without
blocking them.

**Production test run (D-044).** There is no staging project. To try a full week on the live site without real players
seeing it, set up a week in a separate season by opening `/admin/weeks?season=2026-test` (the Back Office shows a "Test
season" badge and keeps the season while you navigate), enter picks at `/picks/2026-test/wk01`, and run the weekly job.
Players' home screen only ever shows the current season. Remove it afterward with `npm run admin:delete-season --
2026-test` (needs credentials, see the script).


For manual deploys, because the project is shared: always pass `--project prod` with an explicit `--only` list, and do not deploy
`storage` (it would replace the rules on the bucket other apps use) until that is sorted out.

### Emulators in Codespaces
Rules tests (`npm run test:rules`) run entirely inside the Codespace. Pointing the *browser* app at the emulators
(`VITE_USE_EMULATORS=true`) uses `127.0.0.1`, which works with VS Code desktop port forwarding but is not verified
for browser-based Codespaces. If it fails there, develop against a real dev Firebase project instead.

## Conventions
See `CLAUDE.md`. Short version: `playerId` is permanent identity, picks are private until reveal, the server enforces
the lockout, audited actions go through callables, and no hard-coded hex values (use the tokens).
