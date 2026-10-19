# Tunas Pool: 4-Phase Deep Review

Read-only review, 2026-10-19. No repository files were modified. Evidence is from `package.json`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `functions/src/index.ts`, `src/lib/*`, `src/features/*/…Data.ts`, `dist/assets`, and the docs. Competitor facts in Phase 2 are from general knowledge and were **not re-verified online today**.

> [!NOTE]
> Not run: the test suites, `npm run build`, Lighthouse, or the smoke run. Sizes below come from the existing `dist/` folder, which may be older than the current source (its folder dates are Oct 5).

---

## Phase 1: Codebase and architecture audit

### 1.1 Stack as found

| Layer | Found | Notes |
|---|---|---|
| UI | React 19.3, Vite 8, TS 5.9 `strict` plus `noUnusedLocals/Parameters` | Matches CLAUDE.md §2 |
| Routing | `react-router-dom` 7 in declarative mode (`<BrowserRouter>`, `<Routes>`) | Every page is `React.lazy` in `src/App.tsx` |
| State | TanStack Query 5 (`staleTime` 30 s, `retry` 1, no focus refetch) plus two React contexts (`authContext`, `toastContext`) | No Zustand or Redux, which is appropriate here |
| Backend | 26 `onCall` functions, 2nd gen, `maxInstances: 10`, Node 22, named DB `db-tunaspool` | Audit written in transactions |
| Styling | Tailwind 3.4 with the default palette removed and a token preset | |
| CI | typecheck, lint, vitest, rules tests, build, axe on `/styleguide`, then auto-deploy to prod on `main` | 47 unit test files, 6 integration test files, one rules file, one a11y spec |
| Size | about 24.7k lines of TS/TSX across `src`, `shared`, `functions/src`. About 87 commits. | |

**Strengths.** The architecture is unusually disciplined for its size:
- Identity (`playerId`) is separate from login (`uid`).
- The server enforces the lockout in rules (`weekIsOpen`, `request.time`).
- Picks live in a separate doc that is private until `revealed`.
- Derived data is function-written only.
- There are zero `any` in non-test source.
- Docs and rules agree: `firestore.rules` and `storage.rules` match their doc blocks exactly (verified earlier today).

### 1.2 React 19 primitives

| Primitive | Usage | Verdict |
|---|---|---|
| `useActionState`, `useOptimistic`, `useFormStatus`, `use()` | **Not used anywhere** | Not a defect. Forms use manual state plus TanStack mutations. An opportunity (see below). |
| `lazy` and `Suspense` | Used for every route | Good |
| `useTransition` | Not used | Minor |
| Server components | N/A (Vite SPA) | Correct |
| `eslint-plugin-react-hooks` 7 | Installed | Gives React Compiler-era lint rules. No compiler is configured, and none is needed yet. |

No React 19 compatibility problems were found. Libraries are current (`@testing-library/react` 16, `@types/react` 19).

**Where React 19 would help.**
- **Pick entry and payment form (Dale test):** `useOptimistic` for the receipt, `useActionState` plus `useFormStatus` to remove hand-rolled pending/error state.
- **Admin one-tap actions (Commissioner test):** these are mutation-plus-undo flows, a natural fit for `useOptimistic` with rollback.

### 1.3 Firebase integration

**Reads.**
- Everything is `getDoc/getDocs` through TanStack Query. **There is no `onSnapshot` anywhere in `src`.** CLAUDE.md §2 says "`onSnapshot` where real-time matters"; the code polls instead (`refetchInterval` 60 s on admin queues and on the locked-week page). Doc and code disagree. Flag it, then either record the decision (polling chosen on purpose, which also removes listener-cleanup risk) or add a listener on the live leaderboard.
- **Read amplification in `useRevealEntries`** (`src/features/leaderboard/revealData.ts`): one `getDocs` of all entries, then one `getDoc(private/picks)` **per entry**. 35 to 50 players means 36 to 51 reads per viewer per open, and the cache is 5 minutes. With 50 players and 50 viewers, that is about 2,500 reads per week-open, repeated per player on every cold load. Fine at this scale, but it is the first thing that will not scale.
- No offline persistence: `getFirestore(app, id)` is used rather than `initializeFirestore(... persistentLocalCache ...)`. Drafts are kept in `localStorage` for pick entry (`entry/draft.ts`) and admin sheets, which covers the most important case.
- Auth persistence is explicit (`indexedDB` then `localStorage` then `session`). Good for in-app browsers.

**Writes.**
- Player entry is **two separate writes** (public `entries/{id}` and `private/picks`), plus a third for `payment/current`. The rules validate each, but nothing makes them atomic. A dropped connection can leave an entry with no picks, or picks with no entry. Use a `writeBatch` (rules can read the other doc with `getAfter`), or a callable.
- The `private/picks` rule checks `picks is map`, `size() <= 15` and the tiebreaker range, but **not that keys are valid game ids or that values are one of the two teams**. A hand-made client can store junk picks. Impact is low (scoring ignores unknown keys, and the owner only hurts themselves), but it is cheap to tighten with `get()` on the week's game list or by validating in a trigger.

**Security.**
- **No Firebase App Check.** Anonymous Auth is the default, so anyone who finds the project's web config can mint unlimited anonymous users. Each can create a `players/{uid}` doc and an entry, and read all signed-in collections (entries, standings, config, seasons). Unpaid entries cannot win, so there is no money risk, but there is a cost and noise risk and the project is **shared with other apps** (CLAUDE.md §6).
- Read scope is otherwise tight: `players` PII is owner/admin, `auditLog` is admin only, `payment/current` is owner/admin, picks are open only after `revealed`.
- Callables use `requireAdmin` on custom claims, and a separate `counter` claim has its own narrow set.
- The only client-side `fetch` to a third party is the **ESPN public scoreboard** (`src/lib/scoresFeed.ts`). It is fault-tolerant by design and sends only two dates. It does mean every viewer hits ESPN directly; a cached server copy would reduce that.

**Indexes.** Five composite indexes, all matched to queries seen (`weeks` by status and weekNumber, `claims` by status and createdAt, `payment` collection group). No missing-index risk was found.

**Rate limiting.** Only the client-error reporter has a limiter (`createRateLimit`). It is **per function instance and in-memory**, so it resets on cold starts and does not coordinate across the 10 instances. Other callables rely on auth plus domain checks (`requestClaim` has "who may ask and how often" in `shared/claims.ts`).

### 1.4 Health, performance, accessibility

| Area | Finding |
|---|---|
| Bundle (existing `dist/`) | `firebase-*.js` is **558 KB raw** (about 160 KB gzipped per the sprint notes) and the app chunk is 330 KB raw. Images are `.webp` (60 to 82 KB each), fonts are `woff2`. Lighthouse mobile was 53, now 74 to 78, target 90 (open in ACTIVE_CYCLE). |
| Dependencies | Lean: 10 runtime dependencies. `zod` 4 and `lucide-react` are the only optional-weight items. No obviously redundant or legacy package. `firebase-admin` is in the root dev deps for scripts, which is fine. |
| Caching | Sensible `staleTime` per query. Admin queues poll at 60 s and pause when hidden. |
| Re-renders | No profiler evidence either way. The per-entry picks array on the reveal page is the likeliest hotspot at 50+ rows. |
| Accessibility | A strong spot: axe on `/styleguide` in CI, WCAG 2.2 AA on 25 screens plus Extra-large text in the smoke run, 48 px targets, two-tone focus ring, never color alone. |
| Error handling | Error boundary in `main.tsx`, and uncaught errors go to a `reportClientError` callable (path only, no query string or picks). |
| Tests | 47 unit, 6 integration, 1 rules file. The long e2e flows are parked by decision (D-066). The weak spot is that **rules tests are a single file** and the smoke run is not in CI. |
| Process | CI auto-deploys production on merge. The 2026-10-05 retro notes a deploy was done by hand when GitHub runners failed. |

---

## Phase 2: Domain and benchmarks

### 2.1 What it is

A **private, season-long NFL weekly pick'em pool** with real money ($20 entry, pot is paid entries times $20, best record wins, Monday-night total points breaks ties). It replaces a paper sheet handed in at a shop and picks sent by text.

- **Personas:** ten documented, including Rosalie (never touches a screen), Dale (11:40 PM Saturday, one thumb), Gerald (needs to verify fairness), the Commissioner (Ryan, one-handed at the counter), Devon (counter role), plus three anti-personas (Double-Dipper, Late Pick Lobbyist, Snoop).
- **Workflows:** pick 14 or 15 games plus a tiebreaker, declare cash or e-Transfer, lockout, reveal, results, standings, winner, payout record, claims of roster profiles, merges, paper entry, spreadsheet import, season archive.
- **Business model:** none. A community pool run by one commissioner. Online payment processing is explicitly out of scope, which keeps it clear of payment-processor and gambling-platform regulation (a legal check is still open in DECISIONS).

### 2.2 Competitive landscape (from general knowledge, verify before relying on it)

| Product | Type | What leaders do |
|---|---|---|
| ESPN Pigskin Pick'Em / NFL Pick'Em | Free, national, public or group | Mobile apps, confidence points, push reminders, live scoring, pick percentages |
| Yahoo Fantasy Pick'em | Free | Same, with deep Yahoo account integration |
| CBS Sports Pick'em / Office pools | Free or paid-tier | Commissioner tools, custom scoring, email reminders |
| Splash Sports | Paid-entry contests | Real-money handling, KYC, payouts, promos |
| Hosted-pool tools (e.g. OfficeFootballPool, Pool Host style sites) | Commissioner-run | Pool management, auto-pick, email blasts, printable sheets |

**Category-leader expectations:** installable app or PWA, push or email reminders before lock, live scores, auto-scoring, confidence points or spreads, pick-distribution percentages, a chat or trash-talk surface, auto-pick for missed entries, and commissioner admin with bulk tools.

---

## Phase 3: Competitive gap analysis

| Capability | Typical leaders | Tunas Pool | Position |
|---|---|---|---|
| Pick entry UX | Fast, game-by-game | Mobile-first, drafts saved, 48 px targets | Meets |
| Auto-scoring and results | Live from data provider | Commissioner enters; ESPN scores shown **unofficially**, saved result always wins | Intentional trade (trust over speed) |
| Paper and phone players | Rare or none | Roster profiles, paper entry in sheet order, photo kept, spreadsheet import, counter role | **Exceeds** |
| Auditability | Weak | Every sensitive action writes an audit entry; plain-words log in the Back Office; "How this was decided" | **Exceeds** |
| Fairness and privacy | Varies | Server lockout, picks private until reveal, PII to owner/admin only | **Exceeds** |
| Accessibility | Mixed | AA checked on 25 screens plus Extra-large text | **Exceeds** |
| Reminders | Push and email | Commissioner taps a prefilled `sms:` link; the Saturday email is parked (D-079) | Falls short |
| Live updates | Real-time | Polling only (60 s while locked) | Falls short |
| PWA, install, offline | Native apps | No manifest, no service worker, no Firestore persistence; only a `theme-color` meta and an apple-touch-icon | Falls short |
| Social | Chat, leagues | Share card without picks; nothing else (deliberate privacy stance) | Different on purpose |
| Money | Integrated payouts | Cash and e-Transfer recorded, never processed | Different on purpose |
| Export and import | CSV | Season export, two CSV reports, spreadsheet import of picks | Meets |

### UX and workflow friction
1. **Onboarding:** anonymous by default (good), but linking to a roster profile needs admin approval (policy, §8). Fine for trust, a bottleneck on the commissioner. The claims queue is the main manual load.
2. **No install path:** players open a link every Saturday night. A PWA with an icon and web push would cut Dale's steps. Push is out of v1 scope (CLAUDE.md §10), so a manifest plus offline shell is the in-scope slice.
3. **Weak signal:** drafts are local, but a submit with no connection needs the SDK's offline write queue (not enabled) to finish after reconnection.
4. **Paper entry is still the commissioner's biggest chore** (a minute per sheet, 15 taps). The sheet photo is already stored, so it is the most natural place for AI help (Phase 4).

### Architecture and scalability gaps
- **Read amplification:** `useRevealEntries` (N+1) and `claimsData` (walks all seasons, then reads per season). Fix by denormalising the revealed picks into one function-written `weeks/{id}/reveal` doc at reveal time.
- **Non-atomic three-doc entry write** (above).
- **No App Check; per-instance limiter only.**
- **Observability:** client errors go to the functions log, but there are no alerts, no uptime check, and no dashboard. The retro already notes production error reporting is "not verified".
- **Backups:** scheduled backups and delete protection for `db-tunaspool` are still unchecked in ACTIVE_CYCLE (D-089). This is the biggest operational risk in the repo.
- **CI gap:** the smoke run (the only whole-app browser check) is not in CI, and a week-page bug shipped to production once because no screen was opened.
- **Shared project:** hosting, functions and DB are pinned to named targets, which is good. Storage is not auto-deployed.

---

## Phase 4: Applied AI blueprint

> [!IMPORTANT]
> **Guardrails first.** Money and trust are the product (Gerald test). AI may **draft**; a human **confirms**, and the audited callable is the only writer. Never send picks before `revealed`, never send phones or emails, and never let a model decide a result or a winner. Do **not** build a "pick assistant" or odds suggestions: it conflicts with the Responsible-Play check and is out of scope.

### 4.1 Client-side and edge
Feasible (Transformers.js, WebGPU) but **poor fit now**. The player bundle is already the Lighthouse problem (Firebase SDK about 160 KB gz), the audience is on older phones, and no workflow needs private on-device inference. Revisit only for fuzzy name matching, and a small deterministic fuzzy matcher already covers that ("a similar name chosen" in the import).

### 4.2 Server-side and workflow automation (Genkit or a callable on Gemini Flash)

| Idea | How it works | Human check |
|---|---|---|
| **Paper-sheet reader** | Photo already goes to Storage. A callable sends it to a vision model with the week's game list and returns a pick per game number plus a confidence and the tiebreaker | Commissioner sees the photo beside the proposed picks, edits, then saves via the existing `adminUpsertEntry` |
| **Text-message pick parser** | Paste Bernie's text ("Bills, Chiefs, Jags… 47") and get a draft for the same screen | Same preview as the spreadsheet import (D-096) |
| **Weekly recap** | From final results and standings, draft a short plain-words recap for the group chat | Commissioner copies and sends (nothing is auto-sent, D-027) |
| **Dispute explainer** | Natural-language question over the **audit log** ("what changed on Frank's week 4 picks?") answered with entry links | Read-only, admin only |
| **Reminder drafting** | Tone-adjusted reminder texts | Already templated in `shared/messages.ts`; low value |

### 4.3 Smart UX
- Predictive autofill of roster names while typing (non-AI search already exists; skip).
- Semantic or vector search over the audit log is an option, but a plain search box already works. Skip until the log is large.
- Proactive assistant: not recommended (privacy, scope).

### 4.4 Implementation matrix

| # | Proposal | Effort | Cost (order of magnitude) | Infrastructure | ROI |
|---|---|---|---|---|---|
| 1 | Paper-sheet reader | Med | Cents per week at tens of sheets, on a Flash-class vision model | A callable with a secret, Storage read, schema-validated output (`zod` already present), a preview screen | **High** (removes the biggest weekly chore; the data and storage exist) |
| 2 | Text-message pick parser | Low | Negligible | Same callable, a paste box | Med-High |
| 3 | Weekly recap draft | Low | Negligible | One callable, one button | Med (delight, not necessity) |
| 4 | Audit-log Q and A | Med | Low | Admin-only callable, structured retrieval (filter by player and week first, then summarise) | Med (disputes are rare but high-stakes) |
| 5 | In-browser models | High | none | WebGPU, big downloads | Low |
| 6 | Vector search | Med | Low | Firestore vector fields plus embeddings | Low for now |

**Pattern to follow (one callable, three guarantees):**

```ts
// functions/src/sheetReader.ts (sketch, not added)
export const adminReadSheet = onCall({ secrets: [GEMINI_KEY] }, async (req) => {
  requireAdmin(req);                              // admin only, never the counter role
  const week = await loadWeek(req.data.year, req.data.weekId); // game list from the DB
  const draft = await extractPicks(req.data.photoPath, week.games); // model call
  const checked = SheetDraft.parse(draft);        // zod: valid game numbers, valid teams only
  return withConfidence(checked);                 // low-confidence cells come back blank
});                                               // no write here: save goes through adminUpsertEntry
```

---

## Prioritised next steps

### P0: do before the next real week
1. **Turn on scheduled backups and delete protection** for `db-tunaspool` (D-089). Nothing else here matters if the data is lost.
2. **Add App Check** (reCAPTCHA Enterprise or the Play/DeviceCheck providers where relevant) and enforce it on Firestore and callables. This closes anonymous-account abuse on a shared project.
3. **Make entry writes atomic:** one `writeBatch` (public entry, payment, private picks), with rules that read the other docs via `getAfter`.
4. **Put the smoke run in CI** (or a nightly job). It is the only check that opens a real screen, and a prod bug already slipped past without it.

### P1: next sprint
5. **Fix the reveal N+1:** have a function write one `weeks/{id}/reveal` doc at reveal time, so the page does one read.
6. **Tighten the picks rule** (valid game keys and team values).
7. **Reconcile doc and code on real-time:** CLAUDE.md says `onSnapshot` where it matters, the code only polls. Record the choice in DECISIONS (suggested: polling stays, except the live leaderboard while a week is locked).
8. **PWA basics:** a `manifest.webmanifest` and an app shell, then enable Firestore persistent cache so a weak-signal submit completes later. Push stays out of scope.
9. **Alerts:** an uptime check on the site and a log-based alert on `reportClientError` volume.
10. **React 19 forms:** move the pick-entry and payment forms to `useActionState`/`useOptimistic`.

### P2: when the pool grows
11. **AI paper-sheet reader** (matrix #1), then the text parser (#2). Build behind the existing preview-then-save pattern.
12. Durable rate limits (Firestore-backed counters or Cloud Armor) for callables that take free text.
13. Cache the ESPN scoreboard in a function-written doc so viewers do not each call ESPN.
14. Lighthouse 90: lighter Firestore SDK on first screen, which is a design choice (already in PROJECT_PLAN §7c).
15. Weekly recap draft and audit-log Q and A.

> [!NOTE]
> **Governance tie-in.** Items 2, 3, 5 and 6 change rules or data shape, so under CLAUDE.md §3 each needs rules tests first, a matrix row, and the matching `docs/` edits in the same change. The new Stop hook in `.agents/hooks.json` will nudge for that.
