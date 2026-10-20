/**
 * Weekly 649 Bingo in plain words, for the player screens (BINGO_PLAN S14). Pure, so every line a
 * member reads is tested. The Bingo Check (PERSONAS §8) applies to every string here: nothing says
 * a card is "close", nothing ranks people, and money is always in dollars.
 */
import { BINGO_PICKS, cardsAllowed, type BingoCycleConfig, type MemberLimits } from './bingo';
import { formatPoolDate } from './time';

/** "$10", "$2,080", "$20.50". */
export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-CA', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** "Wed Nov 18" for a draw date. */
export const drawDay = (drawDate: string) => formatPoolDate(drawDate, { weekday: 'short' });

/** A list in words: "3, 11 and 27". */
function listWords(items: (string | number)[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What a card has crossed off, said in words beside the grid (never colour alone). */
export function hitsInWords(hits: readonly number[]): string {
  if (hits.length === 0) return 'Nothing crossed off yet.';
  if (hits.length === BINGO_PICKS)
    return `All ${BINGO_PICKS} crossed off: ${listWords([...hits])}.`;
  return `${hits.length} of ${BINGO_PICKS} crossed off: ${listWords([...hits])}.`;
}

/** "Paid for 2 of 3 draws so far." */
export function paidWeeksText(paidDraws: number, drawsSoFar: number): string {
  if (drawsSoFar === 0) return 'No draws yet this game.';
  return `Paid for ${paidDraws} of ${drawsSoFar} draw${drawsSoFar === 1 ? '' : 's'} so far.`;
}

export interface PaymentView {
  paid: boolean;
  late: boolean;
  intent: 'cash' | 'etransfer' | null;
}

/** This week's payment for one card, in words. */
export function paymentText(drawDate: string, p: PaymentView | null): string {
  const day = drawDay(drawDate);
  if (p?.paid) return `Paid for ${day}.`;
  if (p?.intent === 'cash') return `Not paid yet for ${day}. You said you'll pay cash at the shop.`;
  if (p?.intent === 'etransfer')
    return `Not paid yet for ${day}. You said you sent an e-Transfer; it shows here once it's checked.`;
  return `Not paid yet for ${day}. Pay by 6 PM Wednesday for it to count.`;
}

/** The member's limit, said plainly, including a raise that's waiting and a pause. */
export function limitText(m: MemberLimits, cycleNumber: number, maxCards: number): string[] {
  const lines: string[] = [];
  const now = cardsAllowed(m, cycleNumber, maxCards);
  if (m.pausedThroughCycle !== null && cycleNumber <= m.pausedThroughCycle) {
    const more = m.pausedThroughCycle - cycleNumber;
    lines.push(
      more === 0
        ? 'You are sitting out this game.'
        : `You are sitting out this game and the next ${more === 1 ? 'one' : more}.`,
    );
  } else {
    lines.push(`Your limit: ${now} card${now === 1 ? '' : 's'} a draw.`);
  }
  if (m.pendingLimit !== null && m.pendingFromCycle !== null && m.pendingFromCycle > cycleNumber) {
    lines.push(`Going up to ${m.pendingLimit} from the next game. A raise always waits a game.`);
  }
  return lines;
}

/** What you have put in, in dollars (PERSONAS §8: always shown). */
export function spendText(cycleCents: number, yearCents: number, year: string): string {
  return `You've put in ${dollars(cycleCents)} this game and ${dollars(yearCents)} in ${year}.`;
}

/** The board's counts (D-123): no names, no ranking. */
export function boardLines(board: {
  at3: number;
  at4: number;
  at5: number;
  cards: number;
}): string[] {
  const n = (count: number) => `${count} card${count === 1 ? '' : 's'}`;
  return [
    `${n(board.cards)} in this game.`,
    `${n(board.at3)} with 3 crossed off, ${n(board.at4)} with 4, ${n(board.at5)} with 5.`,
  ];
}

/**
 * The odds in plain words, from the game's own settings (R-21, D-130). The game-length and tie
 * figures are from the simulation with about 50 players; they're averages, and the screen says so.
 */
export function oddsLines(
  config: Pick<BingoCycleConfig, 'priceCents' | 'operatorPct' | 'maxWeeks'>,
): string[] {
  const potShare = 100 - config.operatorPct;
  return [
    `A card is ${dollars(config.priceCents)} a draw.`,
    `${config.operatorPct}% of every dollar goes to the house. ${potShare}% goes into the pot.`,
    `So on average a card gets back about ${potShare}¢ of every dollar put in. Most cards get back nothing; a few win.`,
    'With about 50 players, a game usually lasts about 6 weeks, and about 1 game in 3 is split between two or more cards.',
    `If nobody has all six after ${config.maxWeeks} weeks, the cards with the most crossed off that were paid for the last draw split the pot.`,
  ];
}

/** When new cards can be bought, in words (D-117). */
export function joinWindowText(open: boolean, firstDraw: string): string {
  return open
    ? `New cards can be added until 6 PM ${drawDay(firstDraw)}, the first draw of this game.`
    : 'New cards can be added when this game is won. Your cards carry over to the next game.';
}
