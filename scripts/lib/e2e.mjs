/** Helpers shared by the emulator end-to-end scripts (scripts/e2e-*.mjs). */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

export const APP = 'http://127.0.0.1:5173';
export const AUTH = 'http://127.0.0.1:9099';
export const FS = 'http://127.0.0.1:8080/v1/projects/demo-tunas-pool/databases/db-tunaspool/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

export const FULL_WEEK = `Sun 9:30 AM Jaguars at Rams (London)
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

let failures = 0;
export function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
export const failureCount = () => failures;
export function failNow(message) {
  failures++;
  console.log(`FAIL (exception) ${message}`);
}
export function finish() {
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
}

export function shotsDir(name) {
  const dir = process.env.E2E_SHOTS ?? `test-results/${name}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function resetEmulators() {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-tunas-pool/databases/db-tunaspool/documents', { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/demo-tunas-pool/accounts`, { method: 'DELETE' });
}

export async function oobFor(email) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/demo-tunas-pool/oobCodes`);
  const { oobCodes } = await res.json();
  const mine = oobCodes.filter((c) => c.email === email);
  return mine[mine.length - 1];
}

export function finishUrl(oob, next = '/') {
  return `${APP}/auth/finish?next=${encodeURIComponent(next)}&apiKey=demo-api-key&oobCode=${oob.oobCode}&mode=signIn&lang=en`;
}

export async function uidForEmail(email) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-tunas-pool/accounts:query`, {
    method: 'POST', headers: OWNER, body: JSON.stringify({ returnUserInfo: true }),
  });
  const { userInfo = [] } = await res.json();
  return userInfo.find((u) => u.email === email)?.localId;
}

export async function getDoc(path) {
  const res = await fetch(`${FS}/${path}`, { headers: OWNER });
  return res.ok ? res.json() : null;
}

export async function listDocs(path) {
  const res = await fetch(`${FS}/${path}?pageSize=300`, { headers: OWNER });
  return (await res.json()).documents ?? [];
}

export async function pageUser(page) {
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

export async function waitForUser(page, predicate = (u) => Boolean(u)) {
  for (let i = 0; i < 40; i++) {
    const u = await pageUser(page);
    if (predicate(u)) return u;
    await page.waitForTimeout(250);
  }
  return pageUser(page);
}

/** Opens Chromium and returns newPage(), which gives each caller its own phone-sized browser context. */
export async function launch() {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH,
    // Containers give /dev/shm 64 MB, which a dozen open pages overrun ("Page crashed").
    args: ['--disable-dev-shm-usage'],
  });
  const consoleErrors = [];
  let lastPage = null;
  return {
    browser,
    consoleErrors,
    lastPage: () => lastPage,
    async newPage() {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => consoleErrors.push(e.message));
      lastPage = page;
      return page;
    },
  };
}
