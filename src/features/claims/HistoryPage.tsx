import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRecord } from '@shared/scoring';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { Panel } from '../../components/ui/Panel';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useGuestSession } from '../auth/useAuth';
import { useMyHistory, useMyHistoryPicks, useMyProfile, type HistoryWeek } from './claimsData';

const TITLE = 'Your history';

/**
 * Every week this player has been in, whoever entered the picks (PROJECT_PLAN Sprint 5). After a
 * claim is approved, the weeks the pool entered on paper show up here at once, because they were
 * always under the same player (CLAUDE.md §4.1).
 */
export default function HistoryPage() {
  const session = useGuestSession();
  const profile = useMyProfile(session.user?.uid);
  const history = useMyHistory(profile.data?.playerId);

  const loading =
    !session.user || profile.isPending || (Boolean(profile.data) && history.isPending);
  return (
    <GameDayPage title={TITLE}>
      {session.failed || profile.isError || history.isError ? (
        <Panel>
          <p role="alert" className="text-body">
            Your history didn't load. Check your signal and refresh.
          </p>
        </Panel>
      ) : loading ? (
        <Panel>
          <p role="status" className="text-body">
            Loading…
          </p>
        </Panel>
      ) : !profile.data || history.data!.length === 0 ? (
        <Panel>
          <p className="text-body">
            No weeks yet. Each week you enter shows up here with your picks and your record.
          </p>
        </Panel>
      ) : (
        <Panel title={profile.data.displayName}>
          <div className="flex flex-col gap-3">
            <p className="text-body">
              {history.data!.length} {history.data!.length === 1 ? 'week' : 'weeks'} played.
            </p>
            <ul className="flex flex-col gap-2" aria-label="Weeks played">
              {history.data!.map((row) => (
                <HistoryRow
                  key={`${row.week.year}/${row.week.id}`}
                  row={row}
                  playerId={profile.data!.playerId}
                />
              ))}
            </ul>
          </div>
        </Panel>
      )}

      {profile.data?.linkedToRoster === false || (!profile.isPending && !profile.data) ? (
        <Link
          to="/claim"
          className="inline-flex min-h-touch items-center justify-center text-center text-body text-ink-inverse underline"
        >
          Played on paper, by text, or by phone before? Link your history
        </Link>
      ) : null}
      <Link
        to="/"
        className="inline-flex min-h-touch items-center justify-center text-body text-ink-inverse underline"
      >
        Back to this week
      </Link>
    </GameDayPage>
  );
}

function HistoryRow({ row, playerId }: { row: HistoryWeek; playerId: string }) {
  const { week } = row;
  const [open, setOpen] = useState(false);
  const picks = useMyHistoryPicks(week.year, week.id, playerId, open);
  const games = [...week.games].sort((a, b) => a.order - b.order);

  return (
    <li className="rounded-md border-2 border-line-subtle bg-surface">
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="flex min-h-touch cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="font-heading text-h3">
            Week {week.weekNumber}
            <span className="font-body text-body font-normal text-ink-muted"> · {week.year}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2 text-body">
            {row.lateOverride && <span className="badge badge-pending">Late entry</span>}
            {row.record ? (
              <strong>{formatRecord(row.record.wins, row.record.losses)}</strong>
            ) : (
              <StatusBadge status={week.status === 'open' ? 'open' : 'locked'} />
            )}
          </span>
        </summary>
        <div className="border-t border-line-subtle px-3 py-2">
          {picks.isPending ? (
            <p role="status" className="text-body">
              Loading picks…
            </p>
          ) : picks.isError || !picks.data ? (
            <p className="text-body">The picks for this week couldn't be shown.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1 text-body">
                {games.map((g) => {
                  const pick = picks.data!.picks[g.id];
                  const result = week.results[g.id];
                  const team = pick === 'away' ? g.away : pick === 'home' ? g.home : null;
                  const mark = !team || !result ? null : pick === result ? 'correct' : 'missed';
                  return (
                    <li key={g.id} className="flex items-baseline justify-between gap-2">
                      <span>
                        {team ? (
                          <>
                            <strong>{team}</strong>
                            <span className="text-ink-muted">
                              {' '}
                              over {pick === 'away' ? g.home : g.away}
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-muted">
                            {g.away} at {g.home}: no pick
                          </span>
                        )}
                      </span>
                      {mark && (
                        <span
                          className={mark === 'correct' ? 'text-success-800' : 'text-ink-urgent'}
                        >
                          <span aria-hidden="true">{mark === 'correct' ? '✔ ' : '✖ '}</span>
                          {mark === 'correct' ? 'Right' : 'Missed'}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-body">
                <strong>Tiebreaker:</strong> {picks.data.tiebreakerTotal}
              </p>
            </>
          )}
        </div>
      </details>
    </li>
  );
}
