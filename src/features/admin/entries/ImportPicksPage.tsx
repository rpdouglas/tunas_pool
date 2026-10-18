import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { entryWindow, parseReason } from '@shared/paperEntry';
import { readPicksSheet } from '@shared/picksImport';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useToast } from '../../../components/ui/toastContext';
import { friendlyError } from '../../../lib/errors';
import { useEntriesList } from '../payments/paymentsData';
import { useRoster } from '../roster/rosterData';
import { useAdminWeek } from '../useAdminWeek';
import { WeekPicker } from '../WeekPicker';
import { useExistingEntries, useRunImport, type ImportJob, type ImportOutcome } from './importData';
import {
  defaultChoice,
  matchRow,
  planCounts,
  planRows,
  willSave,
  type RowChoice,
} from './importPlan';
import { ImportRowCard } from './ImportRowCard';

/**
 * Import a week of picks from the commissioner's spreadsheet (D-096). Nothing is saved until the
 * preview has been looked at and Import is pressed. Picks already in are kept unless Replace is
 * ticked on that line.
 */
export default function ImportPicksPage() {
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
        <h1 className="font-heading text-h2">Import picks</h1>
        <p className="text-body">No week is open yet. Set up a week and open it first.</p>
        <Link to="/admin/weeks" className="btn btn-primary">
          Set up a week
        </Link>
      </div>
    );
  }
  return <ImportForWeek key={`${sel.year}/${sel.week.id}`} sel={sel} />;
}

function ImportForWeek({ sel }: { sel: ReturnType<typeof useAdminWeek> }) {
  const week = sel.week!;
  const roster = useRoster();
  const entries = useEntriesList(sel.year, week.id);
  const runImport = useRunImport(sel.year, week.id);
  const { showToast } = useToast();
  const [openedAt] = useState(() => Date.now());
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, RowChoice>>({});
  const [replace, setReplace] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);

  const games = useMemo(() => [...week.games].sort((a, b) => a.order - b.order), [week.games]);
  const sheet = useMemo(() => (file ? readPicksSheet(file.text, games) : null), [file, games]);
  const players = useMemo(() => roster.data ?? [], [roster.data]);
  const matches = useMemo(
    () => new Map((sheet?.rows ?? []).map((r) => [r.line, matchRow(r.name, players)])),
    [sheet, players],
  );
  const effective = (line: number): RowChoice =>
    choices[line] ?? defaultChoice(matches.get(line) ?? { exact: null, similar: [] });
  const chosenIds = (sheet?.rows ?? []).flatMap((r) => {
    const c = effective(r.line);
    return c.kind === 'player' ? [c.playerId] : [];
  });
  const existing = useExistingEntries(sel.year, week.id, entries.data?.rows, chosenIds);

  if (roster.isPending || entries.isPending) return <p role="status">Loading…</p>;
  if (roster.isError || entries.isError) {
    return (
      <p role="alert" className="font-semibold text-ink-urgent">
        {friendlyError(roster.error ?? entries.error)}
      </p>
    );
  }

  const window = entryWindow(week, openedAt);
  const late = window.mode === 'late';
  const busy = progress !== null;
  const plan =
    sheet && sheet.problems.length === 0
      ? planRows({
          rows: sheet.rows,
          choices: Object.fromEntries(sheet.rows.map((r) => [r.line, effective(r.line)])),
          replace,
          roster: players,
          existing: existing.data ?? new Map(),
        })
      : [];
  const counts = planCounts(plan);
  const ready = existing.isSuccess;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again reads it again
    setOutcomes(null);
    setChoices({});
    setReplace(new Set());
    if (!chosen) return;
    if (chosen.size > 1_000_000) {
      setFile(null);
      setFileError('That file is too big for a week of picks. Choose the CSV file of the sheet.');
      return;
    }
    try {
      setFile({ name: chosen.name, text: await chosen.text() });
      setFileError(null);
    } catch {
      setFile(null);
      setFileError("Couldn't read that file. Save the sheet as CSV and choose it again.");
    }
  }

  async function onImport() {
    let lateReason: string | null = null;
    if (late) {
      const parsed = parseReason(reason, 'the late entries');
      if (!parsed.ok) {
        setReasonError(parsed.message);
        return;
      }
      lateReason = parsed.value;
    }
    const jobs: ImportJob[] = plan
      .filter((p) => willSave(p.status))
      .map(({ row }) => {
        const c = effective(row.line);
        return { row, playerId: c.kind === 'player' ? c.playerId : null };
      });
    setProgress({ done: 0, total: jobs.length });
    const result = await runImport(jobs, lateReason, (done) =>
      setProgress({ done, total: jobs.length }),
    );
    setProgress(null);
    setOutcomes(result);
    setFile(null);
    setChoices({});
    setReplace(new Set());
    const failed = result.filter((o) => !o.ok).length;
    showToast(
      failed === 0
        ? { message: `${result.length} ${result.length === 1 ? 'entry' : 'entries'} imported` }
        : { message: `${result.length - failed} imported, ${failed} didn't save`, tone: 'error' },
    );
  }

  return (
    <div className="flex max-w-player flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-h2">Import picks</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={week.status} />
          <WeekPicker weeks={sel.weeks} value={week.id} onChange={sel.select} />
        </div>
      </div>

      <p className="text-body">
        Bring in this week's picks from your spreadsheet. Save it as a CSV file first. The first
        column is the player's name, then one column per game (G1, G2, … MNF) with the team they
        picked, then the tiebreaker (TB Pts). Nothing is saved until you press Import.
      </p>
      <p className="text-body text-ink-muted">
        Picks already in, from the website or paper, are kept unless you tick Replace on that line.
        Picks {window.mode === 'open' ? 'lock' : 'locked'}{' '}
        {formatPoolDateTime(new Date(week.lockAtMs))}.
        {late && ' After the lock, every imported line is a late entry and needs a reason.'}
        {window.mode === 'backfill' &&
          ' This week was backfilled, so lines go in as normal entries.'}
      </p>

      {window.mode === 'closed' ? (
        <p role="alert" className="font-semibold text-ink-urgent">
          {window.message}
        </p>
      ) : (
        <Field
          label="Spreadsheet (CSV file)"
          hint={file ? `Reading ${file.name}` : undefined}
          error={fileError ?? undefined}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={onFile}
        />
      )}

      {outcomes && (
        <Outcomes outcomes={outcomes} rosterHref={`/admin/roster${sel.search(week.id)}`} />
      )}

      {sheet && sheet.problems.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-body font-semibold text-ink-urgent">
          <p>This file can't be imported yet:</p>
          <ul className="list-disc pl-5">
            {sheet.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {sheet && sheet.notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-ink-muted">
          {sheet.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {plan.length > 0 && (
        <>
          <p className="text-body" role="status">
            {plan.length} lines: <strong>{counts.save} to import</strong>
            {counts.newPlayers > 0 && ` (${counts.newPlayers} new to the roster)`}
            {counts.keep > 0 && `, ${counts.keep} already in and kept`}
            {counts.same > 0 && `, ${counts.same} already in with the same picks`}
            {counts.needChoice > 0 && `, ${counts.needChoice} need you to say who they are`}
            {counts.problems > 0 && `, ${counts.problems} can't be imported`}
            {counts.skip > 0 && `, ${counts.skip} skipped`}.
          </p>
          <ul className="flex flex-col gap-2" aria-label="Lines in the spreadsheet">
            {plan.map(({ row, status }) => (
              <ImportRowCard
                key={row.line}
                row={row}
                status={status}
                match={matches.get(row.line) ?? { exact: null, similar: [] }}
                choice={effective(row.line)}
                roster={players}
                disabled={busy}
                onChoice={(c) => setChoices((prev) => ({ ...prev, [row.line]: c }))}
                onReplace={(on) =>
                  setReplace((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(row.line);
                    else next.delete(row.line);
                    return next;
                  })
                }
              />
            ))}
          </ul>

          {late && (
            <Field
              label="Reason for the late entries"
              hint="Saved with every line, and shown as a Late entry badge."
              value={reason}
              error={reasonError ?? undefined}
              disabled={busy}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
            />
          )}

          {progress && (
            <p role="status" className="text-body">
              Saving {progress.done} of {progress.total}…
            </p>
          )}
          <Button disabled={busy || !ready || counts.save === 0} onClick={onImport}>
            {counts.save === 0
              ? 'Nothing to import'
              : `Import ${counts.save} ${counts.save === 1 ? 'entry' : 'entries'}`}
          </Button>
        </>
      )}
    </div>
  );
}

function Outcomes({ outcomes, rosterHref }: { outcomes: ImportOutcome[]; rosterHref: string }) {
  const failed = outcomes.filter((o) => !o.ok);
  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <p className="font-heading text-h3">
        {outcomes.length - failed.length} of {outcomes.length} imported
      </p>
      {failed.length > 0 && (
        <>
          <p className="text-body">These didn't save. Fix them and choose the file again:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body font-semibold text-ink-urgent">
            {failed.map((o) => (
              <li key={o.line}>
                Line {o.line}, {o.name}: {o.message}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={rosterHref} className="btn btn-ghost">
        See who's in on the roster
      </Link>
    </div>
  );
}
