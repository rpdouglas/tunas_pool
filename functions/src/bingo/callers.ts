/**
 * Whose card a `bingoCreateCard` call is for. Staff (the commissioner or the counter) can also be
 * members, so a staff login making a card on their own My cards page is making their own card; it
 * is a paper card for someone else only when the call names that player (D-114).
 */
export type CardRequest = { kind: 'own' } | { kind: 'paper'; playerId: unknown };

export function cardRequest(
  staff: boolean,
  data: { playerId?: unknown } | null | undefined,
): CardRequest {
  return staff && data?.playerId !== undefined
    ? { kind: 'paper', playerId: data.playerId }
    : { kind: 'own' };
}
