/**
 * Possible duplicate entries (PERSONAS: the Double-Dipper anti-persona, DECISIONS.md D-022, D-045).
 * A flag asks the admin to take a look. It never blocks anything and never accuses anyone, so the
 * wording stays neutral. Compared among one week's entrants. No device or IP signals.
 */
export interface PersonInfo {
  playerId: string;
  displayName: string;
  /** E.164, e.g. "+16135550123". */
  phone: string | null;
  email: string | null;
}

export type DuplicateReason = 'phone' | 'email' | 'name' | 'similar_name';

export interface DuplicateFlag {
  playerIds: [string, string];
  reasons: DuplicateReason[];
}

export const DUPLICATE_REASON_TEXT: Record<DuplicateReason, string> = {
  phone: 'Same phone number',
  email: 'Same email',
  name: 'Same name',
  similar_name: 'Very similar name',
};

/** Groups of names people use for each other. Small on purpose: it only needs the common ones. */
const NICKNAMES = [
  ['alex', 'alexander', 'alexandra'],
  ['andy', 'andrew', 'drew'],
  ['ben', 'benjamin'],
  ['bill', 'will', 'william', 'billy'],
  ['bob', 'rob', 'robert', 'bobby', 'robbie'],
  ['chris', 'christopher', 'christine', 'christina'],
  ['dan', 'daniel', 'danny'],
  ['dave', 'david'],
  ['ed', 'eddie', 'edward'],
  ['jen', 'jenny', 'jennifer'],
  ['jim', 'jimmy', 'james'],
  ['joe', 'joey', 'joseph'],
  ['kate', 'katie', 'kathy', 'katherine', 'catherine'],
  ['liz', 'beth', 'elizabeth'],
  ['matt', 'matthew'],
  ['mike', 'mikey', 'michael'],
  ['nick', 'nicholas'],
  ['pat', 'patrick', 'patricia'],
  ['pete', 'peter'],
  ['rick', 'rich', 'richard', 'dick'],
  ['sam', 'samuel', 'samantha'],
  ['steve', 'steven', 'stephen'],
  ['sue', 'susan'],
  ['tim', 'timothy'],
  ['tom', 'tommy', 'thomas'],
  ['tony', 'anthony'],
];
const NICKNAME_GROUP = new Map<string, number>();
NICKNAMES.forEach((group, i) => group.forEach((name) => NICKNAME_GROUP.set(name, i)));

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

const sameOrNickname = (a: string, b: string) =>
  a === b || (NICKNAME_GROUP.has(a) && NICKNAME_GROUP.get(a) === NICKNAME_GROUP.get(b));
const closeSpelling = (a: string, b: string) =>
  Math.max(a.length, b.length) >= 4 && editDistance(a, b) <= 1;

/** Last names match when equal, one is just an initial of the other ("D." and "Douglas"), or a one-letter typo. */
function lastNamesAgree(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0];
  return Math.max(a.length, b.length) >= 5 && editDistance(a, b) <= 1;
}

/** True for "Bob Smith" and "Robert Smith", "Jon Smith" and "John Smith", "Dale D." and "Dale Douglas". */
export function similarNames(nameA: string, nameB: string): boolean {
  const a = normalizeName(nameA).split(' ').filter(Boolean);
  const b = normalizeName(nameB).split(' ').filter(Boolean);
  if (a.length === 0 || b.length === 0) return false;
  const [firstA, firstB] = [a[0], b[0]];
  const lastA = a.length > 1 ? a[a.length - 1] : null;
  const lastB = b.length > 1 ? b[b.length - 1] : null;

  if (sameOrNickname(firstA, firstB)) {
    // Only a first name on one side ("Dale" and "Dale D."): close enough to take a look.
    return lastA === null || lastB === null || lastNamesAgree(lastA, lastB);
  }
  // A spelling slip in the first name only counts when the last names match fully.
  return closeSpelling(firstA, firstB) && lastA !== null && lastA.length > 1 && lastA === lastB;
}

export function findDuplicateFlags(people: PersonInfo[]): DuplicateFlag[] {
  const flags: DuplicateFlag[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (a.playerId === b.playerId) continue;
      const reasons: DuplicateReason[] = [];
      if (a.phone && a.phone === b.phone) reasons.push('phone');
      if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase())
        reasons.push('email');
      if (
        normalizeName(a.displayName) === normalizeName(b.displayName) &&
        normalizeName(a.displayName) !== ''
      ) {
        reasons.push('name');
      } else if (similarNames(a.displayName, b.displayName)) {
        reasons.push('similar_name');
      }
      if (reasons.length > 0) flags.push({ playerIds: [a.playerId, b.playerId], reasons });
    }
  }
  return flags;
}

/** Each flagged player with the others they may duplicate, for showing next to a row. */
export function flagsByPlayer(
  flags: DuplicateFlag[],
  names: Record<string, string>,
): Record<string, { otherPlayerId: string; otherName: string; reasons: DuplicateReason[] }[]> {
  const result: Record<
    string,
    { otherPlayerId: string; otherName: string; reasons: DuplicateReason[] }[]
  > = {};
  for (const flag of flags) {
    const [a, b] = flag.playerIds;
    (result[a] ??= []).push({
      otherPlayerId: b,
      otherName: names[b] ?? 'another player',
      reasons: flag.reasons,
    });
    (result[b] ??= []).push({
      otherPlayerId: a,
      otherName: names[a] ?? 'another player',
      reasons: flag.reasons,
    });
  }
  return result;
}
