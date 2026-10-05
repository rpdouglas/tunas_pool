/**
 * Sprint 4 end to end against the emulators, at 375px: the commissioner adds roster players, copies
 * a full paper sheet (with a photo, paid in cash), keeps a half-entered sheet through a reload,
 * saves a sheet with blanks, edits and removes entries, deactivates a player, and after the lock
 * adds a late entry that needs a reason. Every write is checked in Firestore and the audit log.
 *
 * Needs the Auth, Firestore, Functions, and Storage emulators and the dev server:
 *   1. npm --prefix functions run build
 *   2. npx firebase emulators:start --only auth,firestore,functions,storage --project demo-tunas-pool
 *   3. VITE_USE_EMULATORS=true npx vite --port 5173
 *   4. npm run test:e2e:paper-entry      (PW_CHROMIUM_PATH=... to use a preinstalled Chromium)
 *
 * It clears the emulators' Auth and Firestore data first.
 */
import { execSync } from 'node:child_process';
import {
  APP,
  FULL_WEEK,
  check,
  failNow,
  finish,
  finishUrl,
  getDoc,
  launch,
  listDocs,
  oobFor,
  resetEmulators,
  shotsDir,
  uidForEmail,
} from './lib/e2e.mjs';

const SHOTS = shotsDir('e2e-paper-entry');
const WEEK = 'seasons/2026/weeks/wk01';
// A 1x1 PNG, standing in for a phone photo of the sheet.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

await resetEmulators();
const { browser, consoleErrors, lastPage, newPage } = await launch();

const field = (doc, name) => doc?.fields?.[name];
const text = (doc, name) => field(doc, name)?.stringValue;
const audit = async (action) =>
  (await listDocs('auditLog')).filter((d) => text(d, 'action') === action);
const noSideScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** The roster profile with this name, from Firestore. */
async function playerNamed(name) {
  return (await listDocs('players')).find((d) => text(d, 'displayName') === name);
}
const idOf = (doc) => doc.name.split('/').pop();

let admin = null;
try {
  // ---- A. Commissioner signs in and opens week 1 --------------------------------------
  admin = await newPage();
  await admin.goto(`${APP}/admin`);
  await admin.getByLabel('Email').fill('ryan@tunas.test');
  await admin.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await admin.getByText('Check your email').waitFor();
  await admin.goto(finishUrl(await oobFor('ryan@tunas.test'), '/admin'));
  await admin.getByText("You're signed in.").waitFor();
  const adminUid = await uidForEmail('ryan@tunas.test');
  execSync(`npm run -s admin:claim -- ${adminUid}`, {
    env: {
      ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      GCLOUD_PROJECT: 'demo-tunas-pool',
    },
    stdio: 'pipe',
  });
  await admin.getByRole('link', { name: 'Continue' }).click();
  await admin.getByRole('button', { name: 'Check again' }).click();
  await admin.getByRole('heading', { name: 'Payments' }).waitFor();

  await admin.getByRole('link', { name: 'Roster' }).click();
  await admin.getByRole('heading', { name: 'Roster' }).waitFor();
  check(
    'A1 the roster works before any week exists, and says there is nothing to enter yet',
    (await admin.getByText('No week is open yet').count()) === 1 &&
      (await admin.getByText('Nobody is on the roster yet').count()) === 1,
  );

  await admin.goto(`${APP}/admin/weeks`);
  await admin.getByRole('link', { name: 'Set up week 1' }).click();
  await admin.getByLabel('Matchups').fill(FULL_WEEK);
  await admin.getByRole('button', { name: 'Save draft' }).click();
  await admin.waitForURL('**/admin/weeks/2026/wk01');
  await admin.getByRole('button', { name: 'Open week' }).click();
  await admin.getByText('Week opened.').waitFor();

  // ---- B. Roster: add players ------------------------------------------------------------
  await admin.getByRole('link', { name: 'Roster' }).click();
  await admin.getByRole('heading', { name: 'Roster' }).waitFor();

  await admin.getByRole('button', { name: 'Add a player' }).click();
  await admin.getByRole('button', { name: 'Add player' }).click();
  check(
    'B1 a player needs a name, said in plain words',
    (await admin.getByText('Enter the name to show on the leaderboard').count()) === 1,
  );
  await admin.getByLabel('Name', { exact: true }).fill('Rosalie M.');
  await admin.getByLabel('Phone (optional)').fill('555');
  await admin.getByRole('button', { name: 'Add player' }).click();
  check(
    'B2 a bad phone number is explained, not silently dropped',
    (await admin.getByText('Enter a 10-digit phone number').count()) === 1,
  );
  await admin.getByLabel('Phone (optional)').fill('(613) 555-0144');
  await admin.locator('label.pick', { hasText: 'Cash' }).click();
  await admin.getByLabel('Note (optional)').fill('Large-print sheet');
  await admin.getByRole('button', { name: 'Add player' }).click();
  await admin.getByText('Rosalie M. added to the roster').waitFor();
  const rosalieDoc = await playerNamed('Rosalie M.');
  const rosalie = idOf(rosalieDoc);
  check(
    'B3 a roster player is saved with no login, no email, and a normalized phone',
    text(rosalieDoc, 'origin') === 'admin' &&
      'nullValue' in field(rosalieDoc, 'claimedByUid') &&
      'nullValue' in field(rosalieDoc, 'email') &&
      text(rosalieDoc, 'phone') === '+16135550144' &&
      text(rosalieDoc, 'usualPayment') === 'cash' &&
      rosalie !== adminUid,
    `id ${rosalie}`,
  );
  await admin.getByRole('list', { name: 'Players' }).getByText('Not yet').waitFor();
  check(
    'B4 the new player shows as "Not yet" for this week, with an Enter picks button',
    (await admin.getByRole('list', { name: 'Players' }).getByText('Not yet').count()) === 1 &&
      (await admin.getByRole('link', { name: 'Enter picks for Rosalie M.' }).count()) === 1,
  );

  await admin.getByRole('button', { name: 'Add a player' }).click();
  await admin.getByLabel('Name', { exact: true }).fill('Rose M');
  await admin.getByLabel('Phone (optional)').fill('613-555-0144');
  await admin.getByText('might be the same person as Rosalie M.').waitFor();
  check('B5 a possible double is pointed out before saving, in neutral words', true);
  await admin.getByRole('button', { name: 'Cancel' }).click();

  for (const name of ['Bernie T.', 'Hank O.']) {
    await admin.getByRole('button', { name: 'Add a player' }).click();
    await admin.getByLabel('Name', { exact: true }).fill(name);
    await admin.getByRole('button', { name: 'Add player' }).click();
    await admin.getByText(`${name} added to the roster`).waitFor();
  }
  const bernie = idOf(await playerNamed('Bernie T.'));
  const hank = idOf(await playerNamed('Hank O.'));
  await admin.getByLabel('Find a player').fill('rosa');
  check(
    'B6 search narrows the roster by part of a name',
    (await admin.getByRole('list', { name: 'Players' }).getByRole('listitem').count()) === 1,
  );
  await admin.getByLabel('Find a player').fill('');
  check('B7 the roster has no sideways scroll at 375px', await noSideScroll(admin));
  await admin.screenshot({ path: `${SHOTS}/roster.png`, fullPage: true });

  // ---- C. Copy a full paper sheet, with a photo, paid in cash -----------------------------
  await admin.getByRole('link', { name: 'Enter picks for Rosalie M.' }).click();
  await admin.getByRole('heading', { name: /Rosalie M\./ }).waitFor();
  await admin.getByText('0 of 15 picked').waitFor();
  const started = Date.now();
  const numbers = await admin
    .locator('li[id^="game-"] [role="group"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(
    'C1 the games are numbered 1 to 15 in the sheet order, Monday night last',
    numbers.length === 15 &&
      numbers[0] === 'Game 1: Jaguars at Rams' &&
      numbers[14] === 'Game 15: Chiefs at Chargers',
    numbers[0],
  );
  const ids = await admin.locator('li[id^="game-"]').evaluateAll((els) => els.map((e) => e.id));
  for (const id of ids) await admin.locator(`#${id} button.pick`).nth(1).click(); // home, all the way down
  await admin.getByLabel('Tiebreaker: total points Monday night').fill('41');
  await admin.locator('label.pick', { hasText: 'Paid cash' }).click();
  await admin.locator('input[type="file"]').setInputFiles({
    name: 'sheet.png',
    mimeType: 'image/png',
    buffer: PHOTO,
  });
  await admin.getByText('Photo ready to save').waitFor();
  check('C2 the entry screen has no sideways scroll at 375px', await noSideScroll(admin));
  await admin.screenshot({ path: `${SHOTS}/entering.png`, fullPage: true });
  await admin.getByRole('button', { name: 'Save picks' }).click();
  await admin.getByText('Rosalie M.: picks saved, marked paid').waitFor();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  check(
    'C3 a full sheet is copied and marked paid in one save',
    true,
    `${seconds}s, 15 taps + 1 field + 1 payment tap + 1 photo`,
  );

  const base = `${WEEK}/entries/${rosalie}`;
  const entry = await getDoc(base);
  const picks = await getDoc(`${base}/private/picks`);
  const payment = await getDoc(`${base}/payment/current`);
  const photoPath = text(entry, 'paperPhotoPath') ?? '';
  check(
    'C4 the entry is recorded as an admin paper entry under the roster player',
    text(entry, 'enteredBy') === 'admin' &&
      text(entry, 'source') === 'paper' &&
      text(entry, 'displayName') === 'Rosalie M.' &&
      'nullValue' in field(entry, 'lateOverride'),
  );
  check(
    'C5 all 15 picks and the tiebreaker are saved as entered',
    Object.keys(picks?.fields.picks.mapValue.fields ?? {}).length === 15 &&
      picks.fields.picks.mapValue.fields.g01.stringValue === 'home' &&
      picks.fields.tiebreakerTotal.integerValue === '41',
  );
  check(
    'C6 the payment is paid, cash, by this admin',
    text(payment, 'paymentStatus') === 'paid' &&
      text(payment, 'paymentMethod') === 'cash' &&
      text(payment, 'paidBy') === adminUid,
  );
  check(
    "C7 the photo is stored in this week's folder under the player",
    photoPath.startsWith(`paperSheets/2026/wk01/${rosalie}-`),
    photoPath,
  );
  const stored = await fetch(
    `http://127.0.0.1:9199/v0/b/tunaspool-paper-sheets/o/${encodeURIComponent(photoPath)}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  check("C8 the photo is in the pool's own bucket", stored.ok, `HTTP ${stored.status}`);
  const upserts = await audit('entry.adminUpsert');
  check(
    'C9 the entry and the payment are both in the audit log under the admin',
    upserts.length === 1 &&
      text(upserts[0], 'actorUid') === adminUid &&
      (await audit('payment.set')).length === 1,
  );
  await admin.getByRole('heading', { name: 'Roster' }).waitFor();
  const rosalieRow = admin.getByRole('listitem').filter({ hasText: 'Rosalie M.' });
  await rosalieRow.getByText('Entered').waitFor();
  check(
    'C10 back on the roster, she shows Entered, Paid, and Paper',
    (await rosalieRow.getByText('Entered').count()) === 1 &&
      (await rosalieRow.locator('.badge-paid').count()) === 1 &&
      (await rosalieRow.getByText('Paper').count()) === 1,
  );
  const weekDoc = await (async () => {
    for (let i = 0; i < 40; i++) {
      const w = await getDoc(WEEK);
      if (w.fields.entryCount.integerValue === '1' && w.fields.paidCount.integerValue === '1')
        return w;
      await new Promise((r) => setTimeout(r, 250));
    }
    return getDoc(WEEK);
  })();
  check(
    'C11 the week counts one player in and one paid',
    weekDoc.fields.entryCount.integerValue === '1' && weekDoc.fields.paidCount.integerValue === '1',
  );

  // ---- D. A half-entered sheet survives an interruption; blanks stay blank ---------------
  await admin.getByRole('link', { name: 'Enter picks for Bernie T.' }).click();
  await admin.getByText('0 of 15 picked').waitFor();
  for (const id of ids.slice(0, 3)) await admin.locator(`#${id} button.pick`).nth(0).click();
  await admin.reload();
  await admin.getByText('3 of 15 picked').waitFor();
  check('D1 a reload keeps the picks typed so far', true);
  for (const id of ids.slice(3, 13)) await admin.locator(`#${id} button.pick`).nth(0).click();
  await admin.locator('label.pick', { hasText: 'Text' }).click();
  await admin.getByLabel('Tiebreaker: total points Monday night').fill('38');
  check(
    'D2 with two games blank the button says so instead of saving',
    (await admin.getByRole('button', { name: '2 games left' }).count()) === 1,
  );
  await admin.getByLabel(/The sheet left 2 games blank/).check();
  await admin.getByRole('button', { name: 'Save picks' }).click();
  await admin.getByText('Bernie T.: picks saved').waitFor();
  const bernieBase = `${WEEK}/entries/${bernie}`;
  const berniePicks = await getDoc(`${bernieBase}/private/picks`);
  check(
    'D3 a sheet with blanks is saved with the blanks left out, as a text entry, not paid',
    Object.keys(berniePicks.fields.picks.mapValue.fields).length === 13 &&
      text(await getDoc(bernieBase), 'source') === 'text' &&
      (await getDoc(`${bernieBase}/payment/current`)) === null,
  );

  // ---- E. Fix a pick, see it in the queue, remove an entry -------------------------------
  await admin.getByRole('link', { name: 'Edit picks for Rosalie M.' }).click();
  await admin.getByText('already has picks this week').waitFor();
  await admin.getByText('All 15 picked').waitFor();
  check(
    'E1 a paid entry shows as paid and offers no second payment',
    (await admin.getByText('Already marked paid').count()) === 1 &&
      (await admin.getByText('A photo is saved with this entry.').count()) === 1,
  );
  await admin.locator('#game-g01 button.pick').nth(0).click();
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.getByText('Rosalie M.: picks saved, marked paid').waitFor();
  const fixed = await getDoc(`${base}/private/picks`);
  const fixedEntry = await getDoc(base);
  check(
    'E2 the edit replaced the pick, kept the photo and the payment, and is one entry',
    fixed.fields.picks.mapValue.fields.g01.stringValue === 'away' &&
      text(fixedEntry, 'paperPhotoPath') === photoPath &&
      text(await getDoc(`${base}/payment/current`), 'paymentStatus') === 'paid' &&
      (await listDocs(`${WEEK}/entries`)).length === 2,
  );
  const edits = await audit('entry.adminUpsert');
  check(
    'E3 the audit log has the pick before and after',
    edits.some(
      (a) =>
        a.fields.before?.mapValue?.fields?.picks?.mapValue.fields.g01.stringValue === 'home' &&
        a.fields.after.mapValue.fields.picks.mapValue.fields.g01.stringValue === 'away',
    ),
  );

  await admin.getByRole('link', { name: 'Payments' }).click();
  await admin.getByRole('heading', { name: 'Payments' }).waitFor();
  await admin.getByRole('button', { name: /^All/ }).click();
  const queueRow = admin.getByRole('listitem').filter({ hasText: 'Rosalie M.' });
  check(
    'E4 the payments queue shows how the entry came in, with a way to its picks',
    (await queueRow.getByText(/Paper/).count()) === 1 &&
      (await admin.getByRole('link', { name: 'Picks for Rosalie M.' }).count()) === 1,
  );
  check('E5 the payments queue still has no sideways scroll at 375px', await noSideScroll(admin));
  await admin.screenshot({ path: `${SHOTS}/payments.png`, fullPage: true });

  await admin.getByRole('link', { name: 'Picks for Rosalie M.' }).click();
  await admin.getByText('Remove this entry').click();
  check(
    'E6 a paid entry cannot be removed until the payment is undone',
    (await admin.getByText('Undo the payment on the Payments screen first').count()) === 1 &&
      (await admin.getByRole('button', { name: 'Remove entry' }).count()) === 0,
  );
  await admin.getByRole('link', { name: '← Roster' }).click();
  await admin.getByRole('link', { name: 'Edit picks for Bernie T.' }).click();
  await admin.getByText('Remove this entry').click();
  await admin.getByRole('button', { name: 'Remove entry' }).click();
  check(
    'E7 removing an entry needs a typed reason',
    (await admin.getByText('Type a short reason, like "Entered twice by mistake".').count()) ===
      1 && (await getDoc(bernieBase)) !== null,
  );
  await admin.getByLabel('Why is it being removed?').fill('He texted to pull out this week');
  await admin.getByRole('button', { name: 'Remove entry' }).click();
  await admin.getByText('Bernie T.: entry removed').waitFor();
  const removed = await audit('entry.delete');
  check(
    'E8 the entry and its picks are gone, the player stays, and the reason is in the audit log',
    (await getDoc(bernieBase)) === null &&
      (await getDoc(`${bernieBase}/private/picks`)) === null &&
      (await getDoc(`players/${bernie}`)) !== null &&
      removed.length === 1 &&
      text(removed[0], 'reason') === 'He texted to pull out this week',
  );

  // ---- F. Deactivate a player ------------------------------------------------------------
  await admin.getByRole('heading', { name: 'Roster' }).waitFor();
  await admin.getByRole('button', { name: 'Details for Bernie T.' }).click();
  await admin.getByLabel(/Still playing/).uncheck();
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await admin.getByText('Bernie T. saved').waitFor();
  check(
    'F1 an inactive player leaves the main list and keeps their profile',
    (await admin.getByRole('link', { name: /for Bernie T\./ }).count()) === 0 &&
      (await getDoc(`players/${bernie}`)).fields.active.booleanValue === false,
  );
  await admin.getByRole('button', { name: /^Inactive/ }).click();
  check(
    'F2 they are under Inactive, with no way to enter picks until made active again',
    (await admin.getByRole('listitem').filter({ hasText: 'Bernie T.' }).count()) === 1 &&
      (await admin.getByRole('link', { name: /picks for Bernie T\./ }).count()) === 0,
  );
  await admin.goto(`${APP}/admin/enter/${bernie}`);
  await admin.getByText('Bernie T. is marked inactive').waitFor();
  check('F3 the entry screen refuses an inactive player in plain words', true);

  // ---- G. After the lock: a late entry needs a reason and leaves a badge -----------------
  await admin.goto(`${APP}/admin/weeks/2026/wk01`);
  await admin.getByRole('button', { name: 'Lock now' }).click();
  await admin.getByRole('button', { name: 'Yes, lock picks now' }).click();
  await admin.getByText('Picks are locked.').waitFor();
  await admin.getByRole('link', { name: 'Roster' }).click();
  await admin.getByText('After the lock, an entry needs a reason.').waitFor();
  await admin.getByRole('link', { name: 'Late entry for Hank O.' }).click();
  await admin.getByText('This will be saved as a late entry').waitFor();
  for (const id of ids) await admin.locator(`#${id} button.pick`).nth(0).click();
  await admin.getByLabel('Tiebreaker: total points Monday night').fill('50');
  await admin.getByRole('button', { name: 'Save late entry' }).click();
  check(
    'G1 a late entry is not saved without a reason',
    (await admin
      .getByText('Type a short reason, like "Sheet was in the drop box Friday".')
      .count()) === 1 && (await getDoc(`${WEEK}/entries/${hank}`)) === null,
  );
  await admin.screenshot({ path: `${SHOTS}/late-entry.png`, fullPage: true });
  await admin.getByLabel('Why is this entry late?').fill('Sheet was in the drop box Friday');
  await admin.getByRole('button', { name: 'Save late entry' }).click();
  await admin.getByText('Hank O.: late entry saved').waitFor();
  const lateEntry = await getDoc(`${WEEK}/entries/${hank}`);
  const override = field(lateEntry, 'lateOverride')?.mapValue?.fields;
  check(
    'G2 the late entry carries its reason, who allowed it, and when',
    override?.reason.stringValue === 'Sheet was in the drop box Friday' &&
      override?.by.stringValue === adminUid &&
      Boolean(override?.at.timestampValue),
  );
  const lates = await audit('entry.lateOverride');
  check(
    'G3 the audit log has the late entry with its reason',
    lates.length === 1 && text(lates[0], 'reason') === 'Sheet was in the drop box Friday',
  );
  await admin.getByRole('heading', { name: 'Roster' }).waitFor();
  check(
    'G4 the roster shows the Late entry badge',
    (await admin
      .getByRole('listitem')
      .filter({ hasText: 'Hank O.' })
      .getByText('Late entry')
      .count()) === 1,
  );
  await admin.getByRole('link', { name: 'Payments' }).click();
  await admin.getByRole('heading', { name: 'Payments' }).waitFor();
  await admin.getByRole('button', { name: /^All/ }).click();
  check(
    'G5 so does the payments queue',
    (await admin
      .getByRole('listitem')
      .filter({ hasText: 'Hank O.' })
      .getByText('Late entry')
      .count()) === 1,
  );

  // A player's own screens never show another entry's source, photo, or payment.
  const publicFields = Object.keys(lateEntry.fields).sort().join(',');
  check(
    'G6 the public entry holds no picks, phone, or payment',
    !/phone|payment|picks(?!Submitted)|tiebreaker/i.test(publicFields),
    publicFields,
  );

  check('H1 no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (err) {
  failNow(err.message.split('\n').slice(0, 3).join(' '));
  await lastPage()?.screenshot({ path: `${SHOTS}/e2e-failure.png`, fullPage: true });
} finally {
  await browser.close();
}
finish();
