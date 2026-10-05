import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/toastContext';
import { adminApi, type SeasonSummary } from '../../../lib/adminApi';
import { friendlyError } from '../../../lib/errors';
import { currentSeason } from '../../../lib/season';

/**
 * Seasons (PROJECT_PLAN Sprint 10). The roster is not tied to a season, so there is nothing to copy
 * over and nobody re-registers: a new season starts when its first week is set up. This screen is
 * for closing the old one: archive it once every week has a winner, so no week can be opened in it
 * by mistake. Archiving hides nothing; every week stays viewable.
 */
export default function SeasonsPage() {
  const client = useQueryClient();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState<string | null>(null);
  const seasons = useQuery({
    queryKey: ['adminSeasons'],
    queryFn: async () => (await adminApi.listSeasons({})).seasons,
  });
  const setStatus = useMutation({
    mutationFn: adminApi.setSeasonStatus,
    onSuccess: (season) => {
      void client.invalidateQueries({ queryKey: ['adminSeasons'] });
      setConfirming(null);
      showToast({
        message:
          season.status === 'archived' ? `${season.year} archived` : `${season.year} reopened`,
        ...(season.status === 'archived'
          ? {
              actionLabel: 'Undo',
              onAction: () => setStatus.mutate({ year: season.year, status: 'active' }),
            }
          : {}),
      });
    },
    onError: (err) => showToast({ message: friendlyError(err), tone: 'error' }),
  });
  const thisYear = currentSeason();

  return (
    <div className="flex max-w-player flex-col gap-4 pb-24">
      <h1 className="font-heading text-h2">Seasons</h1>
      <p className="text-body text-ink-muted">
        Players, their logins, and their history carry over from season to season on their own. A
        new season starts when you set up its first week.
      </p>

      {seasons.isPending && <p role="status">Loading seasons…</p>}
      {seasons.isError && (
        <p role="alert" className="font-semibold text-ink-urgent">
          {friendlyError(seasons.error)}
        </p>
      )}
      {seasons.isSuccess && seasons.data.length === 0 && (
        <p className="text-body">No seasons yet. Set up a week to start one.</p>
      )}

      <ul className="flex flex-col gap-3" aria-label="Seasons">
        {seasons.data?.map((season) => (
          <SeasonCard
            key={season.year}
            season={season}
            current={season.year === thisYear}
            confirming={confirming === season.year}
            busy={setStatus.isPending && setStatus.variables?.year === season.year}
            onAsk={() => setConfirming(season.year)}
            onCancel={() => setConfirming(null)}
            onSet={(status) => setStatus.mutate({ year: season.year, status })}
          />
        ))}
      </ul>

      <Link to="/admin/weeks" className="btn btn-ghost">
        Set up a week in {thisYear}
      </Link>
    </div>
  );
}

function SeasonCard({
  season,
  current,
  confirming,
  busy,
  onAsk,
  onCancel,
  onSet,
}: {
  season: SeasonSummary;
  current: boolean;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onSet: (status: 'active' | 'archived') => void;
}) {
  const archived = season.status === 'archived';
  const weeksHref = `/admin/weeks${current ? '' : `?season=${encodeURIComponent(season.year)}`}`;
  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <h2 className="flex flex-wrap items-center gap-2 font-heading text-h3">
        {season.year}
        {current && <span className="badge badge-open">This season</span>}
        {season.test && <span className="badge badge-pending">Test season</span>}
        <span className={`badge ${archived ? 'badge-draft' : 'badge-final'}`}>
          {archived ? 'Archived' : 'Open'}
        </span>
      </h2>
      <p className="text-body">
        {season.weeks} {season.weeks === 1 ? 'week' : 'weeks'}: {season.finalWeeks} finished,{' '}
        {season.liveWeeks} being played, {season.draftWeeks} in draft.
      </p>
      <Link
        to={weeksHref}
        className="inline-flex min-h-touch items-center self-start text-body underline"
      >
        See its weeks
      </Link>

      {archived ? (
        <Button variant="ghost" disabled={busy} onClick={() => onSet('active')}>
          {busy ? 'Reopening…' : 'Reopen season'}
        </Button>
      ) : confirming ? (
        <div role="group" aria-label={`Archive ${season.year}`} className="flex flex-col gap-2">
          <p className="rounded-md bg-gold-50 p-3 text-body text-gold-800">
            Archive {season.year}? No week can be opened in it after that. Everything stays
            viewable, and you can reopen it.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => onSet('archived')}>
              {busy ? 'Archiving…' : 'Yes, archive'}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Not yet
            </Button>
          </div>
        </div>
      ) : season.liveWeeks > 0 ? (
        <p className="text-body-sm text-ink-muted">
          It can be archived once every week being played has its winner published.
        </p>
      ) : (
        <Button variant="ghost" onClick={onAsk}>
          Archive season
        </Button>
      )}
    </li>
  );
}
