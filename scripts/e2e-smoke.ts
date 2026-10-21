/**
 * A quick look at the screens in a real browser at 375px (D-082). It is small on purpose: it seeds
 * a season straight into the emulators, serves the built site, and opens two pages at most, so it
 * fits in a Codespace and finishes in a couple of minutes. For every screen it checks that the
 * expected words appear, that nothing scrolls sideways, and that no script error was thrown, and it
 * saves a screenshot to test-results/smoke/ to look at.
 *
 *   npm run test:smoke      (PW_CHROMIUM_PATH=... to use a preinstalled Chromium)
 *
 * GUIDE_SHOTS=1 (npm run guide:shots, D-136) also saves the screens the in-app guide names in its
 * pages' `screens:` lists, as WebP in public/guide/shots/, for the guide to show.
 *
 * It does not replace the rules and function tests, which check that things are right. This checks
 * that the screens load and fit.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { setCode, setConfig } from '../functions/src/bingo/members';
import { startCycle } from '../functions/src/bingo/cycle';

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

// The guide's screenshots (D-136): only the names some guide page lists, so the repo holds no extras.
const GUIDE_DIR = 'public/guide/shots';
const GUIDE_PAGES = 'src/features/help/pages';
const guideWanted = process.env.GUIDE_SHOTS
  ? new Set(
      readdirSync(GUIDE_PAGES, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.mdx'))
        .flatMap((f) => {
          const list = /^screens:\s*\[(.*)\]/m.exec(readFileSync(`${GUIDE_PAGES}/${f}`, 'utf8'));
          return list ? list[1].split(',').map((n) => n.trim()) : [];
        }),
    )
  : null;
const guideSaved = new Set<string>();
if (guideWanted) mkdirSync(GUIDE_DIR, { recursive: true });

/** In guide mode, save what the phone shows now (one screen high) as WebP, encoded by Chromium. */
async function guideShot(page: Page, name: string) {
  if (!guideWanted?.has(name)) return;
  const png = (await page.screenshot()).toString('base64');
  const webp = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.8);
  }, png);
  writeFileSync(`${GUIDE_DIR}/${name}.webp`, Buffer.from(webp.split(',')[1], 'base64'));
  guideSaved.add(name);
}

let failures = 0;
const errors: string[] = [];
const SMOKE_ONLY = process.env.SMOKE_ONLY;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}

/** Open a screen, wait for its words, and check it fits a phone. */
async function visit(page: Page, name: string, path: string, expected: string | RegExp) {
  await page.goto(`${APP}${path}`).catch(() => undefined);
  await checkScreen(page, name, expected);
}

/** The checks behind visit(), for a screen already open (after choosing a file, say). */
async function checkScreen(page: Page, name: string, expected: string | RegExp) {
  try {
    // Visible matches only: the closed menu drawer holds links with the same words as some headings.
    await page.getByText(expected).locator('visible=true').first().waitFor({ timeout: 15_000 });
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
    await guideShot(page, name);
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
// Dale is in and paid before the lock (D-139); he signs in with email below.
await seedEntry(db, 'dale', { name: 'Dale D.', wins: 8, payment: 'paid', weekId: 'wk03' });
// A post on week 2's board, for the earlier boards under week 3's.
await db.doc(`seasons/${YEAR}/weeks/wk02/board/smoke1`).set({
  playerId: 'jen',
  displayName: 'Jen K.',
  text: 'Told you the Jags would cover.',
  createdAt: Timestamp.now(),
  hidden: false,
});
for (const id of ['rosalie']) await db.doc(`players/${id}`).update(roster);
await db.doc('players/jen').update({ phone: '+13155550199' });
await recomputeStandings(db, YEAR, async (uids) => new Set(uids));
await recomputeAllTime(db);
// Tunas 649 Bingo: set up and a game open, but switched off (D-128).
const BINGO_CONFIG = {
  enabled: false,
  priceCents: 1000,
  operatorPct: 40,
  cutoff: { weekday: 3, time: '18:00', tz: 'America/Toronto' },
  maxCardsPerPlayer: 5,
  maxWeeks: 26,
  joinWindowDraws: 1,
};
await setConfig(db, { actorUid: 'smoke', config: BINGO_CONFIG, now: new Date() });
await setCode(db, { actorUid: 'smoke', code: 'SMOKE-6492-BINGO', now: new Date() });
await startCycle(db, { actorUid: 'smoke', test: true, now: new Date() });
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
  // The weekly board (D-102) sits under the hidden picks before the lock; this guest has no entry.
  await checkScreen(player, 'week-open-board', /The board is for this week's players/);
  await player.goto(`${APP}/week/${YEAR}/wk02`).catch(() => undefined);
  await player
    .getByRole('button', { name: 'Board' })
    .click()
    .catch(() => undefined);
  await checkScreen(player, 'week-locked-board', 'House rules');
  await visit(player, 'standings', '/standings', 'Season standings');
  await visit(player, 'hall-of-fame', '/hall-of-fame', 'Most weekly wins');
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
  // The guide (D-136): the list of pages, a page with a screenshot, and no bingo pages for a guest.
  await visit(player, 'help', '/help', 'Playing the pool');
  await visit(player, 'help-page', '/help/make-your-picks', 'The tiebreaker');
  await visit(player, 'help-bingo-hidden', '/help/bingo-how-to-play', 'Page not found');
  // Bingo is off: to a guest it's an ordinary missing page (D-128).
  await visit(player, 'bingo-off', '/b', 'Page not found');
  await player.goto(`${APP}/`);
  await player.getByRole('button', { name: 'Menu' }).click();
  check(
    'a guest sees no bingo in the menu',
    (await player.getByRole('link', { name: /bingo/i }).count()) === 0,
  );
  await playerCtx.close();

  // ---- 3b. A paid player before the lock (D-139): who's in, the games, and the boards ----
  const paidCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const dale = await paidCtx.newPage();
  dale.on('pageerror', (e) => errors.push(`dale: ${e.message}`));
  const DALE_EMAIL = 'dale@tunas.test';
  await dale.goto(`${APP}/account`);
  await dale.getByLabel('Email').fill(DALE_EMAIL);
  await dale.getByRole('button', { name: 'Email me a link' }).click();
  await dale.getByText('Check your email').waitFor();
  const daleOob = (
    await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()
  ).oobCodes
    .filter((c: { email: string }) => c.email === DALE_EMAIL)
    .pop();
  await dale.goto(
    `${APP}/auth/finish?next=%2F&apiKey=demo-api-key&oobCode=${daleOob.oobCode}&mode=signIn&lang=en`,
  );
  await dale.getByRole('link', { name: 'Continue' }).waitFor();
  const daleUid = (
    await (
      await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUserInfo: true }),
      })
    ).json()
  ).userInfo.find((u: { email?: string }) => u.email === DALE_EMAIL).localId;
  // His login linked to his profile, as an approved claim would leave it.
  await db.doc('players/dale').update({ claimedByUid: daleUid, email: DALE_EMAIL });
  await visit(dale, 'home-paid-open', '/', "Who's in and the board");
  await visit(dale, 'week-open-paid', `/week/${YEAR}/wk03`, "Who's in so far");
  await dale.getByRole('button', { name: 'By game' }).click();
  await checkScreen(dale, 'week-open-paid-by-game', 'Who picked what shows here once picks lock.');
  await dale.getByRole('button', { name: /Board/ }).click();
  await dale.getByRole('button', { name: 'Week 2 board' }).click();
  await checkScreen(dale, 'week-open-paid-board', 'Told you the Jags would cover.');
  await paidCtx.close();

  // SMOKE_ONLY=bingo skips the commissioner and the counter, for when the Codespace runs short of
  // memory partway through ("Target crashed").
  if (!SMOKE_ONLY) {
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
      env: {
        ...process.env,
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        GCLOUD_PROJECT: PROJECT,
      },
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
    // Import picks from a spreadsheet (D-096): Jen is already in and is kept, a new name is added.
    await visit(admin, 'admin-import', '/admin/import?week=wk03', 'Spreadsheet (CSV file)');
    {
      const wk03 = (await db.doc(`seasons/${YEAR}/weeks/wk03`).get()).data()!;
      const games = (wk03.games as { id: string; away: string; home: string }[]).sort((a, b) =>
        a.id === 'mnf' ? 1 : b.id === 'mnf' ? -1 : a.id.localeCompare(b.id),
      );
      const csv = [
        [
          'Participant',
          ...games.map((g) => (g.id === 'mnf' ? 'MNF' : `G${Number(g.id.slice(1))}`)),
          'TB Pts',
        ],
        ['Matchup', ...games.map((g) => `${g.away} at ${g.home}`), 'Total'],
        ['Jen K.', ...games.map((g) => g.away), '41'],
        ['Walk In Sample', ...games.map((g) => g.home), '38'],
        [],
        ['Entry Fee', '$20'],
      ]
        .map((r) => r.join(','))
        .join('\n');
      await admin
        .getByLabel('Spreadsheet (CSV file)')
        .setInputFiles({ name: 'week3.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await checkScreen(admin, 'admin-import-preview', '1 to import');
      await admin.getByRole('button', { name: 'Import 1 entry' }).click();
      const imported = await admin
        .getByText('1 of 1 imported')
        .waitFor({ timeout: 45_000 })
        .then(() => '')
        .catch((err: unknown) => String(err).replace(/\s+/g, ' ').slice(0, 220));
      await admin.screenshot({ path: `${SHOTS}/admin-import-done.png`, fullPage: true });
      check('import saves the new line and keeps the entry already in', imported === '', imported);
    }
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
    await visit(admin, 'admin-help', '/admin/help', 'Running the pool');
    await visit(admin, 'admin-help-page', '/admin/help/payments', 'The Payments screen');
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
    const counterOob = counterCodes
      .filter((c: { email: string }) => c.email === COUNTER_EMAIL)
      .pop();
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
      env: {
        ...process.env,
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        GCLOUD_PROJECT: PROJECT,
      },
      stdio: 'pipe',
    });
    await counter.getByRole('link', { name: 'Continue' }).click();
    await counter.getByRole('button', { name: 'Check again' }).click();
    await counter.getByRole('heading', { name: 'Counter' }).waitFor();

    await visit(counter, 'counter-home', '/counter', 'Find a player');
    await counter.getByText('Jen K.').first().waitFor({ timeout: 45_000 }); // the roster arrives after the page
    await counter.screenshot({ path: `${SHOTS}/counter-home-loaded.png`, fullPage: true });
    await guideShot(counter, 'counter-home-loaded');
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
      walt.size === 1 &&
        walt.docs[0].get('origin') === 'admin' &&
        walt.docs[0].get('phone') === null,
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
    await visit(counter, 'counter-help', '/counter/help', 'At the counter');
    await counterCtx.close();
  }

  // ---- 6. A bingo member: joins with the code, adds a card (BINGO_PLAN S14) ----
  await setConfig(db, {
    actorUid: 'smoke',
    config: { ...BINGO_CONFIG, enabled: true },
    now: new Date(),
  });
  const bingoCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const member = await bingoCtx.newPage();
  member.on('pageerror', (e) => errors.push(`bingo: ${e.message}`));
  const MEMBER_EMAIL = 'kayla@tunas.test';
  await member.goto(`${APP}/account`);
  await member.getByLabel('Email').fill(MEMBER_EMAIL);
  await member.getByRole('button', { name: 'Email me a link' }).click();
  await member.getByText('Check your email').waitFor();
  const memberOob = (
    await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()
  ).oobCodes
    .filter((c: { email: string }) => c.email === MEMBER_EMAIL)
    .pop();
  await member.goto(
    `${APP}/auth/finish?next=%2Fb&apiKey=demo-api-key&oobCode=${memberOob.oobCode}&mode=signIn&lang=en`,
  );
  await member.getByRole('link', { name: 'Continue' }).waitFor();
  await visit(member, 'bingo-join', '/b', 'Join with your code');
  await member.getByLabel('Your name').fill('Kayla S.');
  await member.getByLabel("I'm 18 or older").check();
  await member.getByLabel(/Invite code/).fill('smoke 6492 bingo');
  await member.getByRole('button', { name: 'Join bingo' }).click();
  await member.getByText("You don't have a card yet.").waitFor({ timeout: 45_000 });
  await member.getByRole('button', { name: 'Quick pick' }).click();
  await member.getByRole('heading', { name: 'Card 1' }).waitFor({ timeout: 45_000 });
  const cards = await db.collection('bingoCards').get();
  check(
    'a member joins with the code and adds a card',
    cards.size === 1 && cards.docs[0].get('source') === 'web',
  );
  await visit(member, 'bingo-cards', '/b/cards', 'Nothing crossed off yet.');
  // Members find bingo in the menu (D-135); nobody else does (the guest's home above has no link).
  await member.getByRole('button', { name: 'Menu' }).click();
  check(
    'a member finds Tunas 649 Bingo in the menu',
    await member
      .getByRole('link', { name: 'Tunas 649 Bingo' })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false),
  );
  await member.getByRole('button', { name: 'Close menu' }).click();
  await visit(member, 'bingo-board', '/b/board', 'The pot');
  await visit(member, 'bingo-history', '/b/history', 'No games finished yet.');
  await visit(member, 'bingo-rules', '/b/rules', 'A card is $10 a draw.');
  await bingoCtx.close();

  // ---- 7. Bingo staff (BINGO_PLAN S15): a draw needs Wednesday night, and a browser can't move
  // the clock, so the game above is closed here and a new one started 8 days ago, its first draw
  // already past its cutoff. Then the commissioner and Devon work it through the screens.
  const open = await db.collection('bingoCycles').where('status', '==', 'open').get();
  for (const d of open.docs)
    await d.ref.update({ status: 'won', closedAt: Timestamp.now(), winners: [] });
  const past = await startCycle(db, {
    actorUid: 'smoke',
    test: true,
    now: new Date(Date.now() - 8 * 24 * 3_600_000),
  });
  const signInStaff = async (email: string, role: 'admin' | 'counter', next: string) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${role}: ${e.message}`));
    await page.goto(`${APP}${next}`);
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await page.getByText('Check your email').waitFor();
    const code = (
      await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()
    ).oobCodes
      .filter((c: { email: string }) => c.email === email)
      .pop();
    await page.goto(
      `${APP}/auth/finish?next=${encodeURIComponent(next)}&apiKey=demo-api-key&oobCode=${code.oobCode}&mode=signIn&lang=en`,
    );
    await page.getByRole('link', { name: 'Continue' }).waitFor();
    const found = await (
      await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUserInfo: true }),
      })
    ).json();
    const staffUid = found.userInfo.find((u: { email?: string }) => u.email === email).localId;
    execSync(`npm run -s admin:claim -- ${staffUid}${role === 'counter' ? ' counter' : ''}`, {
      env: {
        ...process.env,
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        GCLOUD_PROJECT: PROJECT,
      },
      stdio: 'pipe',
    });
    await page.getByRole('link', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Check again' }).click();
    // Wait for the refreshed token: the "isn't an admin account" notice goes away.
    await page.getByText(/which isn't an? /).waitFor({ state: 'detached', timeout: 30_000 });
    return { ctx, page, uid: staffUid };
  };

  const boss = await signInStaff('ryan.bingo@tunas.test', 'admin', '/admin/bingo');
  // A fresh tab now and then, same sign-in: one long-lived tab runs this Codespace out of memory
  // ("Target crashed"), as the full run's commissioner section does.
  const freshTab = async (staff: { ctx: typeof boss.ctx; page: typeof boss.page }, who: string) => {
    const page = await staff.ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    await staff.page.close();
    staff.page = page;
  };
  await visit(boss.page, 'bingo-staff-members', '/admin/bingo/members', 'Add a member on paper');
  await boss.page.getByLabel('Who').selectOption({ label: 'Rosalie M.' });
  await boss.page.getByLabel("I checked they're 18 or older, in person").check();
  await boss.page.getByRole('button', { name: 'Add to bingo' }).click();
  await boss.page.getByText('Added.').waitFor({ timeout: 45_000 });
  check(
    'a paper member is added through the screen',
    (await db.doc('bingoMembers/rosalie').get()).get('paper') === true,
  );
  await freshTab(boss, 'admin');
  await visit(boss.page, 'bingo-staff-settings', '/admin/bingo/settings', 'Invite code');
  await visit(boss.page, 'bingo-staff-totals', '/admin/bingo/totals', 'Totals only, never names');
  await boss.page.close();

  const devon = await signInStaff('devon.bingo@tunas.test', 'counter', '/counter/bingo');
  await visit(
    devon.page,
    'bingo-counter-payments',
    '/counter/bingo/payments',
    /cards? paid for this draw/,
  );
  check(
    'the counter is offered cash only',
    (await devon.page.getByRole('button', { name: /paid by e-Transfer/ }).count()) === 0 &&
      (await devon.page.getByRole('button', { name: /Undo paid for Kayla/ }).count()) === 0,
  );
  await visit(devon.page, 'bingo-counter-draw', '/counter/bingo/draw', /draw/);
  check(
    'the counter cannot skip or correct a draw',
    (await devon.page.getByText(/cancelled or postponed|Correct this draw/).count()) === 0,
  );
  await devon.ctx.close();

  // Last, the commissioner takes money after the cutoff and works the draw, in a new tab.
  await freshTab(boss, 'admin');
  await visit(
    boss.page,
    'bingo-staff-payments',
    '/admin/bingo/payments',
    /cards? paid for this draw/,
  );
  // After the cutoff, money taken now counts for next week, with a reason.
  await boss.page.getByLabel(/After 6 PM/).fill('Came in after six');
  await boss.page.getByRole('button', { name: /Kayla S\., Card, paid by e-Transfer/ }).click();
  await boss.page
    .getByText('Not paid for this draw. Paid late for the next one.')
    .waitFor({ timeout: 45_000 });
  await freshTab(boss, 'admin');
  await visit(boss.page, 'bingo-staff-draw', '/admin/bingo/draw', /Type in the .* numbers/);
  await boss.page.getByLabel('The six numbers').fill('4 5 6 33 34 35');
  await boss.page.getByRole('button', { name: 'Save the numbers' }).click();
  await boss.page
    .getByRole('button', { name: 'Approve these numbers' })
    .waitFor({ timeout: 45_000 });
  await checkScreen(boss.page, 'bingo-staff-draw-waiting', 'is waiting for approval');
  await boss.page.getByRole('button', { name: 'Approve these numbers' }).click();
  await boss.page.getByText('Approved. Cards are updated.').waitFor({ timeout: 45_000 });
  const approved = (await db.doc(`bingoCycles/${past.cycleId}/draws/${past.cycleId}`).get()).data();
  check(
    'the commissioner types and approves a draw through the screens',
    approved?.status === 'approved' && approved.numbers.join(' ') === '4 5 6 33 34 35',
  );
  await boss.ctx.close();

  // A SMOKE_ONLY run skips screens, so it takes only some; the shots already saved stay.
  if (guideWanted && !SMOKE_ONLY) {
    const notTaken = [...guideWanted].filter((name) => !guideSaved.has(name));
    check('every screen the guide names was saved', notTaken.length === 0, notTaken.join(', '));
  }
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
