/**
 * What the bingo screens need before anything else (D-128, D-132): whether to show them at all.
 * The rules let only members and staff read `bingo/config`, so someone who isn't a member yet
 * can't tell on their own whether bingo is on. While it is off, the screens show only to staff
 * and existing members (the dry run); everyone else gets the ordinary "not found".
 */
import type { Firestore } from 'firebase-admin/firestore';
import { paths } from './common';

export interface BingoStatus {
  /** Show the bingo screens to this login at all. */
  visible: boolean;
  enabled: boolean;
  member: boolean;
  staff: boolean;
  playerId: string | null;
  /** The numbers on the rules screen, which someone can read before joining (R-21). */
  rules: { priceCents: number; operatorPct: number; maxWeeks: number } | null;
}

export async function bingoStatus(
  db: Firestore,
  input: { playerId: string | null; staff: boolean },
): Promise<BingoStatus> {
  const [config, member, open] = await Promise.all([
    db.doc(paths.config).get(),
    input.playerId ? db.doc(paths.member(input.playerId)).get() : null,
    db.collection('bingoCycles').where('status', '==', 'open').limit(1).get(),
  ]);
  const enabled = config.exists && config.get('enabled') === true;
  const isMember = member?.exists === true;
  const visible = enabled || isMember || input.staff;
  // The running game's own settings first: they're the ones that apply now.
  const source = open.empty ? (config.exists ? config.data() : null) : open.docs[0].get('config');
  return {
    visible,
    rules:
      visible && source
        ? {
            priceCents: source.priceCents,
            operatorPct: source.operatorPct,
            maxWeeks: source.maxWeeks,
          }
        : null,
    enabled,
    member: isMember,
    staff: input.staff,
    playerId: input.playerId,
  };
}
