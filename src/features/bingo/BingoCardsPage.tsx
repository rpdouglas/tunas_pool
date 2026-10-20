import { useState } from 'react';
import { cardsAllowed } from '@shared/bingo';
import { joinWindowText, limitText, spendText } from '@shared/bingoView';
import { BingoCardPanel } from '../../components/ui/BingoCard';
import { BingoNumberPicker } from '../../components/ui/BingoNumberPicker';
import { Button } from '../../components/ui/Button';
import { Panel } from '../../components/ui/Panel';
import { BingoPage } from './BingoPage';
import {
  bingoError,
  useCreateCard,
  useMyBingo,
  useRetireCard,
  useSetIntent,
  useSetLimit,
  type BingoStatus,
  type MyBingo,
} from './bingoData';

/**
 * `/b/cards`: my cards, what I've put in, adding a card, and my own limit (PERSONAS §8: spend in
 * dollars and limits one tap away, on this page, not in settings).
 */
export default function BingoCardsPage({ status }: { status: BingoStatus }) {
  const mine = useMyBingo(status.playerId);
  const intent = useSetIntent();
  const retire = useRetireCard();
  const create = useCreateCard();
  const [error, setError] = useState<string | null>(null);

  const run = async (p: Promise<unknown>) => {
    setError(null);
    try {
      await p;
    } catch (err) {
      setError(bingoError(err));
    }
  };

  if (mine.isError) {
    return (
      <BingoPage title="My cards" status={status}>
        <Panel>
          <p role="alert" className="text-body">
            Your cards didn't load. Check your signal and refresh.
          </p>
        </Panel>
      </BingoPage>
    );
  }
  if (!mine.data) {
    return (
      <BingoPage title="My cards" status={status}>
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      </BingoPage>
    );
  }
  const m = mine.data;
  const busy = intent.isPending || retire.isPending || create.isPending;

  return (
    <BingoPage title="My cards" status={status}>
      <Panel>
        <p className="text-body font-semibold">
          {spendText(m.spent.cycleCents, m.spent.yearCents, m.spent.year)}
        </p>
        {!m.cycle ? (
          <p className="mt-2 text-body">
            No game is running right now. Your cards carry over to the next one.
          </p>
        ) : null}
      </Panel>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-surface p-4 text-body font-semibold text-ink-urgent"
        >
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}

      {m.cards.length === 0 ? (
        <Panel>
          <p className="text-body">You don't have a card yet.</p>
        </Panel>
      ) : (
        m.cards.map((c, i) => (
          <BingoCardPanel
            key={c.cardId}
            title={`Card ${i + 1}`}
            numbers={c.numbers}
            hits={c.hits}
            paidDraws={c.paidDraws}
            drawsSoFar={m.drawsSoFar}
            dueDraw={m.dueDraw ?? ''}
            payment={c.payment}
            busy={busy}
            onIntent={
              m.dueDraw
                ? (value) => run(intent.mutateAsync({ cardId: c.cardId, intent: value }))
                : undefined
            }
            onRetire={() => run(retire.mutateAsync({ cardId: c.cardId }))}
          />
        ))
      )}

      <AddCard m={m} busy={busy} onAdd={(numbers) => run(create.mutateAsync({ numbers }))} />
      <Limits m={m} />
    </BingoPage>
  );
}

function AddCard({
  m,
  busy,
  onAdd,
}: {
  m: MyBingo;
  busy: boolean;
  onAdd: (n: number[] | null) => void;
}) {
  if (!m.cycle) return null;
  const max = m.cycle.config.maxCardsPerPlayer;
  const allowed = cardsAllowed(m.limits, m.cycle.number, max);
  let note: string | null = null;
  if (!m.joinOpen) note = joinWindowText(false, m.cycle.firstDraw);
  else if (allowed === 0) note = 'You are sitting out this game, so new cards wait.';
  else if (m.cards.length >= allowed)
    note = `You have ${m.cards.length} card${m.cards.length === 1 ? '' : 's'}, your limit for now.`;
  return (
    <Panel title="Add a card">
      {note ? (
        <p className="text-body">{note}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body">{joinWindowText(true, m.cycle.firstDraw)}</p>
          <BingoNumberPicker onSubmit={onAdd} busy={busy} />
        </div>
      )}
    </Panel>
  );
}

function Limits({ m }: { m: MyBingo }) {
  const setLimit = useSetLimit();
  const [error, setError] = useState<string | null>(null);
  const number = m.cycle?.number ?? 1;
  const max = m.cycle?.config.maxCardsPerPlayer ?? 5;
  const now = cardsAllowed({ ...m.limits, pausedThroughCycle: null }, number, max);
  const [want, setWant] = useState(now);
  const paused = m.limits.pausedThroughCycle !== null && number <= m.limits.pausedThroughCycle;

  const save = async (input: { limit?: number; pauseCycles?: number }) => {
    setError(null);
    try {
      await setLimit.mutateAsync(input);
    } catch (err) {
      setError(bingoError(err));
    }
  };

  return (
    <Panel title="Your limit">
      <div className="flex flex-col gap-3">
        {limitText(m.limits, number, max).map((line) => (
          <p key={line} className="text-body font-semibold">
            {line}
          </p>
        ))}
        <p className="text-body text-ink-muted">
          Lowering your limit or sitting out starts now. Raising it starts with the next game. Only
          you can change this.
        </p>
        <label className="field-label" htmlFor="bingo-limit">
          Cards a draw
        </label>
        <select
          id="bingo-limit"
          className="field"
          value={want}
          onChange={(e) => setWant(Number(e.target.value))}
          disabled={setLimit.isPending}
        >
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          onClick={() => save({ limit: want })}
          disabled={setLimit.isPending || want === now}
        >
          Save my limit
        </Button>
        {paused ? (
          <Button
            variant="ghost"
            onClick={() => save({ pauseCycles: 0 })}
            disabled={setLimit.isPending}
          >
            Play again from the next game
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => save({ pauseCycles: 1 })}
            disabled={setLimit.isPending}
          >
            Sit out this game
          </Button>
        )}
        {error ? (
          <p role="alert" className="text-body font-semibold text-ink-urgent">
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
