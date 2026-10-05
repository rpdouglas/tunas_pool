/**
 * NFL team names for matching what the admin types. Names only: no logos or other league
 * marks (CLAUDE.md §4.9). The display name is the nickname, as on the paper sheet.
 */
export const TEAMS = [
  'Bills',
  'Dolphins',
  'Patriots',
  'Jets',
  'Ravens',
  'Bengals',
  'Browns',
  'Steelers',
  'Texans',
  'Colts',
  'Jaguars',
  'Titans',
  'Broncos',
  'Chiefs',
  'Raiders',
  'Chargers',
  'Cowboys',
  'Giants',
  'Eagles',
  'Commanders',
  'Bears',
  'Lions',
  'Packers',
  'Vikings',
  'Falcons',
  'Panthers',
  'Saints',
  'Buccaneers',
  'Cardinals',
  'Rams',
  '49ers',
  'Seahawks',
] as const;

export type TeamName = (typeof TEAMS)[number];

const CITY_PREFIXES = [
  'arizona',
  'atlanta',
  'baltimore',
  'buffalo',
  'carolina',
  'chicago',
  'cincinnati',
  'cleveland',
  'dallas',
  'denver',
  'detroit',
  'green bay',
  'houston',
  'indianapolis',
  'jacksonville',
  'kansas city',
  'las vegas',
  'los angeles',
  'la',
  'miami',
  'minnesota',
  'new england',
  'new orleans',
  'new york',
  'ny',
  'philadelphia',
  'pittsburgh',
  'san francisco',
  'seattle',
  'tampa bay',
  'tennessee',
  'washington',
];

const ALIASES: Record<string, TeamName> = {
  bucs: 'Buccaneers',
  niners: '49ers',
  pats: 'Patriots',
  jags: 'Jaguars',
  pack: 'Packers',
  'football team': 'Commanders',
};

const byKey = new Map<string, TeamName>(TEAMS.map((t) => [t.toLowerCase(), t]));

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ');
}

/** "Kansas City Chiefs", "chiefs", "KC Chiefs" → "Chiefs". Null if it isn't a team. */
export function resolveTeam(input: string): TeamName | null {
  let key = normalize(input);
  if (byKey.has(key)) return byKey.get(key)!;
  if (ALIASES[key]) return ALIASES[key];
  for (const city of CITY_PREFIXES) {
    if (key.startsWith(`${city} `)) {
      key = key.slice(city.length + 1);
      break;
    }
  }
  const lastWord = key.split(' ').pop() ?? key;
  return byKey.get(key) ?? ALIASES[key] ?? byKey.get(lastWord) ?? null;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** Closest team name for a typo ("Comanders" → "Commanders"), or null if nothing is close. */
export function suggestTeam(input: string): TeamName | null {
  const word = normalize(input).split(' ').pop() ?? '';
  let best: TeamName | null = null;
  let bestDistance = 3;
  for (const team of TEAMS) {
    const distance = editDistance(word, team.toLowerCase());
    if (distance < bestDistance) {
      best = team;
      bestDistance = distance;
    }
  }
  return best;
}
