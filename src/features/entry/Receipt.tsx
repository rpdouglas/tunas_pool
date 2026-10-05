import { Link } from 'react-router-dom';
import { useState } from 'react';
import { confirmationCode } from '@shared/confirmation';
import { picksInMessage } from '@shared/messages';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../components/ui/Button';
import { Countdown } from '../../components/ui/Countdown';
import { Panel } from '../../components/ui/Panel';
import { ShareCard } from '../../components/ui/ShareCard';
import { shareText } from '../../lib/share';
import type { WeekView } from '../../lib/weekModel';
import type { MyEntry } from './entryData';

export interface ReceiptProps {
  year: string;
  week: WeekView;
  mine: MyEntry;
  open: boolean;
  isGuest: boolean;
  justSubmitted: boolean;
  onEdit: () => void;
}

/**
 * What was saved, when, and a confirmation code (Gerald Trust Test, D-026). The time is the
 * server's, shown in Toronto time. The code changes on every edit.
 */
export function Receipt({ year, week, mine, open, isGuest, justSubmitted, onEdit }: ReceiptProps) {
  const entry = mine.entry!;
  const submittedMs = entry.picksSubmittedAt.toDate().getTime();
  const code = confirmationCode({
    year,
    weekId: week.id,
    playerId: mine.playerId!,
    picksSubmittedAtMs: submittedMs,
  });
  const games = [...week.games].sort((a, b) => a.order - b.order);
  const picks = mine.picks?.picks ?? {};
  const payment = mine.payment;
  const fee = `$${(week.entryFeeCents / 100).toFixed(0)}`;
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function share() {
    const outcome = await shareText(picksInMessage(entry.displayName, week));
    setShareNote(
      outcome === 'copied'
        ? 'Copied. Paste it wherever you like.'
        : outcome === 'failed'
          ? "Couldn't share from this browser. A screenshot of the card works too."
          : null,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {justSubmitted && (
        <p role="status" className="rounded-md bg-surface p-3 text-center font-heading text-h3">
          <span aria-hidden="true">✓ </span>Picks submitted
        </p>
      )}

      <Panel title={open ? "You're in" : 'Your picks'}>
        <div className="flex flex-col gap-4">
          {payment?.paymentStatus === 'paid' ? (
            <p className="text-body">
              <span className="badge badge-paid">
                <span aria-hidden="true">✓</span>Paid
              </span>{' '}
              Payment confirmed. Good luck!
            </p>
          ) : payment ? (
            <p className="text-body">
              <span className="badge badge-pending">Payment pending</span>{' '}
              {payment.paymentMethod === 'etransfer' ? 'e-Transfer' : 'Cash'},{' '}
              {payment.paymentIntent === 'already_did' ? 'already sent' : 'not sent yet'}. Pending
              until the pool confirms it.
            </p>
          ) : (
            <p className="text-body">
              <span className="badge badge-pending">Payment pending</span> You haven't said how
              you'll pay the {fee} yet.{open && ' Edit your picks to choose cash or e-Transfer.'}
            </p>
          )}

          <div className="rounded-md bg-surface-tint p-3 text-center">
            <p className="text-colhead font-heading uppercase">Confirmation code</p>
            <p className="font-heading text-h1 tracking-widest" data-testid="confirmation-code">
              {code}
            </p>
            <p className="text-body-sm">
              Submitted {formatPoolDateTime(new Date(submittedMs))} (Toronto time)
            </p>
          </div>

          <ul className="flex flex-col divide-y divide-line-subtle" aria-label="Your picks">
            {games.map((g) => {
              const pick = picks[g.id];
              const team = pick === 'away' ? g.away : pick === 'home' ? g.home : null;
              return (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2 text-body">
                  <span>
                    {g.away} at {g.home}
                  </span>
                  <strong>{team ?? 'No pick'}</strong>
                </li>
              );
            })}
          </ul>
          <p className="text-body">
            <strong>Tiebreaker:</strong> {mine.picks?.tiebreakerTotal ?? '—'} total points
          </p>
          <p className="text-body">
            <strong>Name other players see:</strong> {entry.displayName}
          </p>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-3">
          <Countdown lockAtMs={week.lockAtMs} />
          {open ? (
            <Button variant="primary" onClick={onEdit}>
              Edit picks until{' '}
              {formatPoolDateTime(new Date(week.lockAtMs), {
                month: undefined,
                day: undefined,
                weekday: 'short',
              })}
            </Button>
          ) : (
            <p className="text-body">Picks are locked. Good luck!</p>
          )}
          {isGuest && open && (
            <Link to="/account" className="btn btn-ghost">
              Save your picks to any phone
            </Link>
          )}
        </div>
      </Panel>

      {/* Opt-in sharing (PERSONAS: Kayla). The card never shows a pick or anything about payment. */}
      <ShareCard
        displayName={entry.displayName}
        weekNumber={week.weekNumber}
        lockLabel={formatPoolDateTime(new Date(week.lockAtMs))}
        locked={!open}
      />
      <Button variant="secondary" onClick={share}>
        Share that you're in
      </Button>
      {shareNote && (
        <p role="status" className="text-center text-body text-ink-inverse">
          {shareNote}
        </p>
      )}
    </div>
  );
}
