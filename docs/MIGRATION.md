# Moving the pool to its own project (`tunas-pool`, `tunaspool.ca`)

> Runbook for D-100. Nothing here has been done yet. Part 1 can be done any time and changes nothing
> players see. Part 2 is one evening between weeks. Part 3 is cleanup after a full week on the new
> project. Each part can wait as long as needed: until Part 2 step 6 is merged, the live pool keeps
> running on `lilypad-strategy-design` exactly as it does today.

## Why

`lilypad-strategy-design` is shared with other apps (D-015). Google's sign-in page, the sign-in
emails' sender, and the admin claim all belong to the project, not the pool. A project of its own
gives the pool its own name on the Google page ("Tunas Pool"), emails from
`noreply@tunas-pool.firebaseapp.com`, and claims nobody else's app can see.

## What changes and what doesn't

| | Now | After |
|---|---|---|
| Project | `lilypad-strategy-design` (shared) | `tunas-pool` |
| Address | `tunaspool.web.app` | `tunaspool.ca` (the old address forwards there, for good) |
| Database | `db-tunaspool` | `db-tunaspool` (same name, so `shared/config.ts` doesn't change) |
| Photos bucket | `tunaspool-paper-sheets` | `tunas-pool-paper-sheets` (bucket names are global). Photo paths are stored relative to the bucket, so only `PAPER_SHEETS_BUCKET` changes |
| Logins | | Same uids, providers, and admin/counter claims (`auth:import`). Everyone signs in once more |
| Guests | | Can't be carried over: a guest login lives in one browser and is tied to the old project. Their history stays on their profile; the commissioner merges if they come back as a new guest |

**Why not keep `tunaspool.web.app`:** a Hosting site can't move between projects, and a deleted site
ID "cannot be reactivated by you or anyone else" (Firebase Hosting docs). The old site stays in the
old project and only forwards.

## Part 1: get ready (any time, nothing changes for players)

1. **Domain.** Buy `tunaspool.ca` (a `.ca` needs a Canadian registrant, which Ryan is).
2. **Project.** `gcloud projects create tunas-pool --name="Tunas Pool"`, then
   `npx firebase projects:addfirebase tunas-pool`. Link a billing account (Blaze plan; Functions and
   the scheduler need it). Set a budget alert at a few dollars.
3. **Auth.** Enable Anonymous, Google, and Email/Password with **Email link** on. Branding (Google
   Auth Platform): app name "Tunas Pool", support email. Authorized domains: `tunaspool.ca`.
4. **Database.** Create Firestore database `db-tunaspool` in `nam5`, Native mode.
5. **Bucket.** Create `tunas-pool-paper-sheets` in `us-central1` and link it to Firebase
   (README, "addFirebase" for buckets).
6. **Web app and Hosting.** Register a web app on the default site `tunas-pool`. Add custom domain
   `tunaspool.ca` in Hosting and put its DNS records at the registrar. The certificate can take up to
   a day, which is why this is in Part 1.
7. **OAuth client** (Google Cloud console, Credentials, "Web client (auto created…)"): add
   `https://tunaspool.ca/__/auth/handler` to redirect URIs and `https://tunaspool.ca` to origins.
8. **CI key.** A service account in `tunas-pool` with the same roles as today's deploy account
   (README). Save its key as the GitHub secret `FIREBASE_SERVICE_ACCOUNT_TUNAS`. Keep the old secret.
9. **Dry run.** From a branch, deploy rules, indexes, functions, and hosting to `tunas-pool` by hand
   (`--project tunas-pool`, explicit `--only`). Open `tunaspool.ca`, sign in with Google and the
   email link, and see the empty pool. Then delete the test login. Nothing here touches the live pool.

## Part 2: the move (one evening, after a winner is published and before the next week opens)

Check first: no week is `open` or `locked`, and the old project's data hasn't changed since you
started (nobody is entering picks). About two hours.

1. **Say so.** Tell the group the site is moving tonight and to sign in again tomorrow at the new address.
2. **Database.**
   ```bash
   gcloud firestore export gs://tunas-pool-paper-sheets/_migration/$(date +%F) \
     --database=db-tunaspool --project=lilypad-strategy-design
   gcloud firestore import gs://tunas-pool-paper-sheets/_migration/<that folder> \
     --database=db-tunaspool --project=tunas-pool
   ```
   The old project's Firestore service agent needs write access to the new bucket for the export.
3. **Photos.** `gcloud storage cp -r gs://tunaspool-paper-sheets/paperSheets gs://tunas-pool-paper-sheets/`
4. **Logins: only the pool's.** The old project holds other apps' users too, and they must not be
   copied. `npx firebase auth:export all.json --project prod`, then keep only the uids that appear as
   a `players` document ID or a `claimedByUid` in the pool's database, plus anyone with an `admin` or
   `counter` claim. Write a small script for this on the day and check the count against the roster.
   `npx firebase auth:import pool.json --project tunas-pool`. The pool has no password logins (email
   link and Google only), so no hash settings are needed; the script should refuse if it finds one.
5. **Check.** Count players, weeks, entries, and audit log entries on both sides; open three photos.
6. **Switch.** Merge the PR that points the repo at the new project:
   - `.firebaserc`: `prod` → `tunas-pool`, and the `paperSheets` target → `tunas-pool-paper-sheets`
   - `shared/config.ts`: `PAPER_SHEETS_BUCKET`
   - `scripts/write-web-env.mjs`: `AUTH_DOMAIN` → `tunaspool.ca`
   - `.github/workflows/ci.yml`: the new web app ID and `FIREBASE_SERVICE_ACCOUNT_TUNAS`
   - `shared/messages.ts` `POOL_URL` and `index.html` `og:image` → `https://tunaspool.ca`
   - `firebase.json`: Hosting `site` → `tunas-pool`
   - CLAUDE.md §6 deployment table, README, and the docs that name the old project
   CI deploys everything to `tunas-pool`. Deploy Storage rules by hand to the new bucket.
7. **Forward the old address.** Deploy a one-page site to `tunaspool` in the old project with a
   `firebase.json` holding a single redirect (`"source": "**"`, to `https://tunaspool.ca`, type 301),
   `--project lilypad-strategy-design --only hosting:tunaspool`. Keep it forever; it's free.
8. **Try it.** Ryan signs in on `tunaspool.ca` (Google, then the Yahoo email link) and sees the Back
   Office. Run `npm run admin:claim` against `tunas-pool` for anyone missing a claim.

**Rolling back** (any time before the next week opens): revert the step 6 PR and remove the step 7
redirect. The old project was only read from, so it is exactly as it was.

## Part 3: after one full week on `tunas-pool` (ask Ryan before each)

- Delete the old project's `tunaspool` functions only (`npx firebase functions:delete --project
  lilypad-strategy-design` naming each, never a bare delete) so `lockWeeks` stops running there.
- Delete the old `db-tunaspool` database and `tunaspool-paper-sheets` bucket, after a final export
  is kept somewhere safe.
- Remove the pool's logins from the old project's Auth, leaving the other apps' users alone.
- Remove the old `FIREBASE_SERVICE_ACCOUNT` secret and the old web app.
