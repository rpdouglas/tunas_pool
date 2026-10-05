import { useId, useState } from 'react';
import type { ClaimRow } from '@shared/adminTypes';
import { DUPLICATE_REASON_TEXT } from '@shared/duplicates';
import { formatPhone } from '@shared/phone';
import { formatPoolDateTime } from '@shared/time';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';

const OTHER = '__other__';

function weeks(n: number) {
  return `${n} ${n === 1 ? 'week' : 'weeks'} played`;
}

export interface ClaimCardProps {
  claim: ClaimRow;
  /** Roster players that can still be linked, for "someone else". */
  others: { playerId: string; displayName: string }[];
  busy: boolean;
  onApprove: (playerId: string, displayName: string) => void;
  onReject: (note: string | null) => void;
}

/**
 * One request to link a login to a roster player (DESIGN_SYSTEM §6): who is asking, the likely
 * matches with the best one already chosen, and Approve. Built for the counter: when the match is
 * right, it is one tap (Commissioner Counter Test). Nothing is ever linked without that tap (D-004).
 */
export function ClaimCard({ claim, others, busy, onApprove, onReject }: ClaimCardProps) {
  const group = useId();
  const [choice, setChoice] = useState<string | null>(claim.suggestedPlayerId);
  const [otherId, setOtherId] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const listed = new Set(claim.candidates.map((c) => c.playerId));
  const otherOptions = others.filter((o) => !listed.has(o.playerId));
  const chosenId = choice === OTHER ? otherId : choice;
  const chosenName =
    claim.candidates.find((c) => c.playerId === chosenId)?.displayName ??
    others.find((o) => o.playerId === chosenId)?.displayName ??
    null;

  return (
    <li className="flex flex-col gap-3 rounded-md border-2 border-line-subtle bg-surface p-3">
      <div className="flex flex-col gap-1">
        <h2 className="break-words font-heading text-h3">{claim.claimedName}</h2>
        <p className="break-words text-body text-ink-muted">
          {claim.claimedPhone ? formatPhone(claim.claimedPhone) : 'No phone given'}
          {' · '}
          {claim.requesterEmail ?? 'No email'}
        </p>
        <p className="text-body-sm text-ink-muted">
          Asked {formatPoolDateTime(new Date(claim.createdAtMs), { weekday: 'short' })}
        </p>
      </div>

      {claim.requesterProfile && (
        <p className="rounded-md bg-gold-50 p-2 text-body text-gold-800">
          <span aria-hidden="true">ⓘ </span>
          <strong>Check:</strong> this login already plays on the website as{' '}
          {claim.requesterProfile.displayName} ({weeks(claim.requesterProfile.weeksPlayed)}).
          Approving joins those weeks to the player you choose. That can't be undone.
        </p>
      )}
      {claim.sharedSuggestion && (
        <p className="rounded-md bg-gold-50 p-2 text-body text-gold-800">
          <span aria-hidden="true">ⓘ </span>
          <strong>Check:</strong> another request is waiting for the same player.
        </p>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="field-label mb-1">Who is this?</legend>
        {claim.candidates.length === 0 && (
          <p className="text-body">Nobody on the roster matches that name or phone.</p>
        )}
        {claim.candidates.map((c) => (
          <label
            key={c.playerId}
            className="flex min-h-touch cursor-pointer items-center gap-3 text-body"
          >
            <input
              type="radio"
              className="h-6 w-6 flex-none accent-purple-700"
              name={group}
              checked={choice === c.playerId}
              disabled={c.linked}
              onChange={() => setChoice(c.playerId)}
            />
            <span className="min-w-0 break-words">
              <strong>{c.displayName}</strong>
              {c.phone ? ` · ${formatPhone(c.phone)}` : ''} · {weeks(c.weeksPlayed)}
              <span className="block text-body-sm text-ink-muted">
                {c.reasons.map((r) => DUPLICATE_REASON_TEXT[r]).join(', ')}
                {!c.active && ' · Inactive'}
                {c.linked && ' · Already linked to a login, so it can’t be linked again'}
              </span>
            </span>
          </label>
        ))}
        {otherOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="flex min-h-touch cursor-pointer items-center gap-3 text-body">
              <input
                type="radio"
                className="h-6 w-6 flex-none accent-purple-700"
                name={group}
                checked={choice === OTHER}
                onChange={() => setChoice(OTHER)}
              />
              Someone else on the roster
            </label>
            {choice === OTHER && (
              <select
                className="field"
                aria-label="Someone else on the roster"
                value={otherId}
                onChange={(e) => setOtherId(e.target.value)}
              >
                <option value="">Choose a player</option>
                {otherOptions.map((o) => (
                  <option key={o.playerId} value={o.playerId}>
                    {o.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </fieldset>

      {rejecting ? (
        <div className="flex flex-col gap-3">
          <Field
            label="A note for them (optional)"
            hint="They see this with the answer. Keep it friendly, like: Stop by the shop and we'll sort it out."
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onReject(note.trim() || null)}
            >
              Reject request
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            variant="primary"
            className="px-2"
            disabled={busy || !chosenId}
            onClick={() => chosenId && chosenName && onApprove(chosenId, chosenName)}
          >
            {chosenName ? `Link to ${chosenName}` : 'Choose who this is'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setRejecting(true)}
            aria-label={`Reject the request from ${claim.claimedName}`}
          >
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}
