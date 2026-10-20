import { describe, expect, it } from 'vitest';
import { cardRequest } from './callers';

describe('cardRequest', () => {
  it("a member's own card, whether or not they're staff", () => {
    expect(cardRequest(false, { numbers: null } as never)).toEqual({ kind: 'own' });
    // The bug: the commissioner adding a card on their own My cards page was asked for a playerId.
    expect(cardRequest(true, { numbers: [1, 2, 3, 4, 5, 6] } as never)).toEqual({ kind: 'own' });
    expect(cardRequest(true, null)).toEqual({ kind: 'own' });
  });

  it('a paper card only when staff name the player', () => {
    expect(cardRequest(true, { playerId: 'p3' })).toEqual({ kind: 'paper', playerId: 'p3' });
    // A player can't make a card for someone else by naming them: they get their own.
    expect(cardRequest(false, { playerId: 'p3' })).toEqual({ kind: 'own' });
  });
});
