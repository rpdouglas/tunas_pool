/**
 * End-to-end check of the Sprint 1 flows against the emulators: admin sign-in and claim, week setup,
 * open / back to draft / open, guest upgrade, the "email already has an account" move, and a link
 * opened on another device. Not run in CI (it needs the Functions emulator and a dev server).
 *
 *   1. npm --prefix functions run build
 *   2. npx firebase emulators:start --only auth,firestore,functions --project demo-tunas-pool
 *   3. VITE_USE_EMULATORS=true npx vite --port 5173
 *   4. npm run test:e2e:emulator      (PW_CHROMIUM_PATH=... to use a preinstalled Chromium)
 *
 * It clears the emulators' Auth and Firestore data first.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const APP = 'http://127.0.0.1:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-tunas-pool/databases/db-tunaspool/documents';
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/e2e-emulator';
mkdirSync(SHOTS, { recursive: true });
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function oobFor(email) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/demo-tunas-pool/oobCodes`);
  const { oobCodes } = await res.json();
  const mine = oobCodes.filter((c) => c.email === email);
  return mine[mine.length - 1];
}

function finishUrl(oob, next = '/') {
  return `${APP}/auth/finish?next=${encodeURIComponent(next)}&apiKey=demo-api-key&oobCode=${oob.oobCode}&mode=signIn&lang=en`;
}

async function uidForEmail(email) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-tunas-pool/accounts:query`, {
    method: 'POST', headers: OWNER, body: JSON.stringify({ returnUserInfo: true }),
  });
  const { userInfo = [] } = await res.json();
  return userInfo.find((u) => u.email === email)?.localId;
}

async function getDoc(path) {
  const res = await fetch(`${FS}/${path}`, { headers: OWNER });
  return res.ok ? res.json() : null;
}

async function listDocs(path) {
  const res = await fetch(`${FS}/${path}?pageSize=100`, { headers: OWNER });
  return (await res.json()).documents ?? [];
}

async function pageUser(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onsuccess = () => {
          const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
          const all = tx.objectStore('firebaseLocalStorage').getAll();
          all.onsuccess = () => {
            const user = all.result.map((r) => r.value).find((v) => v && v.uid);
            resolve(user ? { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email } : null);
          };
        };
        req.onerror = () => resolve(null);
      }),
  );
}

async function waitForUser(page, predicate = (u) => Boolean(u)) {
  for (let i = 0; i < 40; i++) {
    const u = await pageUser(page);
    if (predicate(u)) return u;
    await page.waitForTimeout(250);
  }
  return pageUser(page);
}

const FULL_WEEK = `Sun 9:30 AM Jaguars at Rams (London)
Colts at Commanders
Bills at Dolphins
Ravens at Bengals
Browns at Steelers
Texans at Titans
Broncos at Raiders
Cowboys at Giants
Eagles at Bears
Lions at Packers
Vikings at Falcons
Panthers at Saints
Buccaneers at Cardinals
Sun 4:25 PM 49ers at Seahawks
Mon 8:15 PM Chiefs at Chargers`;

await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-tunas-pool/databases/db-tunaspool/documents', { method: 'DELETE' });
await fetch(`${AUTH}/emulator/v1/projects/demo-tunas-pool/accounts`, { method: 'DELETE' });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const phone = { viewport: { width: 375, height: 812 } };
const consoleErrors = [];
async function newPage() {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  globalThis.lastPage = page;
  return page;
}

try {
  // ---- A. Admin sign-in, guard, claim ------------------------------------------------
  const admin = await newPage();
  await admin.goto(`${APP}/admin`);
  await admin.getByText('This area is for the pool admin').waitFor();
  check('A1 /admin asks a signed-out visitor to sign in', true);
  await admin.getByLabel('Email').fill('ryan@tunas.test');
  await admin.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await admin.getByText('Check your email').waitFor();
  const adminOob = await oobFor('ryan@tunas.test');
  check('A2 a sign-in link was sent', Boolean(adminOob));
  await admin.goto(finishUrl(adminOob, '/admin'));
  await admin.getByText("You're signed in.").waitFor();
  check('A3 admin finishes email-link sign-in', true);
  await admin.getByRole('link', { name: 'Continue' }).click();
  await admin.getByText("which isn't an admin account").waitFor();
  check('A4 a signed-in non-admin is kept out of the Back Office', true);

  const adminUid = await uidForEmail('ryan@tunas.test');
  execSync(`npm run -s admin:claim -- ${adminUid}`, {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', GCLOUD_PROJECT: 'demo-tunas-pool' },
    stdio: 'pipe',
  });
  await admin.getByRole('button', { name: 'Check again' }).click();
  await admin.getByRole('heading', { name: '2026 weeks' }).waitFor();
  check('A5 the admin:claim script grants access after "Check again"', true);
  await admin.getByText('No weeks yet').waitFor();
  await admin.screenshot({ path: `${SHOTS}/e2e-weeks-empty.png`, fullPage: true });

  // ---- B. Week setup: paste, save draft, preview, open, back to draft, open ----------
  await admin.getByRole('link', { name: 'Set up week 1' }).click();
  await admin.getByLabel('Matchups').fill(FULL_WEEK.replace('Colts at Commanders', 'Colts at Comanders'));
  await admin.getByText('Line 2: "Comanders" isn\'t a team name. Did you mean Commanders?').waitFor();
  check('B1 a typo is flagged with the line number and a suggestion', true);
  check('B2 save is blocked while a line has a problem', await admin.getByRole('button', { name: 'Save draft' }).isDisabled());
  await admin.getByLabel('Matchups').fill(FULL_WEEK);
  await admin.getByText('14 Sunday games and the Monday night game').waitFor();
  check('B3 a full sheet shows as ready', true);
  const lockShown = await admin.getByText(/^Locks /).first().textContent();
  check('B4 the default lock is Saturday 11:59 PM', /Saturday, Oct \d+, 11:59 PM/.test(lockShown ?? ''), lockShown ?? '');
  await admin.getByRole('button', { name: 'Save draft' }).click();
  await admin.waitForURL('**/admin/weeks/2026/wk01');
  await admin.getByText('Draft saved.').waitFor();
  const saved = await getDoc('seasons/2026/weeks/wk01');
  check('B5 the draft is saved with 15 games and counters at zero',
    saved?.fields.games.arrayValue.values.length === 15 && saved.fields.status.stringValue === 'draft' &&
    saved.fields.entryCount.integerValue === '0' && saved.fields.revealed.booleanValue === false);
  const season = await getDoc('seasons/2026');
  check('B6 the season doc is created on the first week', season?.fields.entryFeeCents.integerValue === '2000');

  await admin.getByRole('button', { name: 'Preview as a player' }).click();
  const cards = await admin.locator('section[aria-label="Player preview"] li').count();
  check('B7 the player preview shows all 15 games', cards === 15, `${cards} cards`);
  await admin.screenshot({ path: `${SHOTS}/e2e-week-editor.png`, fullPage: true });

  await admin.getByRole('button', { name: 'Open week' }).click();
  await admin.getByText('Week opened. Players can make their picks.').waitFor();
  const opened = await getDoc('seasons/2026/weeks/wk01');
  check('B8 opening goes through the callable', opened?.fields.status.stringValue === 'open');
  let audit = await listDocs('auditLog');
  const openAudit = audit.find((d) => d.fields.after?.mapValue.fields.status?.stringValue === 'open');
  check('B9 the status change is audit logged with before and after',
    openAudit?.fields.action.stringValue === 'week.status' &&
    openAudit.fields.before.mapValue.fields.status.stringValue === 'draft' &&
    openAudit.fields.actorUid.stringValue === adminUid);
  check('B10 an open week is read-only in the editor', await admin.getByLabel('Matchups').isDisabled());

  await admin.getByRole('button', { name: 'Back to draft' }).click();
  await admin.getByText('Back to draft.').waitFor();
  check('B11 an open week with no entries goes back to draft',
    (await getDoc('seasons/2026/weeks/wk01'))?.fields.status.stringValue === 'draft');
  await admin.getByRole('button', { name: 'Open week' }).click();
  await admin.getByText('Week opened.').waitFor();
  audit = await listDocs('auditLog');
  check('B12 every change is logged (3 so far)', audit.filter((d) => d.fields.action.stringValue === 'week.status').length === 3);

  await admin.goto(`${APP}/admin`);
  await admin.getByRole('link', { name: 'Set up week 2' }).click();
  await admin.getByRole('button', { name: 'Copy games and lock from week 1' }).click();
  const cloned = await admin.getByLabel('Matchups').inputValue();
  check('B13 clone copies last week\'s games as a starting point', cloned.split('\n').length === 15 && cloned.startsWith('Sun 9:30 AM Jaguars at Rams (London)'));
  const sundayValue = await admin.getByLabel('Sunday').inputValue();
  check('B14 the new week defaults to the following Sunday', sundayValue === '2026-10-18' || sundayValue === '2026-10-25', sundayValue);

  // ---- C. Guest upgrade keeps the uid ------------------------------------------------
  const guest = await newPage();
  await guest.goto(APP);
  const anon = await waitForUser(guest);
  check('C1 a visitor is signed in as a guest without seeing anything', anon?.isAnonymous === true);
  await guest.getByRole('link', { name: /Played on another phone/ }).click();
  await guest.getByLabel('Email').fill('dale@tunas.test');
  await guest.getByRole('button', { name: 'Email me a link' }).click();
  await guest.getByText('Check your email').waitFor();
  await guest.screenshot({ path: `${SHOTS}/e2e-account-sent.png`, fullPage: true });
  await guest.goto(finishUrl(await oobFor('dale@tunas.test')));
  await guest.getByText('Your picks are saved to this email.').waitFor();
  const upgraded = await waitForUser(guest, (u) => u && !u.isAnonymous);
  check('C2 upgrading to an email link keeps the same uid', upgraded?.uid === anon.uid && upgraded.email === 'dale@tunas.test');

  // ---- D. Email already has an account: sign in and move the guest profile --------
  const guest2 = await newPage();
  await guest2.goto(APP);
  const anon2 = await waitForUser(guest2);
  await fetch(`${FS}/players?documentId=${anon2.uid}`, {
    method: 'POST', headers: OWNER,
    body: JSON.stringify({ fields: {
      displayName: { stringValue: 'Dale D.' }, claimedByUid: { stringValue: anon2.uid },
      origin: { stringValue: 'self' }, active: { booleanValue: true },
    } }),
  });
  await guest2.goto(`${APP}/account`);
  await guest2.getByLabel('Email').fill('dale@tunas.test');
  await guest2.getByRole('button', { name: 'Email me a link' }).click();
  await guest2.getByText('Check your email').waitFor();
  await guest2.goto(finishUrl(await oobFor('dale@tunas.test')));
  const outcome = await Promise.race([
    guest2.getByText('the picks from this phone are now on your account').waitFor().then(() => 'moved'),
    guest2.getByText('we sent you a fresh link').waitFor().then(() => 'resent'),
    guest2.getByRole('alert').waitFor().then(async () => `error: ${await guest2.getByRole('alert').textContent()}`),
  ]);
  console.log(`     collision outcome on first link: ${outcome}`);
  if (outcome === 'resent') {
    await guest2.goto(finishUrl(await oobFor('dale@tunas.test')));
    await guest2.getByText('the picks from this phone are now on your account').waitFor();
  }
  const moved = await getDoc(`players/${anon2.uid}`);
  check('D1 the guest profile now belongs to the existing account',
    moved?.fields.claimedByUid.stringValue === anon.uid, moved?.fields.claimedByUid.stringValue);
  const signedIn2 = await waitForUser(guest2, (u) => u && !u.isAnonymous);
  check('D2 the phone is now signed in to the existing account', signedIn2?.uid === anon.uid);
  audit = await listDocs('auditLog');
  check('D3 the move is audit logged', audit.some((d) => d.fields.action.stringValue === 'player.guestMoved'));

  // ---- E. Link opened on a different phone -----------------------------------------
  const asker = await newPage();
  await asker.goto(`${APP}/account`);
  await asker.getByLabel('Email').fill('jen@tunas.test');
  await asker.getByRole('button', { name: 'Email me a link' }).click();
  await asker.getByText('Check your email').waitFor();
  const other = await newPage();
  await other.goto(finishUrl(await oobFor('jen@tunas.test')));
  await other.getByText('Finish on this phone').waitFor();
  check('E1 a link opened on another device asks for the email', true);
  await other.screenshot({ path: `${SHOTS}/e2e-other-device.png`, fullPage: true });
  await other.getByLabel('Email').fill('jen@tunas.test');
  await other.getByRole('button', { name: 'Finish signing in' }).click();
  await other.getByText("You're signed in.").waitFor();
  check('E2 typing the email finishes sign-in on the other device', true);

  const bad = await newPage();
  await bad.goto(`${APP}/auth/finish`);
  await bad.getByText("This isn't a sign-in link.").waitFor();
  check('E3 a plain /auth/finish visit explains itself', true);

  check('F1 no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (err) {
  failures++;
  console.log(`FAIL (exception) ${err.message.split('\n').slice(0, 3).join(' ')}`);
  await globalThis.lastPage?.screenshot({ path: `${SHOTS}/e2e-failure.png`, fullPage: true });
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
