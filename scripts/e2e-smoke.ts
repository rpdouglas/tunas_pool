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
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Page } from '@playwright/test';
import { recomputeAllTime, recomputeStandings } from '../functions/src/season';
import {
  ALL_HOME,
  GAME_IDS,
  YEAR,
  seedEntry,
  seedWeek,
  testDb,
} from '../functions/src/testSupport.int';
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
    // Visible matches only: the closed menu drawer holds links with the same words as some headings.
    await page.getByText(expected).locator('visible=true').first().waitFor({ timeout: 15_000 });
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    check(name, fits, fits ? '' : 'scrolls sideways at 375px');
    // The same accessibility rules as test:a11y (WCAG 2.2 AA), on the real screen with data in it.
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    for (const v of axe.violations) {
      check(
        `${name}: accessibility`,
        false,
        `${v.id}: ${v.help} [${v.nodes.length}] ${v.nodes[0]?.html.slice(0, 110)}`,
      );
    }
    // Large text: the page must still fit when the phone's text size is at the largest setting (Extra large, 125%, DESIGN_SYSTEM §9).
    await page.addStyleTag({ content: 'html { font-size: 125% !important; }' });
    const fitsLarge = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    if (!fitsLarge) {
      // Name the thing that sticks out, so the fix doesn't start with a hunt.
      const culprit = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('body *')].filter(
          (el) => el.getBoundingClientRect().right > limit + 1,
        );
        // The innermost one is the cause; its ancestors are only stretched by it.
        const el = wide.find(
          (candidate) => !wide.some((other) => other !== candidate && candidate.contains(other)),
        );
        return el
          ? `<${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 50)}"> "${(el.textContent ?? '').trim().slice(0, 50)}"`
          : 'unknown';
      });
      check(`${name}: large text`, false, `scrolls sideways with text at 125%: ${culprit}`);
    }
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
  // Someone who has played can't be deleted: the section says why and points to Inactive or Merge (D-094).
  await admin.getByRole('button', { name: /Details for Rosalie/ }).click();
  await admin.getByText('Added by mistake? Delete this player').click();
  const whyNot = await admin
    // Not just "has played": the closed Merge section above has those words too, and it is hidden.
    .getByText(/has played (one week|\d+ weeks)/)
    .first()
    // The first call to a function that has not run yet can take a while to start in the emulator.
    .waitFor({ timeout: 45_000 })
    .then(() => '')
    .catch((err: unknown) => String(err).replace(/\s+/g, ' ').slice(0, 220));
  await admin.screenshot({ path: `${SHOTS}/admin-roster-delete.png`, fullPage: true });
  check('delete explains why not for someone who has played', whyNot === '', whyNot);
  check(
    'and offers no delete button for them',
    (await admin.getByRole('button', { name: /^Delete Rosalie/ }).count()) === 0,
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
  await visit(admin, 'admin-more', '/admin/more', 'Audit log');
  await visit(admin, 'admin-audit', '/admin/audit', 'Published the winner: Dale D.');
  await visit(admin, 'admin-seasons', '/admin/seasons', 'This season');
  // A player added by mistake can be deleted through the screen, with a reason in the audit log (D-094).
  await db.doc('players/typo').set({
    displayName: 'Typo T.',
    phone: null,
    email: null,
    claimedByUid: null,
    origin: 'admin',
    usualPayment: null,
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await admin.goto(`${APP}/admin/roster?week=wk03`);
  await admin.getByRole('button', { name: /Details for Typo T/ }).click();
  await admin.getByText('Added by mistake? Delete this player').click();
  await admin.getByRole('button', { name: 'Delete Typo T.…' }).click();
  await admin.getByLabel('Why are you deleting them?').fill('Added by mistake');
  await admin.getByRole('button', { name: 'Delete Typo T.', exact: true }).click();
  await admin.getByText('Typo T. deleted').first().waitFor({ timeout: 45_000 });
  check(
    'a player with no history is deleted through the screen',
    !(await db.doc('players/typo').get()).exists,
  );
  const deleted = await db.collection('auditLog').where('action', '==', 'player.delete').get();
  check(
    'and the audit log keeps who and why',
    deleted.size === 1 && deleted.docs[0].get('reason') === 'Added by mistake',
  );
  await adminCtx.close();

  // ---- 5. Devon, the counter role (D-095) ----
  const counterCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const counter = await counterCtx.newPage();
  counter.on('pageerror', (e) => errors.push(`counter: ${e.message}`));
  const COUNTER_EMAIL = 'devon@tunas.test';
  await counter.goto(`${APP}/counter`);
  await counter.getByLabel('Email').fill(COUNTER_EMAIL);
  await counter.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await counter.getByText('Check your email').waitFor();
  const counterCodes = (
    await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()
  ).oobCodes;
  const counterOob = counterCodes.filter((c: { email: string }) => c.email === COUNTER_EMAIL).pop();
  await counter.goto(
    `${APP}/auth/finish?next=%2Fcounter&apiKey=demo-api-key&oobCode=${counterOob.oobCode}&mode=signIn&lang=en`,
  );
  await counter.getByRole('link', { name: 'Continue' }).waitFor();
  const counterUsers = await (
    await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUserInfo: true }),
    })
  ).json();
  const counterUid = counterUsers.userInfo.find(
    (u: { email?: string }) => u.email === COUNTER_EMAIL,
  ).localId;
  execSync(`npm run -s admin:claim -- ${counterUid} counter`, {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', GCLOUD_PROJECT: PROJECT },
    stdio: 'pipe',
  });
  await counter.getByRole('link', { name: 'Continue' }).click();
  await counter.getByRole('button', { name: 'Check again' }).click();
  await counter.getByRole('heading', { name: 'Counter' }).waitFor();

  await visit(counter, 'counter-home', '/counter', 'Find a player');
  await counter.getByText('Jen K.').first().waitFor({ timeout: 45_000 }); // the roster arrives after the page
  await counter.screenshot({ path: `${SHOTS}/counter-home-loaded.png`, fullPage: true });
  const counterText = (await counter.locator('main').innerText()).replace(/\s+/g, ' ');
  check(
    'the counter list shows names and status, and no phone number',
    counterText.includes('Jen K.') && !/315-555|315555|613-555|\+1\d{10}/.test(counterText),
  );

  // Take cash for Jen, who said she would e-Transfer.
  await counter.getByRole('button', { name: 'Paid cash: Jen K.' }).click();
  await counter.getByRole('button', { name: 'Undo cash: Jen K.' }).waitFor({ timeout: 45_000 });
  const jenPay = (
    await db.doc(`seasons/${YEAR}/weeks/wk03/entries/jen/payment/current`).get()
  ).data();
  check(
    'cash received is saved as cash, under Devon',
    jenPay?.paymentStatus === 'paid' &&
      jenPay?.paymentMethod === 'cash' &&
      jenPay?.paidBy === counterUid,
  );

  // Add a walk-in.
  await counter.getByRole('button', { name: 'Add a player' }).click();
  await counter.getByLabel('Name', { exact: true }).fill('Walt W.');
  await counter.getByRole('button', { name: 'Add player' }).click();
  await counter.getByText('Walt W.').first().waitFor({ timeout: 45_000 });
  const walt = await db.collection('players').where('displayName', '==', 'Walt W.').get();
  check(
    'a walk-in is added to the roster with only a name',
    walt.size === 1 && walt.docs[0].get('origin') === 'admin' && walt.docs[0].get('phone') === null,
  );

  // Enter a sheet for Rosalie, in paper order, and take her cash.
  await visit(counter, 'counter-enter', '/counter/enter/rosalie', 'Entering for');
  for (const id of GAME_IDS) await counter.locator(`#game-${id} button.pick`).nth(0).click();
  await counter.getByLabel(/Tiebreaker/).fill('45');
  check(
    'the counter is not offered e-Transfer as a way it was paid',
    (await counter.locator('label.pick', { hasText: 'Paid e-Transfer' }).count()) === 0,
  );
  await counter.locator('label.pick', { hasText: 'Paid cash' }).click();
  await counter.getByRole('button', { name: 'Save picks' }).click();
  await counter.getByRole('heading', { name: 'Counter' }).waitFor({ timeout: 45_000 });
  const rosalieEntry = await db.doc(`seasons/${YEAR}/weeks/wk03/entries/rosalie`).get();
  const rosaliePay = (
    await db.doc(`seasons/${YEAR}/weeks/wk03/entries/rosalie/payment/current`).get()
  ).data();
  check(
    'a sheet entered at the counter is saved, marked paid cash',
    rosalieEntry.exists &&
      rosaliePay?.paymentStatus === 'paid' &&
      rosaliePay?.paymentMethod === 'cash',
  );

  // Someone already in: the screen says who to ask, before anything is typed.
  await counter.goto(`${APP}/counter/enter/jen`);
  const asked = await counter
    .getByText(/sheet is already in.*ask the commissioner/i)
    .first()
    .waitFor({ timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  check('a sheet that is already in says "Ask the commissioner"', asked);

  // The audit log has Devon's work under his name.
  const devonLogs = await db.collection('auditLog').where('actorUid', '==', counterUid).get();
  check(
    'everything the counter did is in the audit log under the counter role',
    devonLogs.size >= 4 &&
      devonLogs.docs.every(
        (d) => d.get('actorRole') === 'counter' && d.get('actorEmail') === COUNTER_EMAIL,
      ),
    `${devonLogs.size} entries`,
  );

  // The Back Office is not his.
  await counter.goto(`${APP}/admin`);
  const blocked = await counter
    .getByText(/isn't an admin account/)
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check('the counter is kept out of the Back Office', blocked);
  await counterCtx.close();

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
