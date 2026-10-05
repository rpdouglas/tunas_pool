/**
 * CI only: write .env.production.local from the Firebase web app's SDK config, so the deploy job
 * needs no VITE_* secrets and no env file is committed.
 *   node scripts/write-web-env.mjs <projectAlias> <webAppId>
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (CI), or GOOGLE_OAUTH_ACCESS_TOKEN for a local run.
 *
 * This calls the Firebase Management API with the project named in the path. The CLI's
 * `apps:sdkconfig` looks the app up through the `projects/-` wildcard, which returns 403 for the
 * deploy service account.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const [alias, appId] = process.argv.slice(2);
if (!alias || !appId) {
  console.error('Usage: node scripts/write-web-env.mjs <projectAlias> <webAppId>');
  process.exit(1);
}

const aliases = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects;
const projectId = aliases[alias] ?? alias;

let token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
let caller = 'GOOGLE_OAUTH_ACCESS_TOKEN';
if (!token) {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  token = await auth.getAccessToken();
  caller = (await auth.getCredentials()).client_email ?? 'unknown account';
}

const url = `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${appId}/config`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`Could not read the web app config (HTTP ${res.status}) as ${caller}.`);
  console.error(`GET ${url}`);
  console.error(await res.text());
  process.exit(1);
}
const config = await res.json();

const env = {
  VITE_FIREBASE_API_KEY: config.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
  VITE_FIREBASE_PROJECT_ID: config.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: config.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: config.messagingSenderId,
  VITE_FIREBASE_APP_ID: config.appId,
  VITE_USE_EMULATORS: 'false',
  VITE_ENABLE_STYLEGUIDE: 'false',
};

const missing = Object.entries(env).filter(([, value]) => !value);
if (missing.length > 0) {
  console.error(`Web app config is missing: ${missing.map(([key]) => key).join(', ')}`);
  process.exit(1);
}

writeFileSync(
  '.env.production.local',
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
);
console.log(`Wrote .env.production.local for ${config.projectId} (${config.appId}).`);
