import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, formatRecord } from '@shared/scoring';
import { formatPoolDateTime } from '@shared/time';
import type { GameResult } from '@shared/types';
import { kickoffLabel } from '@shared/weeks';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Panel } from '../../../components/ui/Panel';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useToast } from '../../../components/ui/toastContext';
import { WinnerBanner } from '../../../components/ui/WinnerBanner';
import { friendlyError } from '../../../lib/errors';
import type { WeekView } from '../../../lib/weekModel';
import { useAdminWeek } from '../useAdminWeek';
import { WeekPicker } from '../WeekPicker';
import {
  useCorrectResults,
  useEnterResults,
  useMarkPayout,
  usePreview,
  usePublishWinner,
} from './resultsData';

/** Results, the winner, and the payout: the second half of the commissioner's week (Sprint 3). */
export default function ResultsPage() {
  const sel = useAdminWeek();
  if (sel.isPending) return <p role="status">Loading…</p>;
  if (sel.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        The weeks didn't load. Check your connection and refresh.
      </p>
    );
  }
  if (!sel.week) {
    return (
      <div className="flex max-w-player flex-col gap-3">
        <h1 className="font-heading text-h2">Results</h1>
        <p className="text-body">
          No week is open yet. Results open up once a week's picks have locked.
        </p>
        <Link to="/admin/weeks" className="btn btn-primary">
          Set up a week
        </Link>
      </div>
    );
  }
  return (
    <ResultsForWeek
      key={`${sel.year}/${sel.week.id}/${sel.week.status}`}
      sel={sel}
      week={sel.week}
    />
  );
}

const sameResults = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

function parseTotal(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  return /^\d{1,3}$/.test(t) && Number(t) <= 200 ? Number(t) : 'invalid';
}

function ResultsForWeek({ sel, week }: { sel: ReturnType<typeof useAdminWeek>; week: WeekView }) {
  const { year } = sel;
  const { showToast } = useToast();
  const locked = week.status === 'locked';
  const final = week.status === 'final';

  const enter = useEnterResults(year, week.id);
  const publish = usePublishWinner(year, week.id);
  const payout = useMarkPayout(year, week.id);
  const preview = usePreview(year, week.id, locked || final);

  const [results, setResults] = useState<Record<string, GameResult>>(week.results);
  const [total, setTotal] = useState(week.mnfTotal === null ? '' : String(week.mnfTotal));
  const [confirming, setConfirming] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Fixing a result after the winner is published (Sprint 6): the games unlock, and saving needs a reason.
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const correct = useCorrectResults(year, week.id);
  const editable = locked || (final && correcting);

  const games = [...week.games].sort((a, b) => a.order - b.order);
  const entered = games.filter((g) => results[g.id]).length;
  const parsedTotal = parseTotal(total);
  const totalError =
    parsedTotal === 'invalid' ? 'Enter a whole number from 0 to 200, like 46.' : undefined;
  const dirty =
    !sameResults(results, week.results) ||
    (parsedTotal !== 'invalid' && parsedTotal !== week.mnfTotal);
  const data = preview.data;
  const outcome = data?.winner.ok ? data.winner.outcome : null;

  function setResult(gameId: string, value: GameResult) {
    setConfirming(false);
    setResults((r) => {
      const next = { ...r };
      if (next[gameId] === value) delete next[gameId];
      else next[gameId] = value;
      return next;
    });
  }

  async function save() {
    if (parsedTotal === 'invalid') return;
    try {
      const res = await enter.mutateAsync({
        year,
        weekId: week.id,
        results,
        mnfTotal: parsedTotal,
      });
      showToast({ message: res.changed ? 'Results saved' : 'Nothing changed' });
    } catch (err) {
      showToast({ message: friendlyError(err), tone: 'error' });
    }
  }

  function cancelCorrection() {
    setCorrecting(false);
    setReason('');
    setReasonError(undefined);
    setResults(week.results);
    setTotal(week.mnfTotal === null ? '' : String(week.mnfTotal));
  }

  async function saveCorrection() {
    if (parsedTotal === 'invalid' || parsedTotal === null || entered < games.length) {
      showToast({
        message: 'A final week needs every result and the Monday night total.',
        tone: 'error',
      });
      return;
    }
    if (reason.trim().length < 5) {
      setReasonError('Type a short reason, like "Game 9 was entered the wrong way round".');
      return;
    }
    try {
      const res = await correct.mutateAsync({
        year,
        weekId: week.id,
        results,
        mnfTotal: parsedTotal,
        reason: reason.trim(),
      });
      setCorrecting(false);
      setReason('');
      showToast({
        message: !res.changed
          ? 'Nothing changed'
          : res.winnerChanged
            ? `Corrected. The winner is now ${res.winner?.displayNames.join(' and ')}. Check the payout.`
            : 'Corrected. The winner is the same.',
      });
    } catch (err) {
      showToast({ message: friendlyError(err), tone: 'error' });
    }
  }

  async function doPublish() {
    if (!outcome) return;
    try {
      await publish.mutateAsync({ year, weekId: week.id, expectedPlayerIds: outcome.playerIds });
      setConfirming(false);
      showToast({ message: 'Winner published' });
    } catch (err) {
      setConfirming(false);
      showToast({ message: friendlyError(err), tone: 'error' });
    }
  }

  async function setPayout(sent: boolean) {
    try {
      await payout.mutateAsync({ year, weekId: week.id, sent });
      showToast({
        message: sent ? 'Payout marked sent' : 'Payout marked not sent',
        actionLabel: 'Undo',
        onAction: () => void setPayout(!sent),
      });
    } catch (err) {
      showToast({ message: friendlyError(err), tone: 'error' });
    }
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-heading text-h2">Results</h1>
      <div className="flex items-center gap-3">
        <StatusBadge status={week.status} />
        <WeekPicker weeks={sel.weeks} value={week.id} onChange={sel.select} />
      </div>
    </div>
  );

  if (!locked && !final) {
    return (
      <div className="flex max-w-player flex-col gap-4">
        {header}
        <Panel title="Not yet">
          <p className="text-body">
            Results open once picks lock, {formatPoolDateTime(new Date(week.lockAtMs))}. You can
            lock early from the{' '}
            <Link to={`/admin/weeks/${year}/${week.id}`} className="underline">
              week page
            </Link>
            .
          </p>
        </Panel>
      </div>
    );
  }

  const unpaid = data ? data.entryCount - data.paidCount : 0;

  return (
    <div className="flex flex-col gap-4 pb-24">
      {header}

      {final && week.winner && (
        <>
          <WinnerBanner weekNumber={week.weekNumber} winner={week.winner} />
          {data?.winner.ok && data.winner.explanation && (
            <p className="rounded-md bg-surface-tint p-3 text-body">
              <strong>How this was decided:</strong> {data.winner.explanation}
            </p>
          )}
          {week.correctedAtMs !== null && (
            <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
              <span aria-hidden="true">ⓘ </span>
              <strong>Result corrected</strong> on{' '}
              {formatPoolDateTime(new Date(week.correctedAtMs), { weekday: 'short' })}. Players see
              this note too. The reason is in the audit log.
            </p>
          )}
          {week.winner.leftoverCents > 0 && (
            <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
              <strong>{formatMoney(week.winner.leftoverCents)} left over:</strong> the pot doesn't
              split evenly, so each winner's share is rounded down.
            </p>
          )}
          <Panel title="Payout">
            <div className="flex flex-col gap-3">
              <p className="text-body">
                {week.payoutSent ? (
                  <>
                    <span className="badge badge-paid">
                      <span aria-hidden="true">✓</span>Sent
                    </span>{' '}
                    The payout has been sent.
                  </>
                ) : (
                  <>
                    <span className="badge badge-pending">Not sent yet</span> Pay{' '}
                    {week.winner.playerIds.length > 1
                      ? `each winner ${formatMoney(week.winner.shareCents)}`
                      : `${week.winner.displayNames[0]} ${formatMoney(week.winner.shareCents)}`}
                    , then mark it sent.
                  </>
                )}
              </p>
              <Button
                variant={week.payoutSent ? 'ghost' : 'primary'}
                disabled={payout.isPending}
                onClick={() => setPayout(!week.payoutSent)}
              >
                {week.payoutSent ? 'Undo payout sent' : 'Mark payout sent'}
              </Button>
            </div>
          </Panel>
        </>
      )}

      {locked && (
        <p className="text-body text-ink-muted">
          Tap the winner of each game, or Tie if it ended tied (a tie is not a win for anyone). Then
          enter the Monday night total points and save.
        </p>
      )}

      <div className="overflow-hidden rounded-lg">
        <ProgressBar
          done={entered}
          total={games.length}
          noun="results in"
          ariaLabel="Results entered"
        />
      </div>

      <ol className="flex flex-col gap-2" aria-label="Games">
        {games.map((g) => {
          const result = results[g.id];
          return (
            <li key={g.id} className="flex flex-col gap-2 rounded-md bg-surface p-3">
              <p className="text-center font-heading text-colhead uppercase text-ink-muted">
                {kickoffLabel(g)}
                {g.slot === 'mnf' ? ' · Monday night' : ''}
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <button
                  type="button"
                  className="pick"
                  aria-pressed={result === 'away'}
                  data-state={editable ? undefined : 'locked'}
                  disabled={!editable}
                  onClick={() => setResult(g.id, 'away')}
                >
                  {g.away}
                </button>
                <button
                  type="button"
                  className="pick min-w-16"
                  aria-pressed={result === 'tie'}
                  aria-label={`${g.away} at ${g.home} ended in a tie`}
                  data-state={editable ? undefined : 'locked'}
                  disabled={!editable}
                  onClick={() => setResult(g.id, 'tie')}
                >
                  Tie
                </button>
                <button
                  type="button"
                  className="pick"
                  aria-pressed={result === 'home'}
                  data-state={editable ? undefined : 'locked'}
                  disabled={!editable}
                  onClick={() => setResult(g.id, 'home')}
                >
                  {g.home}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <Panel>
        <div className="flex flex-col gap-4">
          <Field
            label="Monday night total points"
            hint="Both teams' final scores added together. Used only if players tie."
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={total}
            disabled={!editable}
            onChange={(e) => {
              setConfirming(false);
              setTotal(e.target.value.replace(/\D/g, ''));
            }}
            error={totalError}
          />
          {locked && (
            <Button
              variant="primary"
              disabled={!dirty || enter.isPending || parsedTotal === 'invalid'}
              onClick={save}
            >
              {enter.isPending ? 'Saving…' : dirty ? 'Save results' : 'Results saved'}
            </Button>
          )}
          {final && !correcting && (
            <>
              <p className="text-body-sm text-ink-muted">
                Spotted a wrong result? Correcting it scores the week again and can change the
                winner. Players see a "Result corrected" note.
              </p>
              <Button variant="ghost" onClick={() => setCorrecting(true)}>
                Correct a result
              </Button>
            </>
          )}
          {final && correcting && (
            <div role="group" aria-label="Correct a result" className="flex flex-col gap-3">
              <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
                <span aria-hidden="true">ⓘ </span>
                <strong>You're correcting a published week.</strong> Change the results above, say
                why, and save. If the winner changes, "payout sent" is cleared so you can check it.
              </p>
              <Field
                label="Why is it being corrected?"
                hint="For the audit log. Players only see that a result was corrected, and when."
                value={reason}
                maxLength={300}
                onChange={(e) => {
                  setReasonError(undefined);
                  setReason(e.target.value);
                }}
                error={reasonError}
              />
              <Button
                variant="primary"
                disabled={!dirty || correct.isPending || parsedTotal === 'invalid'}
                onClick={saveCorrection}
              >
                {correct.isPending
                  ? 'Saving…'
                  : dirty
                    ? 'Save correction'
                    : 'Change a result first'}
              </Button>
              <Button variant="ghost" onClick={cancelCorrection}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </Panel>

      <Panel title={final ? 'Final standings' : 'Winner'}>
        <div className="flex flex-col gap-4">
          {preview.isPending && <p role="status">Working it out…</p>}
          {preview.isError && (
            <p role="alert" className="font-semibold text-ink-urgent">
              {friendlyError(preview.error)}
            </p>
          )}
          {data && (
            <>
              <p className="text-body">
                Pot <strong>{formatMoney(data.potCents)}</strong> from {data.paidCount} paid{' '}
                {data.paidCount === 1 ? 'entry' : 'entries'}.
              </p>
              {unpaid > 0 && !final && (
                <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
                  <span aria-hidden="true">ⓘ </span>
                  {unpaid} {unpaid === 1 ? 'entry hasn' : 'entries haven'}'t paid and can't win.{' '}
                  <Link to={`/admin${sel.search(week.id)}`} className="font-semibold underline">
                    Review payments
                  </Link>
                </p>
              )}

              {data.winner.ok ? (
                <p className="text-body">
                  <strong>
                    {data.complete || final ? 'Winner' : 'Leading if the games ended now'}:
                  </strong>{' '}
                  {data.winner.explanation}
                  {!data.complete && !final && ' The tiebreaker needs the Monday night total.'}
                </p>
              ) : data.winner.reason === 'needs_mnf_total' ? (
                <p className="text-body">
                  Players are tied. Enter the Monday night total to break it.
                </p>
              ) : (
                <p className="text-body">
                  Nobody with a paid entry yet, so there's no winner. Mark payments first.
                </p>
              )}

              <ol className="flex flex-col divide-y divide-line-subtle" aria-label="Standings">
                {data.contenders.slice(0, showAll ? undefined : 8).map((c, i) => (
                  <li
                    key={c.playerId}
                    className="flex items-center justify-between gap-2 py-2 text-body"
                  >
                    <span className="min-w-0">
                      <span className="text-ink-muted">{i + 1}. </span>
                      <strong className="break-words">{c.displayName}</strong>
                      {!c.paid && <span className="badge badge-unpaid ml-2">Unpaid</span>}
                      {outcome?.playerIds.includes(c.playerId) && (
                        <span aria-label="winner"> 👑</span>
                      )}
                    </span>
                    <span className="flex-none text-right">
                      <strong>{formatRecord(c.wins, c.losses)}</strong>
                      {!data.complete && c.remaining > 0 && (
                        <span className="block text-body-sm text-ink-muted">
                          best {c.bestPossible}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              {data.contenders.length > 8 && (
                <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer' : `Show all ${data.contenders.length}`}
                </Button>
              )}
            </>
          )}

          {locked && data && (
            <div className="flex flex-col gap-3 border-t-2 border-line-subtle pt-4">
              {!confirming ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={!data.complete || dirty || !outcome}
                    onClick={() => setConfirming(true)}
                  >
                    Review and publish winner
                  </Button>
                  <p className="text-body-sm text-ink-muted">
                    {dirty
                      ? 'Save your results first.'
                      : !data.complete
                        ? `Enter all ${data.totalGames} results and the Monday night total first.`
                        : !outcome
                          ? 'Mark at least one entry paid first.'
                          : 'You will see the winner and confirm before anything is published.'}
                  </p>
                </>
              ) : (
                outcome && (
                  <div role="group" aria-label="Confirm winner" className="flex flex-col gap-3">
                    <p className="font-heading text-h3">
                      Publish {outcome.displayNames.join(' and ')} as the week {week.weekNumber}{' '}
                      winner
                      {outcome.playerIds.length > 1 ? 's' : ''}?
                    </p>
                    <p className="text-body">
                      {formatRecord(outcome.record.wins, outcome.record.losses)}.{' '}
                      {outcome.playerIds.length > 1
                        ? `${formatMoney(outcome.shareCents)} each from a ${formatMoney(outcome.potCents)} pot.`
                        : `${formatMoney(outcome.potCents)} pot.`}{' '}
                      Publishing makes the week final. A wrong result can still be corrected
                      afterwards, with a note players can see.
                    </p>
                    <Button variant="primary" disabled={publish.isPending} onClick={doPublish}>
                      {publish.isPending ? 'Publishing…' : 'Publish winner'}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(false)}>
                      Not yet
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
