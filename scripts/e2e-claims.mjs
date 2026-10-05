/**
 * Sprint 5 end to end against the emulators, at 375px: a player asks to link their login to a roster
 * player's paper history, sees nothing until the commissioner approves, then sees the history and
 * edits the picks as their own. The commissioner unlinks (the state goes back), rejects a request
 * with a note, and merges a website double into a roster player. Every step is checked in Firestore
 * and the audit log.
 *
 * Needs the Auth, Firestore, and Functions emulators and the dev server:
 *   1. npm --prefix functions run build
 *   2. npx firebase emulators:start --only auth,firestore,functions,storage --project demo-tunas-pool
 *   3. VITE_USE_EMULATORS=true npx vite --port 5173
 *   4. npm run test:e2e:claims      (PW_CHROMIUM_PATH=... to use a preinstalled Chromium)
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
  pageUser,
  resetEmulators,
  shotsDir,
  uidForEmail,
} from './lib/e2e.mjs';

const SHOTS = shotsDir('e2e-claims');
const WEEK = 'seasons/2026/weeks/wk01';

await resetEmulators();
const { browser, consoleErrors, lastPage, newPage } = await launch();

const field = (doc, name) => doc?.fields?.[name];
const text = (doc, name) => field(doc, name)?.stringValue;
const isNull = (doc, name) => Boolean(field(doc, name)) && 'nullValue' in field(doc, name);
const audit = async (action) =>
  (await listDocs('auditLog')).filter((d) => text(d, 'action') === action);
const noSideScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const idOf = (doc) => doc.name.split('/').pop();
const playerNamed = async (name) =>
  (await listDocs('players')).find((d) => text(d, 'displayName') === name);
const claimsOf = async (uid) =>
  (await listDocs('claims')).filter((d) => text(d, 'requesterUid') === uid);

async function signInWithEmail(page, email, next) {
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /Email me/ }).click();
  await page.getByText('Check your email').waitFor();
  await page.goto(finishUrl(await oobFor(email), next));
  // A new login sees "You're signed in."; a guest saving their account sees "Your picks are saved".
  await page.getByRole('link', { name: 'Continue' }).waitFor();
}

try {
  // ---- A. Commissioner: week 1 open, two roster players, a paper sheet for Rosalie --------
  const admin = await newPage();
  await admin.goto(`${APP}/admin`);
  await signInWithEmail(admin, 'ryan@tunas.test', '/admin');
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

  await admin.goto(`${APP}/admin/weeks`);
  await admin.getByRole('link', { name: 'Set up week 1' }).click();
  await admin.getByLabel('Matchups').fill(FULL_WEEK);
  await admin.getByRole('button', { name: 'Save draft' }).click();
  await admin.waitForURL('**/admin/weeks/2026/wk01');
  await admin.getByRole('button', { name: 'Open week' }).click();
  await admin.getByText('Week opened.').waitFor();

  await admin.getByRole('link', { name: 'Roster' }).click();
  for (const [name, phone] of [
    ['Rosalie M.', '613-555-0144'],
    ['Bernie T.', ''],
  ]) {
    await admin.getByRole('button', { name: 'Add a player' }).click();
    await admin.getByLabel('Name', { exact: true }).fill(name);
    if (phone) await admin.getByLabel('Phone (optional)').fill(phone);
    await admin.getByRole('button', { name: 'Add player' }).click();
    await admin.getByText(`${name} added to the roster`).waitFor();
  }
  const rosalie = idOf(await playerNamed('Rosalie M.'));
  const bernie = idOf(await playerNamed('Bernie T.'));

  await admin.getByRole('link', { name: 'Enter picks for Rosalie M.' }).click();
  await admin.getByText('0 of 15 picked').waitFor();
  const ids = await admin.locator('li[id^="game-"]').evaluateAll((els) => els.map((e) => e.id));
  for (const id of ids) await admin.locator(`#${id} button.pick`).nth(1).click();
  await admin.getByLabel('Tiebreaker: total points Monday night').fill('41');
  await admin.locator('label.pick', { hasText: 'Paid cash' }).click();
  await admin.getByRole('button', { name: 'Save picks' }).click();
  await admin.getByText('Rosalie M.: picks saved, marked paid').waitFor();
  check(
    'A1 with no requests, the Claims tab has no count and says so',
    (await admin.getByRole('link', { name: 'Claims' }).locator('.badge').count()) === 0,
  );
  await admin.getByRole('link', { name: 'Claims' }).click();
  await admin.getByText('No requests waiting').waitFor();

  // ---- B. A family member asks to link Rosalie's history ----------------------------------
  const kid = await newPage();
  await kid.goto(APP);
  await kid.getByRole('link', { name: /Played on paper, by text, or by phone before/ }).click();
  await kid.getByText('First, save your account').waitFor();
  check(
    'B1 a guest is asked to save their account before asking, in plain words',
    (await kid.getByText('save your account with an email or Google first').count()) === 1,
  );
  await signInWithEmail(kid, 'kid@family.test', '/claim');
  await kid.getByRole('link', { name: 'Continue' }).click();
  await kid.getByText('Link your history').waitFor();
  const kidUid = (await pageUser(kid)).uid;
  check('B2 the claim page has no sideways scroll at 375px', await noSideScroll(kid));
  await kid.screenshot({ path: `${SHOTS}/claim-form.png`, fullPage: true });

  await kid.getByRole('button', { name: 'Ask the pool to link it' }).click();
  check(
    'B3 a request needs a name',
    (await kid.getByText('Enter the name the pool knows you by').count()) === 1 &&
      (await claimsOf(kidUid)).length === 0,
  );
  await kid.getByLabel('The name the pool knows you by').fill('Rosalie M.');
  await kid.getByLabel('Your phone (optional)').fill('613 555 0144');
  await kid.getByRole('button', { name: 'Ask the pool to link it' }).click();
  await kid.getByText('Request sent').waitFor();
  check(
    'B4 the player sees "Pending approval" and only what they typed',
    (await kid.getByText('Pending approval').count()) === 1 &&
      (await kid.getByText('613-555-0144').count()) === 1,
  );
  const [claim] = await claimsOf(kidUid);
  check(
    'B5 the stored request holds what was typed and no match',
    text(claim, 'status') === 'pending' &&
      text(claim, 'claimedName') === 'Rosalie M.' &&
      text(claim, 'claimedPhone') === '+16135550144' &&
      text(claim, 'requesterEmail') === 'kid@family.test' &&
      isNull(claim, 'suggestedPlayerId') &&
      isNull(claim, 'resolvedPlayerId'),
  );
  await kid.goto(`${APP}/history`);
  await kid.getByText('No weeks yet').waitFor();
  check(
    'B6 while it is pending, they see none of the history they named',
    (await kid.getByText('Week 1').count()) === 0 &&
      isNull(await getDoc(`players/${rosalie}`), 'claimedByUid'),
  );

  // ---- C. The commissioner approves in one tap --------------------------------------------
  await admin.reload();
  await admin.getByRole('list', { name: 'Requests' }).getByRole('listitem').first().waitFor();
  check(
    'C1 the Claims tab shows a count of one',
    (await admin.getByRole('link', { name: /Claims/ }).locator('.badge').textContent())?.trim() ===
      '1 waiting',
  );
  const card = admin.getByRole('list', { name: 'Requests' }).getByRole('listitem').first();
  check(
    'C2 the request shows who is asking and the best match already chosen',
    (await card.getByText('kid@family.test').count()) === 1 &&
      (await card.getByText('1 week played').count()) === 1 &&
      (await card.getByText('Same phone').count()) === 1 &&
      (await card.getByRole('radio').first().isChecked()),
  );
  check('C3 the Claims tab has no sideways scroll at 375px', await noSideScroll(admin));
  await admin.screenshot({ path: `${SHOTS}/claims-tab.png`, fullPage: true });
  await card.getByRole('button', { name: 'Link to Rosalie M.' }).click();
  await admin.getByText('Rosalie M. linked to Rosalie M.').waitFor();
  const approved = await audit('claim.approved');
  check(
    'C4 the roster player is linked to that login, and the approval is in the audit log',
    text(await getDoc(`players/${rosalie}`), 'claimedByUid') === kidUid &&
      approved.length === 1 &&
      text(approved[0], 'actorUid') === adminUid &&
      text((await claimsOf(kidUid))[0], 'status') === 'approved',
  );
  check(
    'C5 the approval offers Undo, and the queue is empty again',
    (await admin.getByRole('button', { name: 'Undo' }).count()) === 1 &&
      (await admin.getByText('No requests waiting').count()) === 1,
  );

  // ---- D. The history is theirs at once ---------------------------------------------------
  await kid.goto(`${APP}/claim`);
  await kid.getByText("You're linked").waitFor();
  await kid.getByRole('link', { name: 'See your history' }).click();
  await kid.getByRole('list', { name: 'Weeks played' }).waitFor();
  check(
    'D1 the paper week shows in their history straight after approval',
    (await kid.getByText('1 week played.').count()) === 1 &&
      (await kid.getByText('Week 1').count()) === 1,
  );
  await kid.getByText('Week 1').click();
  await kid.getByText('Tiebreaker:').waitFor();
  check(
    'D2 opening the week shows the picks from the sheet',
    (await kid.getByText('Rams').count()) >= 1 && (await kid.getByText('41').count()) >= 1,
  );
  check('D3 the history page has no sideways scroll at 375px', await noSideScroll(kid));
  await kid.screenshot({ path: `${SHOTS}/history.png`, fullPage: true });

  await kid.goto(APP);
  await kid.getByText('Picks in.').waitFor();
  check(
    'D4 the home screen treats the paper entry as theirs, and no longer offers to link',
    (await kid.getByRole('link', { name: /Link your history/ }).count()) === 0,
  );
  await kid.getByRole('link', { name: 'See or edit your picks' }).click();
  await kid.getByRole('button', { name: /^Edit picks until/ }).click();
  await kid.getByText('All 15 picked').waitFor();
  await kid.locator('#game-g01 button.pick').nth(0).click();
  await kid.getByLabel("I'm 18 or older").check();
  await kid.getByRole('button', { name: 'Save changes' }).click();
  await kid.getByText('Picks submitted').waitFor();
  const edited = await getDoc(`${WEEK}/entries/${rosalie}/private/picks`);
  check(
    'D5 they can change the picks themselves, on the same single entry',
    edited.fields.picks.mapValue.fields.g01.stringValue === 'away' &&
      (await listDocs(`${WEEK}/entries`)).length === 1 &&
      text(await getDoc(`${WEEK}/entries/${rosalie}`), 'enteredBy') === 'admin',
  );

  // ---- E. A wrong approval is undone ------------------------------------------------------
  await admin.getByRole('link', { name: 'Roster' }).click();
  await admin.getByRole('heading', { name: 'Roster' }).waitFor();
  check(
    'E1 the roster marks the player as linked',
    (await admin.getByRole('listitem').filter({ hasText: 'Rosalie M.' }).getByText('Linked').count()) === 1,
  );
  await admin.getByRole('button', { name: 'Details for Rosalie M.' }).click();
  await admin.getByRole('button', { name: 'Unlink login' }).click();
  check(
    'E2 unlinking asks once more and says what it does',
    (await admin.getByText('will no longer see this history').count()) === 1 &&
      text(await getDoc(`players/${rosalie}`), 'claimedByUid') === kidUid,
  );
  await admin.getByRole('button', { name: 'Yes, unlink' }).click();
  await admin.getByText('Rosalie M. unlinked').waitFor();
  const unlinked = await audit('claim.unlinked');
  check(
    'E3 the player is back to no login, the entry is untouched, and it is in the audit log',
    isNull(await getDoc(`players/${rosalie}`), 'claimedByUid') &&
      (await getDoc(`${WEEK}/entries/${rosalie}`)) !== null &&
      unlinked.length === 1,
  );
  await kid.goto(`${APP}/history`);
  await kid.getByText('No weeks yet').waitFor();
  check('E4 the unlinked login no longer sees the history', (await kid.getByText('Week 1').count()) === 0);
  await kid.goto(`${APP}/picks/2026/wk01`);
  await kid.getByText('0 of 15 picked').waitFor();
  check('E5 and is back to a blank form for the week, not the paper picks', true);

  // ---- F. A request is rejected with a friendly note --------------------------------------
  await kid.goto(`${APP}/claim`);
  await kid.getByText("couldn't match your last request").waitFor();
  await kid.getByLabel('The name the pool knows you by').fill('Bernie T.');
  await kid.getByRole('button', { name: 'Ask the pool to link it' }).click();
  await kid.getByText('Request sent').waitFor();
  await admin.getByRole('link', { name: /Claims/ }).click();
  const second = admin.getByRole('list', { name: 'Requests' }).getByRole('listitem').first();
  await second.getByRole('button', { name: 'Reject the request from Bernie T.' }).click();
  await second.getByLabel('A note for them (optional)').fill('Stop by the shop and we will sort it out');
  await second.getByRole('button', { name: 'Reject request' }).click();
  await admin.getByText('Request from Bernie T. rejected').waitFor();
  const rejected = await audit('claim.rejected');
  check(
    'F1 a rejection links nothing and is in the audit log',
    isNull(await getDoc(`players/${bernie}`), 'claimedByUid') && rejected.length === 1,
  );
  await kid.reload();
  await kid.getByText('Stop by the shop and we will sort it out').waitFor();
  check(
    'F2 the player sees the note and can ask again',
    (await kid.getByRole('button', { name: 'Ask the pool to link it' }).count()) === 1,
  );
  await kid.screenshot({ path: `${SHOTS}/claim-rejected.png`, fullPage: true });

  // ---- G. A website double is merged into the roster player -------------------------------
  const guest = await newPage();
  await guest.goto(`${APP}/picks/2026/wk01`);
  await guest.getByText('0 of 15 picked').waitFor();
  for (const id of ids) await guest.locator(`#${id} button.pick`).nth(0).click();
  await guest.getByLabel('Tiebreaker: total points in this game').fill('37');
  await guest.getByLabel('Your name').fill('Bern');
  await guest.getByLabel("I'm 18 or older").check();
  await guest.getByRole('button', { name: 'Submit picks' }).click();
  await guest.getByText('Picks submitted').waitFor();
  const guestUid = (await pageUser(guest)).uid;

  await admin.getByRole('link', { name: 'Roster' }).click();
  await admin.getByRole('button', { name: 'Details for Bern', exact: true }).click();
  await admin.getByText('Same person as another player? Merge them').click();
  await admin.getByLabel('Keep this player').selectOption({ label: 'Bernie T.' });
  check(
    'G1 a merge names both players and says it cannot be undone',
    (await admin.getByText("This can't be undone.").count()) === 1 &&
      (await admin.getByRole('button', { name: 'Merge Bern into Bernie T.' }).count()) === 1,
  );
  await admin.screenshot({ path: `${SHOTS}/merge.png`, fullPage: true });
  await admin.getByRole('button', { name: 'Merge Bern into Bernie T.' }).click();
  await admin.getByText('Bern merged into Bernie T. (1 week moved)').waitFor();
  const entryIds = (await listDocs(`${WEEK}/entries`)).map(idOf).sort();
  const old = await getDoc(`players/${guestUid}`);
  const merged = await audit('player.merged');
  check(
    'G2 the website week now belongs to the roster player, with its picks',
    entryIds.includes(bernie) &&
      !entryIds.includes(guestUid) &&
      (await getDoc(`${WEEK}/entries/${bernie}/private/picks`)).fields.tiebreakerTotal.integerValue === '37' &&
      text(await getDoc(`${WEEK}/entries/${bernie}`), 'displayName') === 'Bernie T.',
  );
  check(
    'G3 the old profile is retired, the login follows the entries, and the merge is in the audit log',
    text(old, 'mergedInto') === bernie &&
      isNull(old, 'claimedByUid') &&
      text(await getDoc(`players/${bernie}`), 'claimedByUid') === guestUid &&
      merged.length === 1,
  );
  await admin.getByRole('heading', { name: 'Roster' }).waitFor();
  check(
    'G4 the merged profile is gone from the roster',
    (await admin.getByRole('button', { name: 'Details for Bern', exact: true }).count()) === 0,
  );
  await guest.goto(APP);
  await guest.getByText('Picks in.').waitFor();
  check('G5 the guest still sees their own picks after the merge', true);

  check('H1 no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (err) {
  failNow(err.message.split('\n').slice(0, 3).join(' '));
  await lastPage()?.screenshot({ path: `${SHOTS}/e2e-failure.png`, fullPage: true });
} finally {
  await browser.close();
}
finish();
