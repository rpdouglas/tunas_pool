#!/usr/bin/env bash
# =============================================================================
# scaffold.sh — Tunas Weekly Football Pool Pick 'Em · Sprint 0 scaffold
#
# Run from the repo root of rpdouglas/tunas_pool (inside the Codespace terminal):
#
#     bash scaffold.sh                      # uses demo project id for emulators
#     bash scaffold.sh my-firebase-id       # sets a real Firebase project id
#
# BEFORE RUNNING: put the nine files Claude generated in a folder called _drop/
# (drag them into the Codespace Explorer; subfolders are fine):
#     CLAUDE.md  DATA_MODEL.md  FIRESTORE_RULES.md  DESIGN_SYSTEM.md
#     PERSONAS.md  PROJECT_PLAN.md  tokens.css  brand.css  tailwind.preset.cjs
#
# Env flags:  ALLOW_MISSING=1  continue even if drop files are missing
#             SKIP_VERIFY=1    skip the typecheck/lint/test/build verification
#             DROP_DIR=path    use a different drop folder (default: _drop)
#
# Safe to re-run: generated files are overwritten, package.json is kept.
# =============================================================================
set -euo pipefail

FIREBASE_PROJECT="${1:-demo-tunas-pool}"
DROP_DIR="${DROP_DIR:-_drop}"
ALLOW_MISSING="${ALLOW_MISSING:-0}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"
REGION="northamerica-northeast1"   # Montreal: closest Cloud Functions region to Cornwall

say()  { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight --
say "Preflight"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
ok "Repo root: $ROOT"

command -v node >/dev/null || die "Node.js not found."
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ required (found $(node -v))."
ok "Node $(node -v), npm $(npm -v)"

if command -v java >/dev/null 2>&1; then
  ok "Java present (needed by the Firestore emulator)"
else
  warn "Java not found. Trying to install a headless JRE (needed for rules tests)..."
  if command -v sudo >/dev/null 2>&1 && sudo apt-get update -qq >/dev/null 2>&1 \
     && sudo apt-get install -y -qq default-jre-headless >/dev/null 2>&1; then
    ok "Installed default-jre-headless"
  else
    warn "Could not install Java. Rules tests (npm run test:rules) will not run until you do:"
    warn "  sudo apt-get install -y default-jre-headless"
  fi
fi

# ------------------------------------------------------------ place the docs --
say "Placing generated docs and design files from $DROP_DIR/"
mkdir -p docs src/styles
MISSING=()

place() { # place <file-name-in-drop> <destination>
  # Tolerant matching: case-insensitive, "_" may be a space, and browser suffixes like "(1)" are fine.
  # For .md files, only a candidate that mentions "Tunas" is accepted (skips the MRT sample PERSONAS.md).
  local name="$1" dest="$2" src="" stem ext cand
  ext=".${name##*.}"
  stem="${name%.*}"
  stem="${stem//_/?}"
  if [ -d "$DROP_DIR" ]; then
    while IFS= read -r cand; do
      if [ "$ext" = ".md" ] && ! grep -qi "tunas" "$cand"; then continue; fi
      src="$cand"
      break
    done < <(find "$DROP_DIR" -type f -iname "${stem}*${ext}" 2>/dev/null | sort)
  fi
  if [ -n "$src" ]; then
    cp "$src" "$dest"
    ok "$name -> $dest"
  elif [ -f "$dest" ]; then
    ok "$dest already in place"
  else
    MISSING+=("$name")
    warn "MISSING: $name"
  fi
}

place CLAUDE.md             CLAUDE.md
place DATA_MODEL.md         docs/DATA_MODEL.md
place FIRESTORE_RULES.md    docs/FIRESTORE_RULES.md
place DESIGN_SYSTEM.md      docs/DESIGN_SYSTEM.md
place PERSONAS.md           docs/PERSONAS.md
place PROJECT_PLAN.md       docs/PROJECT_PLAN.md
place tokens.css            src/styles/tokens.css
place brand.css             src/styles/brand.css
place tailwind.preset.cjs   tailwind.preset.cjs

if [ "${#MISSING[@]}" -gt 0 ] && [ "$ALLOW_MISSING" != "1" ]; then
  echo
  warn "Looked in: $ROOT/$DROP_DIR"
  if [ -d "$DROP_DIR" ]; then
    warn "Files found there: $(find "$DROP_DIR" -type f 2>/dev/null | wc -l)"
    find "$DROP_DIR" -type f 2>/dev/null | head -n 20 | sed 's/^/      /'
  else
    warn "That folder does not exist. Create it in the repo root: mkdir -p $DROP_DIR"
  fi
  die "Missing: ${MISSING[*]}
   Put these files in $ROOT/$DROP_DIR/ and re-run (or set ALLOW_MISSING=1 to continue anyway).
   Tip: if you downloaded tunas-scaffold.zip, run:  unzip tunas-scaffold.zip   (it creates _drop/ for you).
   Note: a .md file that does not mention 'Tunas' is ignored (e.g. the MRT sample PERSONAS.md)."
fi

# Guard against grabbing the wrong files (e.g. the MRT sample PERSONAS.md).
for f in CLAUDE.md docs/PERSONAS.md docs/DATA_MODEL.md docs/PROJECT_PLAN.md; do
  if [ -f "$f" ] && ! grep -qi "tunas" "$f"; then
    die "$f does not mention 'Tunas'. It looks like the wrong file (the MRT sample PERSONAS.md, maybe?). Replace it in $DROP_DIR/ and re-run."
  fi
done

# Firestore + Storage rules are extracted from FIRESTORE_RULES.md so the doc and
# the rules file can never silently drift apart.
extract_block() { # extract_block <file> <heading> <out>
  awk -v h="$2" '
    index($0, h) == 1 { found = 1; next }
    found && /^```/ { if (!inb) { inb = 1; next } else { exit } }
    found && inb { print }
  ' "$1" > "$3"
}
if [ -f docs/FIRESTORE_RULES.md ]; then
  extract_block docs/FIRESTORE_RULES.md "## 2. Rules" firestore.rules
  extract_block docs/FIRESTORE_RULES.md "## 3. Storage rules" storage.rules
  grep -q "rules_version" firestore.rules || die "Could not extract Firestore rules from docs/FIRESTORE_RULES.md"
  grep -q "rules_version" storage.rules   || die "Could not extract Storage rules from docs/FIRESTORE_RULES.md"
  ok "firestore.rules and storage.rules extracted from docs/FIRESTORE_RULES.md"
fi

# ------------------------------------------------------------ folder layout --
say "Creating folder structure"
mkdir -p \
  .github/workflows .devcontainer public scripts shared tests/rules \
  functions/src \
  src/test src/lib src/pages src/components/ui \
  src/features/entry src/features/admin src/features/claims src/features/leaderboard src/features/auth
for d in entry admin claims leaderboard auth; do touch "src/features/$d/.gitkeep"; done
ok "Folders ready"

# ---------------------------------------------------------- root config files --
say "Writing root config"

echo "22" > .nvmrc

if [ ! -f package.json ]; then
cat > package.json <<'EOF'
{
  "name": "tunas-pool",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit && tsc --noEmit -p functions",
    "lint": "eslint .",
    "format": "prettier --write \"src/**/*.{ts,tsx}\" \"shared/**/*.ts\" \"tests/**/*.ts\" \"functions/src/**/*.ts\" \"scripts/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:rules": "firebase emulators:exec --only firestore,storage --project demo-tunas-pool \"vitest run -c vitest.rules.config.ts\"",
    "emulators": "firebase emulators:start --project demo-tunas-pool --import=.emulator-data --export-on-exit",
    "functions:build": "npm --prefix functions run build",
    "admin:claim": "tsx scripts/set-admin-claim.ts"
  }
}
EOF
  ok "package.json created"
else
  warn "package.json exists, keeping it (delete it and re-run to regenerate scripts)"
fi

cat > .gitignore <<'EOF'
# dependencies & build output
node_modules
dist
coverage
functions/lib
functions/node_modules

# env & secrets
.env.local
.env.*.local
*service-account*.json
serviceAccount*.json

# firebase
.firebase
firebase-debug.log*
ui-debug.log
firestore-debug.log
.emulator-data

# editor / os
.DS_Store
*.log

# drop folder used by scaffold.sh
_drop
EOF

cat > .prettierrc <<'EOF'
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all"
}
EOF

cat > .prettierignore <<'EOF'
dist
coverage
functions/lib
_drop
docs
CLAUDE.md
README.md
src/styles
tailwind.preset.cjs
firestore.rules
storage.rules
EOF

cat > index.html <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#241773" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Tunas Weekly Football Pool Pick 'Em</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

cat > public/favicon.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#241773"/>
  <text x="32" y="46" font-family="Georgia, serif" font-weight="900" font-size="40" text-anchor="middle" fill="#D9AF26">T</text>
</svg>
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["vite/client", "vitest/globals", "node"],
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["src", "shared", "tests", "scripts", "vite.config.ts", "vitest.rules.config.ts"]
}
EOF

cat > vite.config.ts <<'EOF'
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  // host: true lets Codespaces forward the dev server port
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
EOF

cat > vitest.rules.config.ts <<'EOF'
import { defineConfig } from 'vitest/config';

// Rules tests run against the Firestore emulator via `npm run test:rules`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
EOF

cat > tailwind.config.cjs <<'EOF'
/** Tailwind v3. All brand tokens live in tailwind.preset.cjs + src/styles/tokens.css. */
module.exports = {
  presets: [require('./tailwind.preset.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
EOF

cat > postcss.config.cjs <<'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF

cat > eslint.config.js <<'EOF'
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'functions/lib', 'functions/node_modules', '_drop', '.emulator-data'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
EOF
ok "Root config written"

# -------------------------------------------------------------- firebase files --
say "Writing Firebase config (project id: $FIREBASE_PROJECT, functions region: $REGION)"

printf '{\n  "projects": {\n    "default": "%s"\n  }\n}\n' "$FIREBASE_PROJECT" > .firebaserc

cat > firebase.json <<'EOF'
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ],
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      {
        "source": "**/*.@(js|css|woff2)",
        "headers": [{ "key": "Cache-Control", "value": "public,max-age=31536000,immutable" }]
      }
    ]
  },
  "emulators": {
    "auth": { "port": 9099, "host": "0.0.0.0" },
    "functions": { "port": 5001, "host": "0.0.0.0" },
    "firestore": { "port": 8080, "host": "0.0.0.0" },
    "hosting": { "port": 5000, "host": "0.0.0.0" },
    "storage": { "port": 9199, "host": "0.0.0.0" },
    "ui": { "enabled": true, "port": 4000, "host": "0.0.0.0" },
    "singleProjectMode": true
  }
}
EOF

# Composite indexes from docs/DATA_MODEL.md section 8 (single-field indexes are automatic).
cat > firestore.indexes.json <<'EOF'
{
  "indexes": [
    {
      "collectionGroup": "entries",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "paymentStatus", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "entries",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "paymentMethod", "order": "ASCENDING" },
        { "fieldPath": "paymentStatus", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "claims",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
EOF

# Public demo values are safe to commit: the demo- project id never touches real Firebase.
cat > .env.development <<'EOF'
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-tunas-pool.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-tunas-pool
VITE_FIREBASE_STORAGE_BUCKET=demo-tunas-pool.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
VITE_USE_EMULATORS=false
VITE_ENABLE_STYLEGUIDE=true
EOF

cat > .env.example <<'EOF'
# Copy to .env.local and fill in from Firebase console > Project settings > Your apps > Web app.
# .env.local is git-ignored. Never commit real service-account keys.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
# true = connect the web app to local emulators (works with localhost; see README for Codespaces)
VITE_USE_EMULATORS=false
# Show /styleguide in production builds (used by CI accessibility checks)
VITE_ENABLE_STYLEGUIDE=false
EOF
ok "Firebase config written"

# ------------------------------------------------------------ devcontainer + CI --
say "Writing devcontainer and CI workflow"

cat > .devcontainer/devcontainer.json <<'EOF'
{
  "name": "Tunas Pool",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "features": {
    "ghcr.io/devcontainers/features/java:1": { "version": "17", "installMaven": "false" }
  },
  "forwardPorts": [5173, 4000, 5000, 5001, 8080, 9099, 9199],
  "portsAttributes": {
    "5173": { "label": "Vite dev server" },
    "4000": { "label": "Emulator UI" },
    "5000": { "label": "Hosting emulator" },
    "8080": { "label": "Firestore emulator" },
    "9099": { "label": "Auth emulator" }
  },
  "postCreateCommand": "npm install && npm --prefix functions install",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "vitest.explorer"
      ]
    }
  }
}
EOF

cat > .github/workflows/ci.yml <<'EOF'
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            package-lock.json
            functions/package-lock.json
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - run: npm ci
      - run: npm --prefix functions ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run test:rules
      - run: npm run build
EOF
ok "Devcontainer and CI written"

# ------------------------------------------------------------------- shared types --
say "Writing shared types (from docs/DATA_MODEL.md)"
cat > shared/types.ts <<'EOF'
/**
 * Shared types for the web app and Cloud Functions.
 * Source of truth: docs/DATA_MODEL.md. Update both in the same commit.
 *
 * TimestampLike is structural so it matches both the client SDK Timestamp and
 * the Admin SDK Timestamp without importing either.
 */
export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
}

// ---- Enums -----------------------------------------------------------------
export type PaymentMethod = 'cash' | 'etransfer';
export type PaymentIntent = 'will_do' | 'already_did';
export type PaymentStatus = 'unpaid' | 'paid';
export type WeekStatus = 'draft' | 'open' | 'locked' | 'final';
export type EntrySource = 'web' | 'paper' | 'text' | 'phone';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type Pick = 'home' | 'away';
export type GameResult = 'home' | 'away' | 'tie';
export type PlayerOrigin = 'self' | 'admin';
export type GameSlot = 'sunday' | 'mnf';

export type AuditAction =
  | 'payment.set'
  | 'entry.adminUpsert'
  | 'entry.lateOverride'
  | 'entry.delete'
  | 'week.status'
  | 'week.results'
  | 'week.winnerPublished'
  | 'week.correction'
  | 'claim.approved'
  | 'claim.rejected'
  | 'claim.unlinked'
  | 'player.merged';

// ---- players/{playerId} ----------------------------------------------------
export interface Player {
  displayName: string;
  phone: string | null; // E.164, private
  email: string | null; // private
  claimedByUid: string | null; // never client-writable
  origin: PlayerOrigin;
  usualPayment: PaymentMethod | null;
  notes?: string | null; // admin-only
  mergedInto?: string | null;
  active: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface PlayerStats {
  weeksPlayed: number;
  wins: number;
  losses: number;
  weeklyTitles: number;
  bestWeekRecord: { wins: number; losses: number } | null;
  lastPlayedWeek: string | null;
  updatedAt: TimestampLike;
}

// ---- claims/{claimId} ------------------------------------------------------
export interface Claim {
  requesterUid: string;
  requesterEmail: string | null;
  claimedName: string;
  claimedPhone: string;
  status: ClaimStatus;
  suggestedPlayerId: string | null;
  resolvedPlayerId: string | null;
  decidedBy?: string;
  decidedAt?: TimestampLike;
  decisionNote?: string;
  createdAt: TimestampLike;
}

// ---- seasons/{year} --------------------------------------------------------
export interface Season {
  year: string;
  status: 'active' | 'archived';
  entryFeeCents: number;
  createdAt: TimestampLike;
}

export interface Game {
  id: string; // "g01".."g14", "mnf"
  order: number; // 1..15, matches the paper sheet
  away: string;
  home: string;
  venueNote?: string;
  kickoff: TimestampLike;
  slot: GameSlot;
}

export interface WeekWinner {
  playerIds: string[]; // more than one = split pot
  record: { wins: number; losses: number };
  mnfPrediction: number;
  potCents: number;
  publishedAt: TimestampLike;
}

export interface Week {
  weekNumber: number;
  status: WeekStatus;
  lockAt: TimestampLike;
  revealed: boolean;
  games: Game[];
  mnfGameId: string;
  results: Record<string, GameResult>;
  mnfTotal: number | null;
  entryFeeCents: number;
  winner: WeekWinner | null;
  payoutSent: boolean;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

// ---- entries ---------------------------------------------------------------
export interface Entry {
  playerId: string; // equals the document ID
  displayName: string;
  paymentMethod: PaymentMethod;
  paymentIntent: PaymentIntent;
  paymentStatus: PaymentStatus; // admin/functions only
  paidAt?: TimestampLike;
  paidBy?: string;
  enteredBy: 'self' | 'admin';
  source: EntrySource;
  paperPhotoPath: string | null;
  lateOverride: { reason: string; by: string; at: TimestampLike } | null;
  picksSubmittedAt: TimestampLike;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface EntryPicks {
  picks: Record<string, Pick>; // gameId -> pick, up to 15 keys
  tiebreakerTotal: number;
  updatedAt: TimestampLike;
}

// ---- derived / config ------------------------------------------------------
export interface Standing {
  displayName: string;
  weeksPlayed: number;
  wins: number;
  losses: number;
  weeklyTitles: number;
  weekRecords: Record<string, { wins: number; losses: number }>;
  updatedAt: TimestampLike;
}

export interface PoolConfig {
  entryFeeCents: number;
  etransferEmail: string;
  etransferInstructions: string;
  contactEmail: string;
  defaultLockRule: string; // e.g. "Saturday 23:59 America/Toronto"
  tieGameRule: 'no_win' | 'win_for_all' | 'half_win';
  unpaidEligibleToWin: boolean;
}

export interface AuditLogEntry {
  at: TimestampLike;
  actorUid: string;
  action: AuditAction;
  target: string; // document path
  before: unknown;
  after: unknown;
  reason?: string;
  year?: string;
  weekId?: string;
}
EOF
ok "shared/types.ts written"

# ------------------------------------------------------------------- web app src --
say "Writing web app source"

cat > src/vite-env.d.ts <<'EOF'
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_ENABLE_STYLEGUIDE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
EOF

cat > src/index.css <<'EOF'
/* Tokens first, then brand components, then Tailwind layers. See docs/DESIGN_SYSTEM.md §11. */
@import './styles/tokens.css';
@import './styles/brand.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF

cat > src/main.tsx <<'EOF'
import '@fontsource/alfa-slab-one';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './lib/queryClient';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
EOF

cat > src/App.tsx <<'EOF'
import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import AdminHome from './pages/AdminHome';
import Styleguide from './pages/Styleguide';
import NotFound from './pages/NotFound';

// The styleguide is visible in dev, and in builds where VITE_ENABLE_STYLEGUIDE=true (CI a11y checks).
const showStyleguide =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_STYLEGUIDE === 'true';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin/*" element={<AdminHome />} />
      {showStyleguide && <Route path="/styleguide" element={<Styleguide />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
EOF

cat > src/lib/queryClient.ts <<'EOF'
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
EOF

cat > src/lib/firebase.ts <<'EOF'
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

export const FUNCTIONS_REGION = 'northamerica-northeast1';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
export const storage = getStorage(app);

// Emulator wiring for localhost. NOTE: in a browser-based Codespace, localhost ports are not
// reachable from the browser tab unless you use VS Code desktop port forwarding. See README.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
EOF

cat > src/test/setup.ts <<'EOF'
import '@testing-library/jest-dom/vitest';
EOF

# ---- UI components (Sprint 0 set: Button, Panel, SectionBar, StatusBadge, Field) ----
cat > src/components/ui/Button.tsx <<'EOF'
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** One primary button per screen. Primary is gold with BLACK text (docs/DESIGN_SYSTEM.md §1.2). */
export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`btn btn-${variant} ${className}`.trim()} {...rest} />;
}
EOF

cat > src/components/ui/SectionBar.tsx <<'EOF'
import type { ReactNode } from 'react';

export function SectionBar({ children }: { children: ReactNode }) {
  return <h2 className="section-bar">{children}</h2>;
}
EOF

cat > src/components/ui/Panel.tsx <<'EOF'
import type { ReactNode } from 'react';

export interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title ? <h2 className="panel-title">{title}</h2> : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
EOF

cat > src/components/ui/StatusBadge.tsx <<'EOF'
const CONFIG = {
  paid: { label: 'Paid', className: 'badge-paid', icon: '✓' },
  unpaid: { label: 'Unpaid', className: 'badge-unpaid', icon: '' },
  pending: { label: 'Pending approval', className: 'badge-pending', icon: '' },
  open: { label: 'Open', className: 'badge-open', icon: '' },
  locked: { label: 'Locked', className: 'badge-locked', icon: '🔒' },
  final: { label: 'Final', className: 'badge-final', icon: '' },
  draft: { label: 'Draft', className: 'badge-draft', icon: '' },
} as const;

export type BadgeStatus = keyof typeof CONFIG;

/** Always a word (and often an icon), never color alone. */
export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { label, className, icon } = CONFIG[status];
  return (
    <span className={`badge ${className}`}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}
EOF

cat > src/components/ui/Field.tsx <<'EOF'
import { useId, type InputHTMLAttributes } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, id, className = '', ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={inputId}
        className={`field ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-body-sm font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
EOF

# ---- component tests ----
cat > src/components/ui/Button.test.tsx <<'EOF'
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders a primary button by default', () => {
    render(<Button>Submit picks</Button>);
    const btn = screen.getByRole('button', { name: 'Submit picks' });
    expect(btn).toHaveClass('btn', 'btn-primary');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('supports the secondary and ghost variants', () => {
    render(
      <>
        <Button variant="secondary">Edit</Button>
        <Button variant="ghost">Copy</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass('btn-secondary');
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveClass('btn-ghost');
  });
});
EOF

cat > src/components/ui/StatusBadge.test.tsx <<'EOF'
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('always shows a word, never color alone', () => {
    render(<StatusBadge status="paid" />);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('uses the locked style for locked weeks', () => {
    render(<StatusBadge status="locked" />);
    expect(screen.getByText('Locked').closest('span')).toHaveClass('badge-locked');
  });
});
EOF

cat > src/components/ui/Field.test.tsx <<'EOF'
import { render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  it('associates the label with the input', () => {
    render(<Field label="Phone" />);
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
  });

  it('announces errors and marks the input invalid', () => {
    render(<Field label="Phone" error="Phone number is too short." />);
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Phone number is too short.');
    expect(input.getAttribute('aria-describedby')).toContain('-error');
  });
});
EOF

# ---- pages ----
cat > src/pages/Home.tsx <<'EOF'
export default function Home() {
  return (
    <main className="bg-gameday min-h-screen px-4 pb-16 pt-10 text-center">
      <div className="mx-auto max-w-player">
        <h1 className="sr-only">Tunas Weekly Football Pool Pick 'Em</h1>
        <p className="wordmark text-wordmark" aria-hidden="true">
          Tunas
        </p>
        <p className="ribbon my-3 text-xl" aria-hidden="true">
          Weekly Football Pool
        </p>
        <p className="wordmark text-wordmark" aria-hidden="true">
          Pick&#8209;Em
        </p>
        <p className="mt-8 font-heading text-h3 text-ink-inverse">Entries are coming soon.</p>
      </div>
    </main>
  );
}
EOF

cat > src/pages/AdminHome.tsx <<'EOF'
import { Panel } from '../components/ui/Panel';

/** Back Office shell placeholder. Real admin lands in Sprint 3 (docs/PROJECT_PLAN.md). */
export default function AdminHome() {
  return (
    <main className="min-h-screen bg-page-backoffice px-4 py-8">
      <div className="mx-auto max-w-backoffice">
        <Panel title="Back Office">
          <p className="text-body text-ink-muted">
            The payments queue, week setup, and results screens arrive in Sprint 3.
          </p>
        </Panel>
      </div>
    </main>
  );
}
EOF

cat > src/pages/NotFound.tsx <<'EOF'
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-page-backoffice px-4 py-16 text-center">
      <h1 className="font-heading text-h1 text-purple-700">Page not found</h1>
      <p className="mt-2 text-body text-ink-muted">That link doesn't go anywhere.</p>
      <Link to="/" className="btn btn-secondary mt-6">
        Back to the pool
      </Link>
    </main>
  );
}
EOF

cat > src/pages/Styleguide.tsx <<'EOF'
import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { SectionBar } from '../components/ui/SectionBar';
import { StatusBadge, type BadgeStatus } from '../components/ui/StatusBadge';

const STATUSES: BadgeStatus[] = ['paid', 'unpaid', 'pending', 'draft', 'open', 'locked', 'final'];

const SWATCHES: Array<{ name: string; className: string; hex: string }> = [
  { name: 'Ravens purple', className: 'bg-purple-700', hex: '#241773' },
  { name: 'Black', className: 'bg-black', hex: '#000000' },
  { name: 'Metallic gold', className: 'bg-gold-600', hex: '#9E7C0C' },
  { name: 'UI gold', className: 'bg-gold-400', hex: '#D9AF26' },
  { name: 'Ravens red', className: 'bg-red-700', hex: '#C60C30' },
];

/** Dev-only component gallery. Every new UI component gets an entry here (CLAUDE.md §5). */
export default function Styleguide() {
  const [pick, setPick] = useState<'away' | 'home' | null>('home');

  return (
    <div className="min-h-screen bg-page-backoffice">
      <header className="bg-gameday px-4 pb-14 pt-10 text-center">
        <p className="wordmark text-wordmark" aria-hidden="true">
          Tunas
        </p>
        <p className="ribbon my-3 text-xl" aria-hidden="true">
          Weekly Football Pool
        </p>
        <h1 className="font-heading text-h2 italic text-ink-inverse">Styleguide</h1>
      </header>

      <main className="mx-auto flex max-w-player flex-col gap-8 px-4 py-8">
        <section aria-labelledby="sg-colors">
          <h2 id="sg-colors" className="mb-3 font-heading text-h2 italic">
            Brand colors
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {SWATCHES.map((s) => (
              <li key={s.name} className="overflow-hidden rounded-md border-2 border-line-subtle bg-surface">
                <div className={`h-14 ${s.className}`} />
                <p className="px-2 pt-1 font-heading text-h3">{s.name}</p>
                <p className="px-2 pb-2 text-body-sm text-ink-muted">{s.hex}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="sg-buttons">
          <h2 id="sg-buttons" className="mb-3 font-heading text-h2 italic">
            Buttons
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button>Submit picks</Button>
            <Button variant="secondary">Edit picks</Button>
            <Button variant="ghost">Copy email</Button>
            <Button disabled>2 games left</Button>
          </div>
        </section>

        <section aria-labelledby="sg-panels">
          <h2 id="sg-panels" className="mb-3 font-heading text-h2 italic">
            Panel and section bar
          </h2>
          <div className="panel">
            <SectionBar>Sunday games</SectionBar>
            <p className="p-4 text-body">Colts at Commanders (London)</p>
          </div>
          <div className="mt-4">
            <Panel title="How to play">
              <p className="text-body">
                Pick one team to win every game. <span className="emphasis">No picks can be changed after lock.</span>
              </p>
            </Panel>
          </div>
        </section>

        <section aria-labelledby="sg-pick">
          <h2 id="sg-pick" className="mb-3 font-heading text-h2 italic">
            Pick buttons
          </h2>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <button
              type="button"
              className="pick"
              aria-pressed={pick === 'away'}
              onClick={() => setPick(pick === 'away' ? null : 'away')}
            >
              Colts
            </button>
            <span className="font-heading text-ink-muted">at</span>
            <button
              type="button"
              className="pick"
              aria-pressed={pick === 'home'}
              onClick={() => setPick(pick === 'home' ? null : 'home')}
            >
              Commanders
            </button>
          </div>
        </section>

        <section aria-labelledby="sg-badges">
          <h2 id="sg-badges" className="mb-3 font-heading text-h2 italic">
            Status badges
          </h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </section>

        <section aria-labelledby="sg-fields">
          <h2 id="sg-fields" className="mb-3 font-heading text-h2 italic">
            Fields
          </h2>
          <div className="flex flex-col gap-4">
            <Field label="Name" defaultValue="Alex R." autoComplete="name" />
            <Field
              label="Phone"
              inputMode="tel"
              defaultValue="613 555"
              error="Phone number is too short. Enter all 10 digits."
            />
          </div>
        </section>
      </main>
    </div>
  );
}
EOF
ok "Web app source written"

# ---------------------------------------------------------------- admin script --
cat > scripts/set-admin-claim.ts <<'EOF'
/**
 * One-off: grant the admin custom claim to a Firebase Auth user.
 *   npm run admin:claim -- <uid>
 * Needs credentials: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (never commit the key),
 * or run against the Auth emulator with FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099.
 * The user must sign out and back in to pick up the claim.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: npm run admin:claim -- <uid>');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-tunas-pool',
});

await getAuth().setCustomUserClaims(uid, { admin: true });
console.log(`Admin claim set for ${uid}. Sign out and back in to refresh the token.`);
EOF

# ---------------------------------------------------------------- rules tests --
say "Writing starter rules tests (docs/FIRESTORE_RULES.md test matrix)"
cat > tests/rules/firestore.rules.test.ts <<'EOF'
/**
 * Starter subset of the test matrix in docs/FIRESTORE_RULES.md §5.
 * Run with: npm run test:rules   (starts the Firestore emulator, needs Java)
 * Matrix row numbers are noted in each test name. Add the remaining rows in Sprint 1.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-tunas-pool';
const YEAR = '2026';
const OPEN_WEEK = 'wk04'; // open, lockAt in the future
const LOCKED_WEEK = 'wk03'; // locked, lockAt in the past
const REVEALED_WEEK = 'wk02'; // locked + revealed

const hoursFromNow = (h: number) => Timestamp.fromMillis(Date.now() + h * 60 * 60 * 1000);
const weekPath = (w: string) => `seasons/${YEAR}/weeks/${w}`;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const baseWeek = { games: [], results: {}, mnfTotal: null, winner: null, payoutSent: false };
    await setDoc(doc(db, weekPath(OPEN_WEEK)), {
      ...baseWeek, status: 'open', lockAt: hoursFromNow(24), revealed: false,
    });
    await setDoc(doc(db, weekPath(LOCKED_WEEK)), {
      ...baseWeek, status: 'locked', lockAt: hoursFromNow(-24), revealed: false,
    });
    await setDoc(doc(db, weekPath(REVEALED_WEEK)), {
      ...baseWeek, status: 'locked', lockAt: hoursFromNow(-48), revealed: true,
    });
    // Roster/self profile p1 is owned by alice
    await setDoc(doc(db, 'players/p1'), {
      displayName: 'Alice A.', phone: '+16135550101', email: null, claimedByUid: 'alice',
      origin: 'self', usualPayment: null, active: true,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    // An entry with private picks, in the open week and the revealed week
    for (const w of [OPEN_WEEK, REVEALED_WEEK]) {
      await setDoc(doc(db, `${weekPath(w)}/entries/p1`), entryData('p1'));
      await setDoc(doc(db, `${weekPath(w)}/entries/p1/private/picks`), {
        picks: { g01: 'home' }, tiebreakerTotal: 45, updatedAt: Timestamp.now(),
      });
    }
  });
});

function entryData(playerId: string, overrides: Record<string, unknown> = {}) {
  return {
    playerId,
    displayName: 'Alice A.',
    paymentMethod: 'etransfer',
    paymentIntent: 'will_do',
    paymentStatus: 'unpaid',
    enteredBy: 'self',
    source: 'web',
    paperPhotoPath: null,
    lateOverride: null,
    picksSubmittedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

describe('players', () => {
  it('#1 a guest can create their own profile (playerId == uid)', async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'players/carol'), {
        displayName: 'Carol C.', phone: null, email: null, claimedByUid: 'carol',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      }),
    );
  });

  it("#2 a guest cannot create someone else's profile", async () => {
    const db = env.authenticatedContext('carol').firestore();
    await assertFails(
      setDoc(doc(db, 'players/dave'), {
        displayName: 'Dave D.', phone: null, email: null, claimedByUid: 'carol',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      }),
    );
  });

  it('#4 the owner cannot change claimedByUid', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'players/p1'), { claimedByUid: 'mallory' }, { merge: true }));
  });

  it('#5 only the owner (or admin) can read a profile', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), 'players/p1')));
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'players/p1')));
  });
});

describe('entries and the lockout', () => {
  it('#9 the owner can create an entry while the week is open', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `players/p2`), {
        displayName: 'Bob B.', phone: null, email: null, claimedByUid: 'bob',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
    });
    const db = env.authenticatedContext('bob').firestore();
    await assertSucceeds(setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p2`), entryData('p2', { displayName: 'Bob B.' })));
  });

  it('#10 the owner cannot create an entry after lockAt', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `players/p2`), {
        displayName: 'Bob B.', phone: null, email: null, claimedByUid: 'bob',
        origin: 'self', usualPayment: null, active: true,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
    });
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(db, `${weekPath(LOCKED_WEEK)}/entries/p2`), entryData('p2', { displayName: 'Bob B.' })));
  });

  it("#12 the owner cannot mark their own entry paid", async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, `${weekPath(OPEN_WEEK)}/entries/p1`), entryData('p1', { paymentStatus: 'paid' })),
    );
  });

  it('#17 the owner cannot write picks after lock', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, `${weekPath(LOCKED_WEEK)}/entries/p1/private/picks`), {
        picks: { g01: 'away' }, tiebreakerTotal: 40, updatedAt: Timestamp.now(),
      }),
    );
  });
});

describe('hidden picks', () => {
  const picksPath = (w: string) => `${weekPath(w)}/entries/p1/private/picks`;

  it('#20 other players cannot read picks before reveal', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), picksPath(OPEN_WEEK))));
  });

  it('#21 other players can read picks once the week is revealed', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('bob').firestore(), picksPath(REVEALED_WEEK))));
  });

  it('#22 the owner and admin can read picks before reveal', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), picksPath(OPEN_WEEK))));
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('boss', { admin: true }).firestore(), picksPath(OPEN_WEEK))),
    );
  });
});

describe('locked-down collections', () => {
  it('#23 clients cannot write claims directly', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'claims/c1'), { requesterUid: 'alice', status: 'pending' }));
  });

  it('#25 clients cannot write auditLog or standings', async () => {
    const db = env.authenticatedContext('boss', { admin: true }).firestore();
    await assertFails(setDoc(doc(db, 'auditLog/a1'), { action: 'payment.set' }));
    await assertFails(setDoc(doc(db, `seasons/${YEAR}/standings/p1`), { wins: 99 }));
  });

  it('#26 admin can read the audit log; players cannot', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('boss', { admin: true }).firestore(), 'auditLog/a1')));
    await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'auditLog/a1')));
  });

  it('#31 unauthenticated users cannot read or write anything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, weekPath(OPEN_WEEK))));
    await assertFails(setDoc(doc(db, 'players/x'), { displayName: 'x' }));
  });
});
EOF
ok "Starter rules tests written"

# --------------------------------------------------------- Cloud Functions package --
say "Writing Cloud Functions package"

cat > functions/package.json <<'EOF'
{
  "name": "functions",
  "private": true,
  "main": "lib/functions/src/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch"
  }
}
EOF

cat > functions/tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "lib",
    "rootDir": "..",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src", "../shared"]
}
EOF

cat > functions/.gitignore <<'EOF'
node_modules
lib
*.local
EOF

cat > functions/src/index.ts <<'EOF'
/**
 * Cloud Functions entry. Contracts live in docs/DATA_MODEL.md §5.
 * Every function below is a STUB that enforces auth and then throws "unimplemented".
 * Implement them in the sprint noted in docs/PROJECT_PLAN.md. Admin-sensitive writes must
 * also write auditLog (CLAUDE.md principle 5).
 * Shared types: import type { ... } from '../../shared/types'
 */
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
setGlobalOptions({ region: 'northamerica-northeast1', maxInstances: 10 });

function requireAdmin(req: CallableRequest): void {
  if (req.auth?.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
}

function requireSignedIn(req: CallableRequest): void {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
}

function notImplemented(name: string): never {
  throw new HttpsError('unimplemented', `${name} is not implemented yet (see docs/PROJECT_PLAN.md).`);
}

const adminStub = (name: string) =>
  onCall(async (req) => {
    requireAdmin(req);
    return notImplemented(name);
  });

// ---- Admin callables (Sprints 1-5) ------------------------------------------
export const adminSetPayment = adminStub('adminSetPayment');
export const adminUpsertEntry = adminStub('adminUpsertEntry');
export const adminLateOverride = adminStub('adminLateOverride');
export const adminDeleteEntry = adminStub('adminDeleteEntry');
export const adminSetWeekStatus = adminStub('adminSetWeekStatus');
export const adminEnterResults = adminStub('adminEnterResults');
export const adminPublishWinner = adminStub('adminPublishWinner');
export const adminMarkPayout = adminStub('adminMarkPayout');
export const adminListClaims = adminStub('adminListClaims');
export const adminApproveClaim = adminStub('adminApproveClaim');
export const adminRejectClaim = adminStub('adminRejectClaim');
export const adminUnlinkClaim = adminStub('adminUnlinkClaim');
export const adminMergePlayers = adminStub('adminMergePlayers');
export const getDuplicateFlags = adminStub('getDuplicateFlags');

// ---- Player callable (Sprint 5) ---------------------------------------------
export const requestClaim = onCall(async (req) => {
  requireSignedIn(req);
  return notImplemented('requestClaim');
});

// ---- Scheduled (Sprint 3): at lockAt set status='locked' and revealed=true ----
export const lockWeeks = onSchedule(
  { schedule: 'every 1 minutes', timeZone: 'America/Toronto' },
  async () => {
    // TODO(Sprint 3): find open weeks where lockAt <= now, lock them, set revealed=true,
    // and write an auditLog entry. Consider a slower cadence outside Saturday night.
  },
);
EOF
ok "Functions package written"

# ----------------------------------------------------------- project tracking docs --
say "Writing ACTIVE_CYCLE.md, DECISIONS.md, README.md"

cat > docs/ACTIVE_CYCLE.md <<'EOF'
# ACTIVE_CYCLE.md

**Sprint 0: Project setup** · Phase 0 (Foundation) · Started: October 2026

## Goal
Repo, emulators, CI, docs, rules skeleton, and the design system foundation running end to end.

## Tasks
- [x] Scaffold Vite + React 19 + TypeScript strict + Tailwind v3 + TanStack Query (`scaffold.sh`)
- [x] Docs in place: CLAUDE.md, DATA_MODEL, FIRESTORE_RULES, DESIGN_SYSTEM, PERSONAS, PROJECT_PLAN
- [x] Design tokens, brand CSS, Tailwind preset, self-hosted fonts (Fontsource)
- [x] `/styleguide` route: Button, Panel, SectionBar, StatusBadge, Field, pick button
- [x] Shared types package from DATA_MODEL (`shared/types.ts`)
- [x] `firestore.rules` + `storage.rules` extracted from FIRESTORE_RULES.md
- [x] Starter rules tests (matrix rows 1, 2, 4, 5, 9, 10, 12, 17, 20-23, 25, 26, 31)
- [x] Cloud Functions stubs for every callable in DATA_MODEL §5
- [x] CI workflow (typecheck, lint, unit tests, rules tests, build)
- [ ] Create the Firebase project (Firestore in Montreal or Toronto) and enable Auth providers
- [ ] `firebase use --add`, fill `.env.local`, deploy hello-world to Hosting
- [ ] Confirm `npm run test:rules` passes in the Codespace (needs Java; first run downloads the emulator)
- [ ] Add an axe accessibility check against `/styleguide` in CI
- [ ] Verify fonts render (Alfa Slab One, Barlow Condensed, Barlow) and check the styleguide at 375px
- [ ] Obtain the Tuna mascot artwork (Ravens palette, no NFL marks): DESIGN_SYSTEM §10
- [ ] Confirm the open decisions in DECISIONS.md with the commissioner

## Acceptance (from PROJECT_PLAN.md)
`npm run emulators`, `dev`, `test`, `test:rules`, and `typecheck` all run clean. A hello-world is live on Hosting.

## Notes / learned
- (add as you go)
EOF

cat > docs/DECISIONS.md <<'EOF'
# DECISIONS.md

ADR-style log. Add an entry for every non-obvious decision. Status: **Accepted** (settled) or **Provisional** (default applied, needs confirmation from the commissioner).

| ID | Date | Decision | Status |
| --- | --- | --- | --- |
| D-001 | 2026-10-04 | Entry document ID = `playerId`, enforcing one set of picks per person per week | Accepted |
| D-002 | 2026-10-04 | Self-serve `playerId` = the player's first `uid`; roster profiles use generated IDs | Accepted |
| D-003 | 2026-10-04 | Audited admin actions go through callable Cloud Functions; clients never write `paymentStatus`, `claimedByUid`, `revealed`, standings, or auditLog | Accepted |
| D-004 | 2026-10-04 | Every claim requires admin approval in v1 (no auto-claim) | Accepted |
| D-005 | 2026-10-04 | Design palette is Baltimore Ravens (purple `#241773`, black, gold, red for urgency only) on the paper sheet's layout language | Accepted |
| D-006 | 2026-10-04 | Use brighter UI gold `#D9AF26` (black text) for buttons; official gold `#9E7C0C` only for large text and graphics (3.9:1 on white) | Provisional |
| D-007 | 2026-10-04 | Fonts: Alfa Slab One (wordmark), Barlow Condensed (headings), Barlow (body), self-hosted via Fontsource | Provisional (confirm vs original artwork) |
| D-008 | 2026-10-04 | Tied NFL game: no one gets a win | Provisional |
| D-009 | 2026-10-04 | Only paid entries are eligible to win | Provisional |
| D-010 | 2026-10-04 | Tiebreaker among entries at or above the MNF total: lowest prediction wins | Provisional (confirm against how the pool has been run) |
| D-011 | 2026-10-04 | Default lock time Saturday 11:59 PM America/Toronto, editable per week | Provisional |
| D-012 | 2026-10-04 | Cloud Functions region `northamerica-northeast1` (Montreal); create Firestore in Montreal or Toronto | Accepted |
| D-013 | 2026-10-04 | Local emulators use the `demo-tunas-pool` project id so no real Firebase login is needed for dev and tests | Accepted |
| D-014 | 2026-10-04 | Ravens red `#C60C30` kept for urgency and errors only; revisit if the commissioner prefers purple, black, and gold only | Provisional |

## Open (no default yet)
- Legal and regulatory check for running the pool (blocks public launch)
- e-Transfer address for `config/pool`
- How US-side players pay and receive winnings (see docs/PERSONAS.md §6)
- Age attestation wording and legal age to use
- Which spec changes from PERSONAS.md §6 "Spec Impact Log" to adopt
EOF

cat > README.md <<'EOF'
# Tunas Weekly Football Pool Pick 'Em

Mobile-first web app replacing the paper weekly NFL pick'em sheet. React 19 + Vite + TypeScript (strict) + Tailwind v3 + Firebase (Firestore, Auth, Functions, Hosting, Storage).

Start with **CLAUDE.md**, then `docs/`:

| Doc | What it covers |
| --- | --- |
| `docs/PROJECT_PLAN.md` | Phases, sprints, acceptance criteria, open decisions |
| `docs/ACTIVE_CYCLE.md` | Current sprint status |
| `docs/DECISIONS.md` | Decision log |
| `docs/DATA_MODEL.md` | Collections, fields, scoring, Cloud Function contracts |
| `docs/FIRESTORE_RULES.md` | Security rules, rationale, test matrix |
| `docs/DESIGN_SYSTEM.md` | Ravens palette, type, components, accessibility |
| `docs/PERSONAS.md` | Personas and the persona tests every feature must pass |

## Quick start

```bash
npm install && npm --prefix functions install
npm run dev            # http://localhost:5173 (forwarded automatically in Codespaces)
# open /styleguide to see every component
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `tsc` for the web app and Cloud Functions |
| `npm run lint` | ESLint |
| `npm test` | Unit and component tests (Vitest + Testing Library) |
| `npm run test:rules` | Firestore rules tests in the emulator (needs Java) |
| `npm run emulators` | Firebase emulators (Auth, Firestore, Functions, Hosting, Storage, UI) |
| `npm run admin:claim -- <uid>` | Grant the admin custom claim (needs credentials) |

## Firebase setup (one time)

1. Create a Firebase project. Create Firestore in **Montreal (`northamerica-northeast1`) or Toronto**, and enable Storage.
2. Authentication: enable **Anonymous**, **Google**, and **Email link (passwordless)**.
3. Add a Web app and copy its config into `.env.local` (see `.env.example`).
4. In the terminal: `npx firebase login --no-localhost`, then `npx firebase use --add`.
5. Deploy: `npm run build && npx firebase deploy --only hosting,firestore:rules,firestore:indexes`.
6. Cloud Functions and the scheduler need the Blaze (pay-as-you-go) plan.

### Emulators in Codespaces
Rules tests (`npm run test:rules`) run entirely inside the Codespace. Pointing the *browser* app at the emulators
(`VITE_USE_EMULATORS=true`) uses `127.0.0.1`, which works with VS Code desktop port forwarding but is not verified
for browser-based Codespaces. If it fails there, develop against a real dev Firebase project instead.

## Conventions
See `CLAUDE.md`. Short version: `playerId` is permanent identity, picks are private until reveal, the server enforces
the lockout, audited actions go through callables, and no hard-coded hex values (use the tokens).
EOF
ok "Project docs written"

# ------------------------------------------------------------------ npm install --
say "Installing web dependencies (this takes a minute or two)"
npm install --no-audit --no-fund \
  react@^19 react-dom@^19 react-router-dom @tanstack/react-query firebase lucide-react zod \
  @fontsource/alfa-slab-one @fontsource/barlow @fontsource/barlow-condensed

npm install --no-audit --no-fund -D \
  typescript@^5 vite @vitejs/plugin-react tailwindcss@^3 postcss autoprefixer \
  vitest jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event \
  @firebase/rules-unit-testing firebase-tools firebase-admin tsx \
  eslint@^9 @eslint/js@^9 typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals prettier \
  @types/react @types/react-dom @types/node
ok "Web dependencies installed"

say "Installing Cloud Functions dependencies"
( cd functions && npm install --no-audit --no-fund firebase-admin firebase-functions \
  && npm install --no-audit --no-fund -D typescript@^5 @types/node )
ok "Functions dependencies installed"

# ------------------------------------------------------------------ verification --
RESULTS=()
check() { # check <label> <command...>
  local label="$1"; shift
  printf '\n  → %s\n' "$label"
  if "$@" >/tmp/tunas-check.log 2>&1; then
    RESULTS+=("PASS  $label"); ok "$label"
  else
    RESULTS+=("FAIL  $label"); warn "$label failed. Last lines:"; tail -n 15 /tmp/tunas-check.log | sed 's/^/      /'
  fi
}

if [ "$SKIP_VERIFY" != "1" ]; then
  say "Verifying the scaffold"
  check "typecheck (web + functions)" npm run typecheck
  check "lint"                        npm run lint
  check "unit tests"                  npm test
  check "production build"            npm run build
  if command -v java >/dev/null 2>&1; then
    check "rules tests (Firestore emulator)" npm run test:rules
  else
    RESULTS+=("SKIP  rules tests (Java not installed)")
  fi

  say "Summary"
  for r in "${RESULTS[@]}"; do echo "  $r"; done
fi

# ------------------------------------------------------------------- next steps --
say "Done. Next steps"
cat <<EOF

  1. Try it:            npm run dev        then open the forwarded port, and visit /styleguide
  2. Commit the scaffold:
         git add -A
         git commit -m "chore: Sprint 0 scaffold (Vite, React 19, Tailwind, Firebase, Ravens design system)"
         git push
  3. Firebase setup:    follow the "Firebase setup" section in README.md
                        (project id currently set to: $FIREBASE_PROJECT)
  4. Open docs/ACTIVE_CYCLE.md for the remaining Sprint 0 tasks.
  5. Start Claude Code in this repo: it will read CLAUDE.md first.

  You can delete the _drop/ folder and scaffold.sh once everything is committed
  (_drop is git-ignored).
EOF
