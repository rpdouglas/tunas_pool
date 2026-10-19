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
const source = (abbr: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
const PNG = [0x89, 0x50, 0x4e, 0x47];

mkdirSync(OUT, { recursive: true });
let saved = 0;
const missed: string[] = [];
for (const { abbr } of Object.values(TEAM_INFO)) {
  try {
    const response = await fetch(source(abbr), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!PNG.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');
    writeFileSync(`${OUT}/${abbr}.png`, bytes);
    saved += 1;
  } catch (err) {
    missed.push(`${abbr} (${(err as Error).message})`);
  }
}
console.log(`Team logos: ${saved} saved to ${OUT}.`);
if (missed.length) console.log(`Not fetched, the badge shows instead: ${missed.join(', ')}`);
