import { describe, expect, it } from 'vitest';
import {
  CARD_BACKGROUND,
  MIN_BAR_CONTRAST,
  MIN_COLOUR_DISTANCE,
  NEUTRAL_BAR,
  TEAM_INFO,
  badgeInk,
  barColours,
  colourDistance,
  contrastRatio,
} from './teamColors';
import { TEAMS } from './teams';

describe('contrastRatio and colourDistance', () => {
  it('match the known values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(colourDistance('#000000', '#000000')).toBe(0);
    expect(colourDistance('#000000', '#FFFFFF')).toBeCloseTo(100, 0);
  });
});

describe('TEAM_INFO', () => {
  it('has a code and two colours for every team, with no code used twice', () => {
    expect(Object.keys(TEAM_INFO).sort()).toEqual([...TEAMS].sort());
    const codes = Object.values(TEAM_INFO).map((t) => t.abbr);
    expect(new Set(codes).size).toBe(32);
    for (const t of Object.values(TEAM_INFO)) {
      expect(t.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.secondary).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('barColours', () => {
  it('uses both primaries when they are clearly different', () => {
    expect(barColours('Texans', 'Jaguars')).toEqual({ away: '#03202F', home: '#006778' });
  });

  it('switches the right-hand team to its secondary when the primaries are too close', () => {
    // Two navies: Bears and Titans.
    expect(barColours('Bears', 'Titans')).toEqual({ away: '#0B162A', home: '#4B92DB' });
  });

  it('tells dark colours apart: Packers green and Bears navy are too close', () => {
    expect(barColours('Packers', 'Bears')).toEqual({ away: '#203731', home: '#C83803' });
  });

  it('keeps a light team colour, since the bar is outlined', () => {
    expect(barColours('Saints', 'Giants').away).toBe('#D3BC8D');
    expect(barColours('Bears', 'Steelers')).toEqual({ away: '#0B162A', home: '#FFB612' });
  });

  it('every one of the 1,024 matchups gives two visible, clearly different bars', () => {
    for (const away of TEAMS) {
      for (const home of TEAMS) {
        const c = barColours(away, home);
        expect(contrastRatio(c.away, CARD_BACKGROUND)).toBeGreaterThanOrEqual(MIN_BAR_CONTRAST);
        expect(contrastRatio(c.home, CARD_BACKGROUND)).toBeGreaterThanOrEqual(MIN_BAR_CONTRAST);
        // The neutral grey is the last resort and is allowed to be the only difference.
        if (c.home !== NEUTRAL_BAR) {
          expect(colourDistance(c.away, c.home), `${away} at ${home}`).toBeGreaterThanOrEqual(
            MIN_COLOUR_DISTANCE,
          );
        }
      }
    }
  });
});

describe('badgeInk', () => {
  it('puts white on dark colours and black on light ones', () => {
    expect(badgeInk('#0B162A')).toBe('#FFFFFF');
    expect(badgeInk('#FFB612')).toBe('#000000');
  });
});
