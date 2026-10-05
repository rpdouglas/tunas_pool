/**
 * CI only: write .env.production.local from the Firebase web app's SDK config, so the deploy job
 * needs no VITE_* secrets and no env file is committed.
 *   node scripts/write-web-env.mjs <project> <webAppId>
 * Needs firebase-tools credentials (GOOGLE_APPLICATION_CREDENTIALS in CI).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [project, appId] = process.argv.slice(2);
if (!project || !appId) {
  console.error('Usage: node scripts/write-web-env.mjs <project> <webAppId>');
  process.exit(1);
}

const out = execFileSync(
  'npx',
  ['firebase', 'apps:sdkconfig', 'WEB', appId, '--project', project, '--json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const config = JSON.parse(out).result.sdkConfig;

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
