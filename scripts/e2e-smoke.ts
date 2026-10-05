/**
 * A quick look at the screens in a real browser at 375px (D-082). It is small on purpose: it seeds
 * a season straight into the emulators, serves the built site, and opens two pages at most, so it
 * fits in a Codespace and finishes in a couple of minutes. For every screen it checks that the
 * expected words appear, that nothing scrolls sideways, and that no script error was thrown, and it
 * saves a screenshot to test-results/smoke/ to look at.
 *
 *   npm run test:smoke      (PW_CHROMIUM_PATH=... to use a preinstalled Chromium)
 *
 * It does not replace the rules and function tests, which check that things are right. This checks
 * that the screens load and fit.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, type Page } from '@playwright/test';
import { recomputeAllTime, recomputeStandings } from '../functions/src/season';
import { ALL_HOME, YEAR, seedEntry, seedWeek, testDb } from '../functions/src/testSupport.int';
import { enterResults, publishWinner } from '../functions/src/weekActions';

const fnRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp } = fnRequire(
  'firebase-admin/firestore',
) as typeof import('firebase-admin/firestore');

const APP = 'http://127.0.0.1:4174';
const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-tunas-pool';
const SHOTS = 'test-results/smoke';
const ADMIN_EMAIL = 'ryan@tunas.test';
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const errors: string[] = [];
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}

/** Open a screen, wait for its words, and check it fits a phone. */
async function visit(page: Page, name: string, path: string, expected: string | RegExp) {
  try {
    await page.goto(`${APP}${path}`);
    await page.getByText(expected).first().waitFor({ timeout: 15_000 });
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    check(name, fits, fits ? '' : 'scrolls sideways at 375px');
  } catch (err) {
    await page
      .screenshot({ path: `${SHOTS}/${name}-FAILED.png`, fullPage: true })
      .catch(() => undefined);
    check(name, false, (err as Error).message.split('\n')[0]);
  }
}

// ---- 1. Seed a small season directly (no clicking through setup) ----
const db = testDb();
await fetch(
  `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/db-tunaspool/documents`,
  { method: 'DELETE' },
);
await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
await db
  .doc(`seasons/${YEAR}`)
  .set({ year: YEAR, status: 'active', entryFeeCents: 2000, createdAt: Timestamp.now() });
await db.doc('config/pool').set({
  entryFeeCents: 2000,
  etransferEmail: 'pay@tunas.test',
  etransferInstructions: '',
  contactEmail: 'pool@tunas.test',
  defaultLockRule: 'Saturday 23:59 America/Toronto',
  tieGameRule: 'no_win',
  unpaidEligibleToWin: false,
});
const ref = (weekId: string) => ({ year: YEAR, weekId, actorUid: 'smoke' });
const roster = { origin: 'admin', claimedByUid: null };

// Week 1: final, with a tiebreaker.
await seedWeek(db, { weekId: 'wk01', lockInHours: -24 * 9 });
await seedEntry(db, 'dale', {
  name: 'Dale D.',
  wins: 12,
  guess: 58,
  payment: 'paid',
  weekId: 'wk01',
});
await seedEntry(db, 'jen', {
  name: 'Jen K.',
  wins: 12,
  guess: 45,
  payment: 'paid',
  weekId: 'wk01',
});
await seedEntry(db, 'rosalie', {
  name: 'Rosalie M.',
  wins: 9,
  guess: 40,
  payment: 'paid',
  weekId: 'wk01',
  phone: '+16135550144',
});
await seedEntry(db, 'buccaneer', {
  name: 'Bartholomew Featherstonehaugh',
  wins: 4,
  guess: 30,
  payment: 'unpaid',
  weekId: 'wk01',
});
await enterResults(db, { ...ref('wk01'), results: ALL_HOME, mnfTotal: 46 });
await publishWinner(db, { ...ref('wk01'), expectedPlayerIds: ['dale'] });
// Week 2: locked, some results in.
await seedWeek(db, { weekId: 'wk02', lockInHours: -24 * 2 });
await seedEntry(db, 'dale', { name: 'Dale D.', wins: 8, payment: 'paid', weekId: 'wk02' });
await seedEntry(db, 'jen', { name: 'Jen K.', wins: 10, payment: 'paid', weekId: 'wk02' });
await enterResults(db, {
  ...ref('wk02'),
  results: { g01: 'home', g02: 'home', g03: 'away' },
  mnfTotal: null,
});
// Week 3: open, with someone not in yet and someone unpaid.
await seedWeek(db, { weekId: 'wk03', status: 'open', lockInHours: 60 });
await seedEntry(db, 'jen', {
  name: 'Jen K.',
  wins: 8,
  payment: 'unpaid',
  method: 'etransfer',
  weekId: 'wk03',
  phone: '+13155550199',
});
for (const id of ['rosalie']) await db.doc(`players/${id}`).update(roster);
await db.doc('players/jen').update({ phone: '+13155550199' });
await recomputeStandings(db, YEAR, async (uids) => new Set(uids));
await recomputeAllTime(db);
console.log('seeded 3 weeks');

// ---- 2. Serve the built site and open a browser ----
const preview = spawn(
  'npx',
  [
    'vite',
    'preview',
    '--outDir',
    'dist-smoke',
    '--port',
    '4174',
    '--strictPort',
    '--host',
    '127.0.0.1',
  ],
  { stdio: 'ignore' },
);
for (let i = 0; i < 40; i++) {
  if (
    await fetch(APP)
      .then((r) => r.ok)
      .catch(() => false)
  )
    break;
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH,
  args: ['--disable-dev-shm-usage'],
});

try {
  // ---- 3. A player (guest) ----
  const playerCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const player = await playerCtx.newPage();
  player.on('pageerror', (e) => errors.push(`player: ${e.message}`));
  await visit(player, 'home', '/', 'Tied for the season lead');
  await visit(player, 'week-final', `/week/${YEAR}/wk01`, 'How this was decided');
  await player
    .getByRole('button', { name: 'By game' })
    .click()
    .catch(() => undefined);
  await player.screenshot({ path: `${SHOTS}/week-final-by-game.png`, fullPage: true });
  await visit(player, 'week-locked', `/week/${YEAR}/wk02`, 'games decided');
  await visit(player, 'week-open-hidden', `/week/${YEAR}/wk03`, 'Picks are hidden');
  await visit(player, 'standings', '/standings', 'Season standings');
  await visit(player, 'player', '/player/dale', 'Weeks won');
  await visit(player, 'sheet', `/sheet/${YEAR}/wk03`, 'Tiebreaker:');
  await player
    .getByRole('button', { name: 'Large print' })
    .click()
    .catch(() => undefined);
  await player.screenshot({ path: `${SHOTS}/sheet-large.png`, fullPage: true });
  await visit(player, 'sheet-results', `/sheet/${YEAR}/wk01/results`, 'Dale D.');
  await visit(player, 'history', '/history', /No weeks yet|weeks? played/);
  await visit(player, 'claim', '/claim', 'First, save your account');
  await visit(player, 'account', '/account', 'Continue with Google');
  await visit(player, 'entry-form', `/picks/${YEAR}/wk03`, '0 of 15 picked');
  await playerCtx.close();

  // ---- 4. The commissioner ----
  const adminCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const admin = await adminCtx.newPage();
  admin.on('pageerror', (e) => errors.push(`admin: ${e.message}`));
  await admin.goto(`${APP}/admin`);
  await admin.getByLabel('Email').fill(ADMIN_EMAIL);
  await admin.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await admin.getByText('Check your email').waitFor();
  const { oobCodes } = await (
    await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)
  ).json();
  const oob = oobCodes.filter((c: { email: string }) => c.email === ADMIN_EMAIL).pop();
  await admin.goto(
    `${APP}/auth/finish?next=%2Fadmin&apiKey=demo-api-key&oobCode=${oob.oobCode}&mode=signIn&lang=en`,
  );
  await admin.getByRole('link', { name: 'Continue' }).waitFor();
  const users = await (
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUserInfo: true }),
    })
  ).json();
  const uid = users.userInfo.find((u: { email?: string }) => u.email === ADMIN_EMAIL).localId;
  execSync(`npm run -s admin:claim -- ${uid}`, {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', GCLOUD_PROJECT: PROJECT },
    stdio: 'pipe',
  });
  await admin.getByRole('link', { name: 'Continue' }).click();
  await admin.getByRole('button', { name: 'Check again' }).click();
  await admin.getByRole('heading', { name: 'Payments' }).waitFor();

  await visit(admin, 'admin-payments', '/admin?week=wk03', 'Text about payment');
  const nudge = await admin
    .getByRole('link', { name: /Text .* about payment/ })
    .first()
    .getAttribute('href')
    .catch(() => null);
  check(
    'payment nudge opens the text app with the message',
    Boolean(nudge?.startsWith('sms:+13155550199?&body=Hi%20Jen')),
    nudge?.slice(0, 60) ?? 'no link',
  );
  await visit(admin, 'admin-roster', '/admin/roster?week=wk03', 'Text a reminder');
  const remind = await admin
    .getByRole('link', { name: /Text a reminder to Rosalie/ })
    .getAttribute('href')
    .catch(() => null);
  check(
    'roster reminder opens the text app with the message',
    Boolean(remind?.startsWith('sms:+16135550144?&body=Hi%20Rosalie')),
    remind?.slice(0, 60) ?? 'no link',
  );
  await visit(admin, 'admin-enter', '/admin/enter/rosalie?week=wk03', 'The sheet, top to bottom');
  await visit(admin, 'admin-claims', '/admin/claims', 'No requests waiting');
  await visit(admin, 'admin-results-final', '/admin/results?week=wk01', 'Correct a result');
  await admin
    .getByRole('button', { name: 'Correct a result' })
    .click()
    .catch(() => undefined);
  await admin
    .getByText("You're correcting a published week")
    .waitFor({ timeout: 5000 })
    .catch(() => undefined);
  await admin.screenshot({ path: `${SHOTS}/admin-results-correcting.png`, fullPage: true });
  await visit(
    admin,
    'admin-results-locked',
    '/admin/results?week=wk02',
    'Review and publish winner',
  );
  await visit(admin, 'admin-reports', '/admin/reports', 'Download weeks (CSV)');
  await visit(admin, 'admin-weeks', '/admin/weeks', 'weeks');
  await adminCtx.close();

  check('no script errors on any screen', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('smoke run', false, (err as Error).message.split('\n')[0]);
} finally {
  await browser.close();
  preview.kill();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
console.log(`Screenshots: ${SHOTS}/`);
process.exit(failures ? 1 : 0);
