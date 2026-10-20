/**
 * Download the 32 team logos into public/teams/{abbr}.png for the By game view (D-103).
 *   npx tsx scripts/fetch-team-logos.ts
 * CI's deploy job runs this before the build, so the live site serves its own copies and never
 * links to another site's images. The files are not committed (.gitignore): they are NFL marks,
 * used as a recorded exception to CLAUDE.md principle 9, and fetched fresh at each deploy.
 * A logo that can't be fetched is skipped, never fatal: the card shows the team badge instead.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { TEAM_INFO } from '../shared/teamColors';

const OUT = 'public/teams';
// A 120px copy is plenty for a 40 to 56px logo on a phone and far lighter than the 500px original
// (a page can show 30 of them, D-106). If ESPN's resizer doesn't answer with a PNG, take the original.
const sources = (abbr: string) => [
  `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${abbr}.png&w=120&h=120`,
  `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`,
];
const PNG = [0x89, 0x50, 0x4e, 0x47];

mkdirSync(OUT, { recursive: true });
async function png(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!PNG.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');
  return bytes;
}

let saved = 0;
let small = 0;
const missed: string[] = [];
for (const { abbr } of Object.values(TEAM_INFO)) {
  let lastError = '';
  for (const [i, url] of sources(abbr).entries()) {
    try {
      writeFileSync(`${OUT}/${abbr}.png`, await png(url));
      saved += 1;
      if (i === 0) small += 1;
      lastError = '';
      break;
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  if (lastError) missed.push(`${abbr} (${lastError})`);
}
console.log(
  `Team logos: ${saved} saved to ${OUT} (${small} at 120px, ${saved - small} full size).`,
);
if (missed.length) console.log(`Not fetched, the badge shows instead: ${missed.join(', ')}`);
