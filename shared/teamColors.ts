/**
 * Team colours and short codes for the By game view (D-103). Team colours are data about the
 * teams, not design choices, so they live here rather than in tokens.css (the one exception to
 * CLAUDE.md principle 10). Colours are fine to use (DESIGN_SYSTEM §10). Values are each team's
 * published primary and secondary colours; the commissioner checks them.
 *
 * `abbr` is the code ESPN uses, which also names the logo file (public/teams/{abbr}.png).
 */
import type { TeamName } from './teams';

export interface TeamInfo {
  abbr: string;
  primary: string;
  secondary: string;
}

export const TEAM_INFO: Record<TeamName, TeamInfo> = {
  Bills: { abbr: 'buf', primary: '#00338D', secondary: '#C60C30' },
  Dolphins: { abbr: 'mia', primary: '#008E97', secondary: '#FC4C02' },
  Patriots: { abbr: 'ne', primary: '#002244', secondary: '#C60C30' },
  Jets: { abbr: 'nyj', primary: '#125740', secondary: '#000000' },
  Ravens: { abbr: 'bal', primary: '#241773', secondary: '#9E7C0C' },
  Bengals: { abbr: 'cin', primary: '#FB4F14', secondary: '#000000' },
  Browns: { abbr: 'cle', primary: '#311D00', secondary: '#FF3C00' },
  Steelers: { abbr: 'pit', primary: '#101820', secondary: '#FFB612' },
  Texans: { abbr: 'hou', primary: '#03202F', secondary: '#A71930' },
  Colts: { abbr: 'ind', primary: '#002C5F', secondary: '#A2AAAD' },
  Jaguars: { abbr: 'jax', primary: '#006778', secondary: '#D7A22A' },
  Titans: { abbr: 'ten', primary: '#0C2340', secondary: '#4B92DB' },
  Broncos: { abbr: 'den', primary: '#FB4F14', secondary: '#002244' },
  Chiefs: { abbr: 'kc', primary: '#E31837', secondary: '#FFB81C' },
  Raiders: { abbr: 'lv', primary: '#000000', secondary: '#A5ACAF' },
  Chargers: { abbr: 'lac', primary: '#0080C6', secondary: '#FFC20E' },
  Cowboys: { abbr: 'dal', primary: '#003594', secondary: '#869397' },
  Giants: { abbr: 'nyg', primary: '#0B2265', secondary: '#A71930' },
  Eagles: { abbr: 'phi', primary: '#004C54', secondary: '#A5ACAF' },
  Commanders: { abbr: 'wsh', primary: '#5A1414', secondary: '#FFB612' },
  Bears: { abbr: 'chi', primary: '#0B162A', secondary: '#C83803' },
  Lions: { abbr: 'det', primary: '#0076B6', secondary: '#B0B7BC' },
  Packers: { abbr: 'gb', primary: '#203731', secondary: '#FFB612' },
  Vikings: { abbr: 'min', primary: '#4F2683', secondary: '#FFC62F' },
  Falcons: { abbr: 'atl', primary: '#A71930', secondary: '#000000' },
  Panthers: { abbr: 'car', primary: '#0085CA', secondary: '#101820' },
  Saints: { abbr: 'no', primary: '#D3BC8D', secondary: '#101820' },
  Buccaneers: { abbr: 'tb', primary: '#D50A0A', secondary: '#34302B' },
  Cardinals: { abbr: 'ari', primary: '#97233F', secondary: '#000000' },
  Rams: { abbr: 'lar', primary: '#003594', secondary: '#FFA300' },
  '49ers': { abbr: 'sf', primary: '#AA0000', secondary: '#B3995D' },
  Seahawks: { abbr: 'sea', primary: '#002244', secondary: '#69BE28' },
};

/** The card's background (the design system's white surface) and the fallback bar colour. */
export const CARD_BACKGROUND = '#FFFFFF';
export const NEUTRAL_BAR = '#6D6B82'; // --neutral-500, 5.2:1 on white

/**
 * The bar has a dark outline (DESIGN_SYSTEM §6), so its shape reads on the white card whatever the
 * team colours are, and the counts and percents are always written out (never colour alone). A team
 * colour only has to stand off the white enough to be seen as a colour, not 3:1.
 */
export const MIN_BAR_CONTRAST = 1.5;
/** Two bar colours closer than this (CIE76 ΔE in Lab) read as one colour side by side. 25 let
 * Packers green and Bears navy through as different; 30 doesn't. */
export const MIN_COLOUR_DISTANCE = 30;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(linear);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** How different two colours look (CIE76 ΔE): about 2 is barely visible, 25 is clearly different. */
export function colourDistance(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const visible = (hex: string) => contrastRatio(hex, CARD_BACKGROUND) >= MIN_BAR_CONTRAST;

/**
 * The bar colours for a game. The left (away) team gets its primary, or its secondary when the
 * primary is nearly white. The right (home) team gets the first of its primary and secondary that
 * is visible and clearly different from the left one, else the neutral grey.
 */
export function barColours(away: TeamName, home: TeamName): { away: string; home: string } {
  const a = TEAM_INFO[away];
  const h = TEAM_INFO[home];
  const left = [a.primary, a.secondary].find(visible) ?? NEUTRAL_BAR;
  const right =
    [h.primary, h.secondary, NEUTRAL_BAR].find(
      (c) => visible(c) && colourDistance(c, left) >= MIN_COLOUR_DISTANCE,
    ) ?? NEUTRAL_BAR;
  return { away: left, home: right };
}

/** Text colour for a team badge: black or white, whichever reads better on the team's colour. */
export function badgeInk(background: string): '#000000' | '#FFFFFF' {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#FFFFFF')
    ? '#000000'
    : '#FFFFFF';
}
