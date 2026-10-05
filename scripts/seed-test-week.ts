/**
 * Build a finished week in a test season, so the Back Office and the player screens can be looked at
 * with a full week behind them (DECISIONS.md D-044). It takes the Sunday and Monday games of the
 * given Sunday from the schedule feed, adds 25 made-up players with random picks and a mix of
 * payments, then runs the weekly job with the functions' own code: lock, payments, results, winner.
 *
 *   GCLOUD_PROJECT=lilypad-strategy-design npm run admin:seed-test-week -- 2026-test 2026-10-04
 *   GCLOUD_PROJECT=lilypad-strategy-design npm run admin:seed-test-week -- 2026-test --remove-players
 *
 * Only seasons that end in "-test" are accepted, and it never overwrites a week that exists. The
 * season is removed with `npm run admin:delete-season`. The made-up player profiles live outside
 * the season (`players/seedtest-NN`), so remove them with `--remove-players`.
 *
 * Entries and picks are written directly (the paper-entry callable is Sprint 4), so they have no
 * audit entries. Payments, the lock, results, and the winner are audited as "script:seed-test-week".
 * A game the feed has no final score for gets a made-up result, and the script says which.
 *
 * Needs credentials like delete-season.ts, or the Firestore emulator (FIRESTORE_EMULATOR_HOST).
 */
import { createRequire } from 'node:module';
import { FIRESTORE_DATABASE_ID } from '../shared/config';
import { readEspnScoreboard, scheduleToText } from '../shared/schedule';
import { resolveTeam } from '../shared/teams';
import { addDays, weekdayOf } from '../shared/time';
import type { GameResult, Pick } from '../shared/types';
import {
  DEFAULT_ENTRY_FEE_CENTS,
  MNF_GAME_ID,
  defaultLockAt,
  parseMatchups,
  weekProblems,
} from '../shared/weeks';
import { lockDueWeeks } from '../functions/src/lockWeeks';
import {
  enterResults,
  previewWinner,
  publishWinner,
  setPayment,
} from '../functions/src/weekActions';
import { recountWeek } from '../functions/src/weekCounters';

// The functions' code is run here, so the Admin SDK has to be the functions' own copy: a value
// such as a server timestamp made by one copy is refused by a database handle from the other.
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const { applicationDefault, initializeApp } = functionsRequire(
  'firebase-admin/app',
) as typeof import('firebase-admin/app');
const { Timestamp, getFirestore } = functionsRequire(
  'firebase-admin/firestore',
) as typeof import('firebase-admin/firestore');

const ACTOR = 'script:seed-test-week';
const PLAYER_PREFIX = 'seedtest-';
const PLAYER_NOTE = 'Made-up profile from scripts/seed-test-week.ts. Safe to delete.';
const WEEK_ID = 'wk01';
const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const NAMES = [
  'Marge T.',
  'Dougie P.',
  'Lorraine B.',
  'Stan K.',
  'Yvonne C.',
  'Gord M.',
  'Tammy L.',
  'Earl W.',
  'Sheila D.',
  'Rick V.',
  'Noreen H.',
  'Wally F.',
  'Brenda S.',
  'Hank O.',
  'Colleen R.',
  'Murray G.',
  'Dot A.',
  'Lenny J.',
  'Francine N.',
  'Butch E.',
  'Pauline Q.',
  'Reggie U.',
  'Mavis I.',
  'Clint Y.',
  'Clint Y', // the last two show a "similar name" flag
];

const [season, ...rest] = process.argv.slice(2);
if (!season || !/^[A-Za-z0-9_-]+-test$/.test(season)) {
  console.error(
    'Usage: npm run admin:seed-test-week -- <year>-test <Sunday as YYYY-MM-DD>\n' +
      '       npm run admin:seed-test-week -- <year>-test --remove-players\n' +
      '(only test seasons are accepted)',
  );
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-tunas-pool';
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

/** Small seeded generator, so a rerun makes the same players and picks. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function removePlayers(): Promise<void> {
  const refs = NAMES.map((_, i) => db.doc(`players/${playerIdFor(i)}`));
  const snaps = await db.getAll(...refs);
  const mine = snaps.filter((s) => s.exists && s.get('notes') === PLAYER_NOTE);
  const batch = db.batch();
  mine.forEach((s) => batch.delete(s.ref));
  await batch.commit();
  console.log(`Removed ${mine.length} made-up player profiles.`);
}

function playerIdFor(index: number): string {
  return `${PLAYER_PREFIX}${String(index + 1).padStart(2, '0')}`;
}

interface FeedScore {
  final: boolean;
  awayPoints: number;
  homePoints: number;
}

/** The parts of the feed the scores are read from. It is unofficial, so every field is optional. */
interface FeedEvent {
  competitions?: Array<{
    status?: { type?: { completed?: boolean } };
    competitors?: Array<{
      homeAway?: string;
      score?: string;
      team?: { shortDisplayName?: string; displayName?: string };
    }>;
  }>;
}

/** Final scores from the feed, keyed "Away at Home" with the pool's own team names. */
function readScores(payload: unknown): Map<string, FeedScore> {
  const scores = new Map<string, FeedScore>();
  const events = (payload as { events?: FeedEvent[] } | null)?.events ?? [];
  for (const event of events) {
    const competition = event?.competitions?.[0];
    const sides: Record<string, { name: string | null; points: number }> = {};
    for (const side of competition?.competitors ?? []) {
      const name = side?.team?.shortDisplayName ?? side?.team?.displayName;
      if (!side?.homeAway) continue;
      sides[side.homeAway] = {
        name: typeof name === 'string' ? resolveTeam(name) : null,
        points: Number(side.score),
      };
    }
    if (!sides.away?.name || !sides.home?.name) continue;
    const final =
      competition?.status?.type?.completed === true &&
      Number.isFinite(sides.away.points) &&
      Number.isFinite(sides.home.points);
    scores.set(`${sides.away.name} at ${sides.home.name}`, {
      final,
      awayPoints: sides.away.points,
      homePoints: sides.home.points,
    });
  }
  return scores;
}

async function fetchDay(isoDate: string): Promise<unknown> {
  const response = await fetch(`${SCOREBOARD_URL}?dates=${isoDate.replaceAll('-', '')}`);
  if (!response.ok)
    throw new Error(`The schedule feed answered ${response.status} for ${isoDate}.`);
  return response.json();
}

async function seedWeek(sunday: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sunday) || weekdayOf(sunday) !== 0) {
    throw new Error('Give the Sunday of the week as YYYY-MM-DD.');
  }
  const weekRef = db.doc(`seasons/${season}/weeks/${WEEK_ID}`);
  if ((await weekRef.get()).exists) {
    throw new Error(`${weekRef.path} already exists. Delete the test season first.`);
  }
  const lockAt = defaultLockAt(sunday);
  if (lockAt.getTime() >= Date.now())
    throw new Error('That week has not locked yet. Pick a past Sunday.');

  // 1. The games, read the same way the week editor reads them.
  const days = await Promise.all([fetchDay(sunday), fetchDay(addDays(sunday, 1))]);
  const schedule = scheduleToText(days.flatMap(readEspnScoreboard), sunday);
  const { games, problems } = parseMatchups(schedule.text, sunday);
  const blocking = [
    ...problems.map((p) => p.message),
    // "now" is 0 so the check doesn't object to a lock time in the past, which is the point here.
    ...weekProblems({ games, lockAtMs: lockAt.getTime(), mnfGameId: MNF_GAME_ID }, 0),
  ];
  if (blocking.length) throw new Error(`The feed's week can't be used: ${blocking.join(' ')}`);

  // 2. The results: real where the game is final, made up where it is not.
  const rand = seeded(20261004);
  const scores = new Map(days.flatMap((d) => [...readScores(d)]));
  const results: Record<string, GameResult> = {};
  const madeUp: string[] = [];
  let mnfTotal = 0;
  for (const game of games) {
    let score = scores.get(`${game.away} at ${game.home}`);
    if (!score?.final) {
      score = { final: true, awayPoints: 17 + Math.floor(rand() * 14), homePoints: 0 };
      score.homePoints = score.awayPoints + (rand() < 0.5 ? 3 : -4);
      madeUp.push(`${game.away} ${score.awayPoints}, ${game.home} ${score.homePoints}`);
    }
    results[game.id] =
      score.homePoints === score.awayPoints
        ? 'tie'
        : score.homePoints > score.awayPoints
          ? 'home'
          : 'away';
    if (game.id === MNF_GAME_ID) mnfTotal = score.homePoints + score.awayPoints;
  }

  // 3. The season and the week, open with a lock time already behind us.
  const seasonRef = db.doc(`seasons/${season}`);
  if (!(await seasonRef.get()).exists) {
    await seasonRef.set({
      year: season,
      status: 'active',
      entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
      createdAt: Timestamp.now(),
    });
  }
  await weekRef.create({
    weekNumber: 1,
    status: 'open',
    lockAt: Timestamp.fromDate(lockAt),
    revealed: false,
    games: games.map(({ kickoffMs, ...g }) => ({ ...g, kickoff: Timestamp.fromMillis(kickoffMs) })),
    mnfGameId: MNF_GAME_ID,
    results: {},
    mnfTotal: null,
    entryFeeCents: DEFAULT_ENTRY_FEE_CENTS,
    entryCount: 0,
    paidCount: 0,
    winner: null,
    payoutSent: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // 4. 25 players, their picks, and how they said they would pay.
  //    20 get marked paid, 3 are unpaid, and 2 never said how they'll pay.
  const toMarkPaid: Array<{ playerId: string; method: 'cash' | 'etransfer' }> = [];
  for (const [i, displayName] of NAMES.entries()) {
    const playerId = playerIdFor(i);
    const skill = 0.4 + rand() * 0.3; // how often this player picks the team that won
    const picks: Record<string, Pick> = {};
    for (const game of games) {
      const won: Pick = results[game.id] === 'away' ? 'away' : 'home';
      picks[game.id] = rand() < skill ? won : won === 'home' ? 'away' : 'home';
    }
    const submittedAt = Timestamp.fromMillis(
      lockAt.getTime() - Math.floor(rand() * 4 * 86_400_000) - 60_000,
    );
    const method = rand() < 0.5 ? 'cash' : 'etransfer';
    const phone = `+1613555${String(i === 1 ? 100 : 100 + i).padStart(4, '0')}`; // players 1 and 2 share one

    const entryRef = weekRef.collection('entries').doc(playerId);
    const batch = db.batch();
    batch.set(db.doc(`players/${playerId}`), {
      displayName,
      phone,
      email: null,
      claimedByUid: null,
      origin: 'admin',
      usualPayment: null,
      notes: PLAYER_NOTE,
      active: true,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });
    batch.set(entryRef, {
      playerId,
      displayName,
      enteredBy: 'self',
      source: 'web',
      paperPhotoPath: null,
      lateOverride: null,
      picksSubmittedAt: submittedAt,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });
    batch.set(entryRef.collection('private').doc('picks'), {
      picks,
      tiebreakerTotal: 31 + Math.floor(rand() * 28),
      updatedAt: submittedAt,
    });
    if (i < 23) {
      batch.set(entryRef.collection('payment').doc('current'), {
        paymentMethod: method,
        paymentIntent: rand() < 0.4 ? 'already_did' : 'will_do',
        paymentStatus: 'unpaid',
        updatedAt: submittedAt,
      });
    }
    await batch.commit();
    if (i < 20) toMarkPaid.push({ playerId, method });
  }
  console.log(`Wrote ${NAMES.length} entries to ${weekRef.path}.`);

  // 5. The commissioner's job, with the functions' own code.
  const ref = { year: season, weekId: WEEK_ID, actorUid: ACTOR };
  for (const { playerId, method } of toMarkPaid) {
    await setPayment(db, { ...ref, playerId, status: 'paid', method });
  }
  console.log(`Marked ${toMarkPaid.length} entries paid.`);

  // The lock belongs to the scheduler. Give it a chance to do it, then do the same thing here.
  let lockedBy = 'the lockWeeks scheduler';
  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  for (let waited = 0; !isEmulator && waited < 100; waited += 5) {
    if ((await weekRef.get()).get('status') === 'locked') break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if ((await weekRef.get()).get('status') !== 'locked') {
    await lockDueWeeks(db, Date.now());
    lockedBy = 'this script (same code as the scheduler)';
  }
  console.log(`Locked and revealed by ${lockedBy}.`);

  await enterResults(db, { ...ref, results, mnfTotal });
  await recountWeek(db, season, WEEK_ID);
  const preview = await previewWinner(db, season, WEEK_ID);
  if (!preview.winner.ok) throw new Error(`No winner could be decided: ${preview.winner.reason}`);
  const winner = await publishWinner(db, {
    ...ref,
    expectedPlayerIds: preview.winner.outcome.playerIds,
  });

  console.log(
    `Published: ${winner.displayNames.join(' and ')}, ${winner.record.wins}-${winner.record.losses}.`,
  );
  console.log(`  ${winner.explanation}`);
  console.log(
    `  Pot $${winner.potCents / 100} from ${preview.paidCount} paid of ${preview.entryCount} entries.`,
  );
  if (madeUp.length) console.log(`Made-up results (not final in the feed): ${madeUp.join('; ')}`);
}

try {
  if (rest.includes('--remove-players')) await removePlayers();
  else await seedWeek(rest[0] ?? '');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
