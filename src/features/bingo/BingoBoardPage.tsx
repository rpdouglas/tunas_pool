import { boardLines, dollars, drawDay } from '@shared/bingoView';
import { Panel } from '../../components/ui/Panel';
import { StatTile } from '../../components/ui/StatTile';
import { BingoPage } from './BingoPage';
import { useMyBingo, useOpenCycle, type BingoStatus } from './bingoData';

/**
 * `/b/board`: the pot and how many cards are at 3, 4, and 5 (D-123). No names, no other member's
 * numbers, no ranking by closeness (PERSONAS §8). Your own cards are listed by what they have.
 */
export default function BingoBoardPage({ status }: { status: BingoStatus }) {
  const cycle = useOpenCycle(true);
  const mine = useMyBingo(status.member ? status.playerId : null);

  if (cycle.isError) {
    return (
      <BingoPage title="Board" status={status}>
        <Panel>
          <p role="alert" className="text-body">
            The board didn't load. Check your signal and refresh.
          </p>
        </Panel>
      </BingoPage>
    );
  }
  if (cycle.isPending) {
    return (
      <BingoPage title="Board" status={status}>
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      </BingoPage>
    );
  }
  const c = cycle.data;
  return (
    <BingoPage title="Board" status={status}>
      {!c ? (
        <Panel>
          <p className="text-body">No game is running right now.</p>
        </Panel>
      ) : (
        <>
          <Panel title={`Game ${c.number}${c.test ? ' (practice)' : ''}`}>
            <div className="flex flex-col gap-3">
              <StatTile label="The pot" value={dollars(c.potCents)} accent />
              <p className="text-body">
                {c.drawsApproved === 0
                  ? `The first draw is ${drawDay(c.firstDraw)}.`
                  : `${c.drawsApproved} draw${c.drawsApproved === 1 ? '' : 's'} so far.`}
              </p>
              {boardLines(c.board).map((line) => (
                <p key={line} className="text-body">
                  {line}
                </p>
              ))}
            </div>
          </Panel>
          {mine.data && mine.data.cards.length > 0 ? (
            <Panel title="Your cards">
              <ul className="flex flex-col gap-1 text-body">
                {mine.data.cards.map((card, i) => (
                  <li key={card.cardId}>
                    Card {i + 1}: {card.hits.length} of 6 crossed off
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </BingoPage>
  );
}
