/**
 * The Phase 1 gate (PROJECT_PLAN Sprint 3): a full mock week at 375px with 12 mixed players.
 * Players enter through the real form. The commissioner confirms payments (one tap, with undo),
 * locks, enters results, publishes the winner, and records the payout, all through the real screens.
 * The expected winner is worked out here by separate, plain code, then compared with what the app
 * published.
 *
 * Needs the Auth, Firestore, and Functions emulators (the Firestore triggers fill in the week's
 * counts and each entry's record) and the dev server. See scripts/e2e-emulator.mjs for how to start
 * them. It clears the emulators' Auth and Firestore data first.
 *
 *   npm run test:e2e:mock-week      (PW_CHROMIUM_PATH=... to use a preinstalled Chromium)
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
  pageUser,
  resetEmulators,
  shotsDir,
  uidForEmail,
} from './lib/e2e.mjs';

const SHOTS = shotsDir('e2e-mock-week');
await resetEmulators();
const { browser, consoleErrors, lastPage, newPage } = await launch();

// Results the commissioner will enter: every Sunday game goes to the home team, and the Monday
// night game to the away team (the 15th game), with a total of 46 points.
const MNF_TOTAL = 46;

// name, wins, tiebreaker guess, how they pay, whether the commissioner will mark them paid
const PLAYERS = [
  { name: 'Dale D.', wins: 12, guess: 58, method: 'etransfer', intent: 'already_did', paid: true, phone: '613 555 0101' },
  { name: 'Jen K.', wins: 12, guess: 45, method: 'cash', paid: true, phone: '(613) 555-0102' },
  { name: 'Troy T.', wins: 14, guess: 46, method: 'etransfer', paid: false, phone: '315-555-0103' }, // best record, never pays
  { name: 'Alex R.', wins: 9, guess: 50, method: 'cash', paid: true },
  { name: 'Alexander R.', wins: 9, guess: 50, method: 'cash', paid: false }, // possible duplicate of Alex R.
  { name: 'Sam S.', wins: 11, guess: 44, method: 'etransfer', paid: true },
  { name: 'Pat P.', wins: 11, guess: 47, method: 'cash', paid: true },
  { name: 'Bob Smith', wins: 7, guess: 40, method: 'cash', paid: true, phone: '613-555-0111' },
  { name: 'Robert Smith', wins: 6, guess: 41, method: 'etransfer', paid: true, phone: '613-555-0111' }, // same phone
  { name: 'Kim L.', wins: 3, guess: 30, method: null, paid: true, paidAs: 'cash' }, // never said how they'd pay
  { name: 'Lee M.', wins: 10, guess: 55, method: 'cash', paid: true },
  { name: 'Nora N.', wins: 5, guess: 20, method: 'etransfer', paid: false },
];

/** Separate, deliberately plain winner logic: the spec of DATA_MODEL §7, written out again. */
function expectedWinner() {
  const eligible = PLAYERS.filter((p) => p.paid);
  const top = Math.max(...eligible.map((p) => p.wins));
  let tied = eligible.filter((p) => p.wins === top);
  if (tied.length > 1) {
    const over = tied.filter((p) => p.guess >= MNF_TOTAL);
    const pool = over.length ? over : tied;
    const best = over.length ? Math.min(...pool.map((p) => p.guess)) : Math.max(...pool.map((p) => p.guess));
    tied = pool.filter((p) => p.guess === best);
  }
  return { names: tied.map((p) => p.name), pot: eligible.length * 2000, top };
}

async function playerEnters(p) {
  const page = await newPage();
  await page.goto(`${APP}/picks/2026/wk01`);
  await page.getByText('0 of 15 picked').waitFor();
  const ids = await page.locator('li[id^="game-"]').evaluateAll((els) => els.map((e) => e.id));
  for (const [i, id] of ids.entries()) {
    const correct = id === 'game-mnf' ? 0 : 1; // away for the Monday night game, home for the rest
    await page.locator(`#${id} button.pick`).nth(i < p.wins ? correct : 1 - correct).click();
  }
  await page.getByLabel('Tiebreaker: total points in this game').fill(String(p.guess));
  await page.getByLabel('Your name').fill(p.name);
  if (p.phone) await page.getByLabel('Phone (optional)').fill(p.phone);
  if (p.method) await page.locator('label.pick', { hasText: p.method === 'cash' ? 'Cash' : 'e-Transfer' }).click();
  if (p.intent === 'already_did') await page.locator('label.pick', { hasText: 'Already did' }).click();
  await page.getByLabel("I'm 18 or older").check();
  await page.getByRole('button', { name: 'Submit picks' }).click();
  await page.getByText('Picks submitted').waitFor();
  p.uid = (await pageUser(page)).uid;
  return page;
}

/** Wait for a trigger (they run a moment after the write). */
async function eventually(read, test, seconds = 20) {
  for (let i = 0; i < seconds * 4; i++) {
    const value = await read();
    if (test(value)) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  return read();
}

let admin = null;
try {
  // ---- Commissioner: sign in, get admin, set up and open the week ------------------------
  admin = await newPage();
  await admin.goto(`${APP}/admin`);
  await admin.getByLabel('Email').fill('ryan@tunas.test');
  await admin.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await admin.getByText('Check your email').waitFor();
  await admin.goto(finishUrl(await oobFor('ryan@tunas.test'), '/admin'));
  await admin.getByText("You're signed in.").waitFor();
  execSync(`npm run -s admin:claim -- ${await uidForEmail('ryan@tunas.test')}`, {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', GCLOUD_PROJECT: 'demo-tunas-pool' },
    stdio: 'pipe',
  });
  await admin.getByRole('link', { name: 'Continue' }).click();
  await admin.getByRole('button', { name: 'Check again' }).click();
  await admin.getByRole('heading', { name: 'Payments' }).waitFor();
  check('A1 an admin with no open week sees a friendly empty Payments screen', (await admin.getByText('No week is open yet').count()) === 1);

  await admin.goto(`${APP}/admin/weeks`);
  await admin.getByRole('link', { name: 'Set up week 1' }).click();
  await admin.getByLabel('Matchups').fill(FULL_WEEK);
  await admin.getByRole('button', { name: 'Save draft' }).click();
  await admin.waitForURL('**/admin/weeks/2026/wk01');
  await admin.getByRole('button', { name: 'Open week' }).click();
  await admin.getByText('Week opened.').waitFor();
  check('A2 the week is open', (await getDoc('seasons/2026/weeks/wk01'))?.fields.status.stringValue === 'open');

  // ---- Twelve players enter ---------------------------------------------------------------
  const started = Date.now();
  for (const p of PLAYERS) await playerEnters(p);
  console.log(`     12 players entered in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  const entries = await listDocs('seasons/2026/weeks/wk01/entries');
  check('B1 twelve entries exist', entries.length === 12, `${entries.length}`);

  const week1 = await eventually(
    () => getDoc('seasons/2026/weeks/wk01'),
    (w) => w?.fields.entryCount?.integerValue === '12',
  );
  check('B2 the trigger counted 12 players in and 0 paid', week1?.fields.entryCount.integerValue === '12' && week1.fields.paidCount.integerValue === '0');

  // ---- Payments queue ---------------------------------------------------------------------
  await admin.goto(`${APP}/admin`);
  await admin.getByRole('heading', { name: 'Payments' }).waitFor();
  await admin.getByText('Dale D.').first().waitFor();
  const unpaidChip = await admin.getByRole('button', { name: /^Unpaid\s*12/ }).count();
  check('C1 the queue opens on Unpaid with all 12 entries', unpaidChip === 1);
  check('C2 the pot starts at $0', (await admin.locator('.stat-tile', { hasText: 'Pot' }).innerText()).includes('$0'));
  check('C3 four rows are flagged "Check" for possible duplicates (two pairs)', (await admin.getByRole('button', { name: /^Check\s*4/ }).count()) === 1);
  await admin.getByRole('button', { name: /^Check/ }).click();
  const flagText = await admin.getByRole('list', { name: 'Entries' }).innerText();
  check('C4 flags use neutral wording and name the other player',
    flagText.includes('possible duplicate of Alexander R.') && flagText.includes('possible duplicate of Robert Smith') && flagText.includes('same phone number'));
  await admin.getByRole('button', { name: /^Unpaid/ }).click();
  await admin.screenshot({ path: `${SHOTS}/mock-payments-before.png`, fullPage: true });

  await admin.getByLabel('Find a player').fill('robert');
  check('C5 search finds a player by part of a name', (await admin.getByRole('list', { name: 'Entries' }).locator('> li').count()) === 1);
  await admin.getByLabel('Find a player').fill('');

  for (const p of PLAYERS.filter((x) => x.paid)) {
    const label = p.method ? `Mark ${p.name} paid` : `Mark ${p.name} paid in cash`;
    await admin.getByRole('button', { name: label, exact: true }).click();
    await admin.getByText(`${p.name} marked paid`).first().waitFor();
  }
  const pot9 = await admin.locator('.stat-tile', { hasText: 'Pot' }).innerText();
  check('C6 marking nine entries paid makes the pot $180', pot9.includes('$180'), pot9.replace(/\s+/g, ' '));

  // One tap Undo from the toast, then pay again.
  await admin.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await admin.getByText(/back to unpaid/).first().waitFor();
  check('C7 Undo on the toast takes one entry back out of the pot', (await admin.locator('.stat-tile', { hasText: 'Pot' }).innerText()).includes('$160'));
  await admin.getByRole('button', { name: /^Unpaid\s*4/ }).click();
  await admin.getByRole('button', { name: 'Mark Lee M. paid', exact: true }).click();
  await admin.getByText('Lee M. marked paid').first().waitFor();
  check('C8 and paying again restores it', (await admin.locator('.stat-tile', { hasText: 'Pot' }).innerText()).includes('$180'));

  const week2 = await eventually(
    () => getDoc('seasons/2026/weeks/wk01'),
    (w) => w?.fields.paidCount?.integerValue === '9',
  );
  check('C9 the trigger counted 9 paid', week2?.fields.paidCount.integerValue === '9');
  const kimPay = await getDoc(`seasons/2026/weeks/wk01/entries/${PLAYERS[9].uid}/payment/current`);
  check('C10 Kim, who never said how, was created as paid cash by the admin',
    kimPay?.fields.paymentMethod.stringValue === 'cash' && kimPay.fields.paymentStatus.stringValue === 'paid' && Boolean(kimPay.fields.paidBy));
  const audit1 = await listDocs('auditLog');
  check('C11 every payment change is in the audit log (9 paid + 1 undo + 1 paid again)',
    audit1.filter((d) => d.fields.action.stringValue === 'payment.set').length === 11);

  const watcher = await newPage();
  await watcher.goto(APP);
  await watcher.getByTestId('week-totals').waitFor();
  const totals = await eventually(() => watcher.getByTestId('week-totals').innerText(), (t) => t.includes('12 players'));
  check('C12 players see how many are in and the pot, never who has paid', totals.includes('12 players are in') && totals.includes('$180') && (await watcher.getByText('Dale D.').count()) === 0, totals.replace(/\s+/g, ' '));

  // ---- Lock, then results ---------------------------------------------------------------------
  await admin.goto(`${APP}/admin/weeks/2026/wk01`);
  await admin.getByRole('button', { name: 'Lock now' }).click();
  await admin.getByRole('button', { name: 'Yes, lock picks now' }).click();
  await admin.getByText('Picks are locked.').waitFor();
  const locked = await getDoc('seasons/2026/weeks/wk01');
  check('D1 locking reveals the picks', locked?.fields.status.stringValue === 'locked' && locked.fields.revealed.booleanValue === true);

  await admin.goto(`${APP}/admin/results`);
  await admin.getByRole('heading', { name: 'Results' }).waitFor();
  check('D2 publishing is blocked until results are in', (await admin.getByRole('button', { name: 'Review and publish winner' }).isDisabled()));
  const gameItems = admin.getByRole('list', { name: 'Games' }).locator('> li');
  const nGames = await gameItems.count();
  for (let i = 0; i < nGames; i++) {
    const isMnf = i === nGames - 1;
    await gameItems.nth(i).locator('button.pick').nth(isMnf ? 0 : 2).click(); // away for Monday night, home otherwise
  }
  await admin.getByText('All 15 results in').waitFor();
  await admin.getByLabel('Monday night total points').fill(String(MNF_TOTAL));
  await admin.getByRole('button', { name: 'Save results' }).click();
  await admin.getByText('Results saved').first().waitFor();
  const preview = admin.getByRole('heading', { name: 'Winner' }).locator('..').locator('..');
  await admin.getByText('Winner:', { exact: false }).first().waitFor();
  const winnerText = await admin.getByText(/had the most correct picks|The tiebreaker decided it/).first().innerText();
  check('D3 the preview names the winner and explains the tiebreak in plain words', winnerText.includes("Dale D.'s guess of 58") && winnerText.includes('46'), winnerText);
  check('D4 unpaid entries are called out as unable to win', (await admin.getByText(/3 entries haven't paid and can't win/).count()) === 1);
  void preview;

  const dale = PLAYERS[0];
  const record = await eventually(
    () => getDoc(`seasons/2026/weeks/wk01/entries/${dale.uid}`),
    (d) => Boolean(d?.fields.record),
  );
  check('D5 the trigger wrote each entry its record (Dale: 12 - 3)', record?.fields.record.mapValue.fields.wins.integerValue === '12' && record.fields.record.mapValue.fields.losses.integerValue === '3');
  const troyRecord = await getDoc(`seasons/2026/weeks/wk01/entries/${PLAYERS[2].uid}`);
  check('D6 Troy has the best record (14 - 1) but is unpaid', troyRecord?.fields.record?.mapValue.fields.wins.integerValue === '14');
  await admin.screenshot({ path: `${SHOTS}/mock-results.png`, fullPage: true });

  // ---- Publish -------------------------------------------------------------------------------
  const expected = expectedWinner();
  console.log(`     independent check expects: ${expected.names.join(' & ')} (top record ${expected.top}), pot $${expected.pot / 100}`);
  await admin.getByRole('button', { name: 'Review and publish winner' }).click();
  const confirmText = await admin.getByRole('group', { name: 'Confirm winner' }).innerText();
  check('D7 the confirmation names the winner, the record, and the pot', confirmText.includes('Dale D.') && confirmText.includes('12 – 3') && confirmText.includes('$180'), confirmText.replace(/\s+/g, ' ').slice(0, 120));
  await admin.getByRole('button', { name: 'Publish winner', exact: true }).click();
  await admin.getByRole('region', { name: 'Week 1 winner' }).waitFor();
  const banner = await admin.getByRole('region', { name: 'Week 1 winner' }).innerText();
  check('D8 the winner banner shows name, record, tiebreaker guess, and pot', banner.includes('Dale D.') && banner.includes('12 – 3') && banner.includes('58') && banner.includes('$180'), banner.replace(/\s+/g, ' '));
  await admin.screenshot({ path: `${SHOTS}/mock-winner.png`, fullPage: true });

  const final = await getDoc('seasons/2026/weeks/wk01');
  const publishedNames = (final?.fields.winner.mapValue.fields.displayNames.arrayValue.values ?? []).map((v) => v.stringValue);
  check('D9 the published winner matches the independent calculation',
    final?.fields.status.stringValue === 'final' && JSON.stringify(publishedNames) === JSON.stringify(expected.names) && final.fields.winner.mapValue.fields.potCents.integerValue === String(expected.pot),
    publishedNames.join(' & '));
  check('D10 Troy, unpaid with the best record, did not win', !publishedNames.includes('Troy T.'));

  await admin.getByText('How this was decided:').waitFor();
  check('D11 the screen explains how it was decided', (await admin.getByText('How this was decided:').count()) === 1);

  // ---- Payout --------------------------------------------------------------------------------
  await admin.getByRole('button', { name: 'Mark payout sent' }).click();
  await admin.getByText('Payout marked sent').first().waitFor();
  check('D12 the payout can be recorded as sent', (await getDoc('seasons/2026/weeks/wk01'))?.fields.payoutSent.booleanValue === true);
  await admin.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await admin.getByText('Payout marked not sent').first().waitFor();
  check('D13 and undone', (await getDoc('seasons/2026/weeks/wk01'))?.fields.payoutSent.booleanValue === false);

  // ---- After the week is final ------------------------------------------------------------------
  await admin.reload();
  await admin.getByRole('region', { name: 'Week 1 winner' }).waitFor();
  check('D14 once final, the results can no longer be changed', (await admin.getByRole('button', { name: 'Save results' }).count()) === 0 && (await admin.locator('button.pick').first().isDisabled()));

  const audit = await listDocs('auditLog');
  const count = (a) => audit.filter((d) => d.fields.action.stringValue === a).length;
  check('D15 the audit log has the whole week: payments, status changes, results, winner, payout',
    count('payment.set') === 11 && count('week.status') === 2 && count('week.results') === 1 && count('week.winnerPublished') === 1 && count('week.payout') === 2,
    ['payment.set', 'week.status', 'week.results', 'week.winnerPublished', 'week.payout'].map((a) => `${a}=${count(a)}`).join(' '));

  // ---- The production test run lives in its own season (D-044) ---------------------------------
  await admin.goto(`${APP}/admin/weeks?season=2026-test`);
  await admin.getByRole('heading', { name: '2026-test weeks' }).waitFor();
  check('T1 the Back Office labels the test season', (await admin.getByText('Test season').count()) === 1);
  await admin.getByRole('link', { name: 'Set up week 1' }).click();
  await admin.getByLabel('Matchups').fill(FULL_WEEK);
  await admin.getByRole('button', { name: 'Save draft' }).click();
  await admin.waitForURL('**/admin/weeks/2026-test/wk01');
  await admin.getByRole('button', { name: 'Open week' }).click();
  await admin.getByText('Week opened.').waitFor();
  const testWeek = await getDoc('seasons/2026-test/weeks/wk01');
  const realWeeks = await listDocs('seasons/2026/weeks');
  check('T2 a week set up under 2026-test is separate from the real season', testWeek?.fields.status.stringValue === 'open' && realWeeks.length === 1);
  const tester = await newPage();
  await tester.goto(`${APP}/picks/2026-test/wk01`);
  await tester.getByText('0 of 15 picked').waitFor();
  check('T3 a tester can reach the test week by its direct link', true);
  await tester.goto(APP);
  await tester.getByText(/Picks are locked/).first().waitFor();
  check('T4 and real players still see only the real season on the home screen', (await tester.getByRole('link', { name: 'Make your picks' }).count()) === 0);

  check('Z1 no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (err) {
  failNow(err.message.split('\n').slice(0, 4).join(' '));
  const page = admin ?? lastPage();
  await page?.screenshot({ path: `${SHOTS}/mock-failure.png`, fullPage: true });
  const alerts = await page?.locator('[role="alert"], [role="status"]').allInnerTexts().catch(() => []);
  if (alerts?.length) console.log('     on screen:', alerts.join(' | ').replace(/\s+/g, ' ').slice(0, 300));
} finally {
  await browser.close();
}
finish();
