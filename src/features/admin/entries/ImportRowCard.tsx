import { useId } from 'react';
import { SOURCE_LABELS } from '@shared/paperEntry';
import type { SheetRow } from '@shared/picksImport';
import type { EntrySource } from '@shared/types';
import { Checkbox } from '../../../components/ui/Checkbox';
import type { RosterPlayer } from '../roster/roster';
import type { RowChoice, RowMatch, RowStatus } from './importPlan';

export interface ImportRowCardProps {
  row: SheetRow;
  status: RowStatus;
  match: RowMatch;
  choice: RowChoice;
  /** Active roster players, for "Someone else on the roster". */
  roster: RosterPlayer[];
  onChoice: (choice: RowChoice) => void;
  onReplace: (replace: boolean) => void;
  disabled?: boolean;
}

const choiceValue = (c: RowChoice) =>
  c.kind === 'player' ? `p:${c.playerId}` : c.kind === 'undecided' ? '' : c.kind;

function toChoice(value: string): RowChoice {
  if (value.startsWith('p:')) return { kind: 'player', playerId: value.slice(2) };
  if (value === 'new' || value === 'skip') return { kind: value };
  return { kind: 'undecided' };
}

const sourceWord = (source: string) =>
  source === 'web'
    ? 'the website'
    : (SOURCE_LABELS[source as EntrySource]?.toLowerCase() ?? source);

function StatusLine({ status }: { status: RowStatus }) {
  switch (status.kind) {
    case 'save':
      return status.newPlayer ? (
        <span className="badge badge-open">
          <span aria-hidden="true">＋</span>New player, added to the roster
        </span>
      ) : (
        <span className="badge badge-open">
          <span aria-hidden="true">✓</span>Ready
        </span>
      );
    case 'same':
      return (
        <span className="badge badge-paid">
          <span aria-hidden="true">✓</span>Already in, same picks
        </span>
      );
    case 'keep':
    case 'replace':
      return (
        <span className="badge badge-pending">
          Already in from {sourceWord(status.existing.source)}, {status.differences} different
        </span>
      );
    case 'undecided':
      return (
        <span className="badge badge-pending">
          <span aria-hidden="true">?</span>Who is this?
        </span>
      );
    case 'skip':
      return <span className="badge badge-draft">Not imported</span>;
    default:
      return (
        <span className="badge badge-locked">
          <span aria-hidden="true">⚠</span>Can't import
        </span>
      );
  }
}

/** One line of the spreadsheet in the import preview: who it is, and what Import will do with it. */
export function ImportRowCard({
  row,
  status,
  match,
  choice,
  roster,
  onChoice,
  onReplace,
  disabled,
}: ImportRowCardProps) {
  const selectId = useId();
  const picked = Object.keys(row.picks).length;
  const suggested = match.exact ? [match.exact] : match.similar;
  const others = roster.filter((p) => p.active && !suggested.includes(p));
  const problems =
    status.kind === 'problem'
      ? status.messages
      : status.kind === 'inactive'
        ? [
            `${status.name} is marked inactive. Make them active on the roster first, or skip this line.`,
          ]
        : status.kind === 'taken'
          ? [`Line ${status.otherLine} is the same player. Choose someone else, or skip this line.`]
          : [];

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="break-words font-heading text-h3">{row.name || 'No name'}</p>
        <p className="text-body-sm text-ink-muted">Line {row.line}</p>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-body">
        <StatusLine status={status} />
        {status.kind !== 'problem' && (
          <span className="text-ink-muted">
            {picked} {picked === 1 ? 'pick' : 'picks'}
            {row.blankGameIds.length > 0 && `, ${row.blankGameIds.length} blank`}, tiebreaker{' '}
            {row.tiebreakerTotal}
          </span>
        )}
      </p>
      {problems.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body font-semibold text-ink-urgent">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {status.kind !== 'problem' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="field-label">
            Who is this?
          </label>
          <select
            id={selectId}
            className="field"
            value={choiceValue(choice)}
            disabled={disabled}
            onChange={(e) => onChoice(toChoice(e.target.value))}
          >
            {choice.kind === 'undecided' && <option value="">Choose…</option>}
            {suggested.map((p) => (
              <option key={p.playerId} value={`p:${p.playerId}`}>
                {p.displayName} (on the roster)
              </option>
            ))}
            <option value="new">Add {row.name} as a new player</option>
            <option value="skip">Don't import this line</option>
            {others.length > 0 && (
              <optgroup label="Someone else on the roster">
                {others.map((p) => (
                  <option key={p.playerId} value={`p:${p.playerId}`}>
                    {p.displayName}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}
      {(status.kind === 'keep' || status.kind === 'replace') && (
        <Checkbox
          label="Replace their picks with the spreadsheet's"
          checked={status.kind === 'replace'}
          disabled={disabled}
          onChange={(e) => onReplace(e.target.checked)}
        />
      )}
    </li>
  );
}
