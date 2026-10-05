import { CONFIRMATION_CODE_LENGTH, confirmationCode } from './confirmation';

const base = {
  year: '2026',
  weekId: 'wk06',
  playerId: 'p1',
  picksSubmittedAtMs: 1_791_000_000_000,
};

describe('confirmationCode', () => {
  it('is six unambiguous characters and stable for the same submission', () => {
    const code = confirmationCode(base);
    expect(code).toMatch(new RegExp(`^[A-HJKMNP-Z2-9]{${CONFIRMATION_CODE_LENGTH}}$`));
    expect(confirmationCode({ ...base })).toBe(code);
  });

  it('changes when the picks are resubmitted, or for another player or week', () => {
    const code = confirmationCode(base);
    expect(confirmationCode({ ...base, picksSubmittedAtMs: base.picksSubmittedAtMs + 1 })).not.toBe(
      code,
    );
    expect(confirmationCode({ ...base, playerId: 'p2' })).not.toBe(code);
    expect(confirmationCode({ ...base, weekId: 'wk07' })).not.toBe(code);
  });

  it('spreads codes out (no collisions across 5,000 submissions)', () => {
    const codes = new Set(
      Array.from({ length: 5000 }, (_, i) =>
        confirmationCode({ ...base, picksSubmittedAtMs: base.picksSubmittedAtMs + i * 137 }),
      ),
    );
    expect(codes.size).toBe(5000);
  });
});
