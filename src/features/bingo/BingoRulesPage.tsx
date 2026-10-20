import { Link } from 'react-router-dom';
import { oddsLines } from '@shared/bingoView';
import { Panel } from '../../components/ui/Panel';
import { BingoPage } from './BingoPage';
import type { BingoStatus } from './bingoData';

/**
 * `/b/rules`: the game and the odds in plain words, from the running game's settings (R-21), and
 * the support line. Readable before joining (the Welcome Test).
 */
export default function BingoRulesPage({ status }: { status: BingoStatus }) {
  const rules = status.rules ?? { priceCents: 1000, operatorPct: 40, maxWeeks: 26 };
  return (
    <BingoPage title="Rules" status={status}>
      <Panel title="How it works">
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-body">
          <li>
            Pick six numbers from 1 to 49, or let the computer pick. You can have up to five cards.
          </li>
          <li>Pay for each card, each week, by 6 PM Wednesday: cash at the shop or e-Transfer.</li>
          <li>
            After the Wednesday Lotto 6/49 draw, the main six numbers are crossed off any paid card
            that has them. The bonus number doesn't count.
          </li>
          <li>
            A week you don't pay for crosses nothing off, but your card keeps what it already has.
          </li>
          <li>
            The first card with all six crossed off wins the pot. Cards that finish the same night
            split it.
          </li>
          <li>
            Then a new game starts. Your cards carry over and start again from nothing crossed off.
          </li>
          <li>
            New cards can only be added before the first draw of a game, so every card starts even.
          </li>
        </ol>
      </Panel>
      <Panel title="The odds">
        <div className="flex flex-col gap-2 text-body">
          {oddsLines(rules).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Panel>
      <Panel title="Play within your means">
        <div className="flex flex-col gap-2 text-body">
          <p>
            Set a limit on how many cards you play, or sit out a game, on your cards page. Lowering
            it starts now; only you can raise it, and a raise waits a game.
          </p>
          <p>
            If gambling stops being fun, talk to someone: ConnexOntario at{' '}
            <a href="tel:+18665312600" className="whitespace-nowrap underline">
              1-866-531-2600
            </a>
            , or the New York HOPEline at{' '}
            <a href="tel:+18778467369" className="whitespace-nowrap underline">
              1-877-846-7369
            </a>
            . Both are free and open all day, every day.
          </p>
        </div>
      </Panel>
      {!status.member && !status.staff ? (
        <Link to="/b" className="btn btn-primary">
          Back to joining
        </Link>
      ) : null}
    </BingoPage>
  );
}
