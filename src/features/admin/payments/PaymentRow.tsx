import { Link } from 'react-router-dom';
import { DUPLICATE_REASON_TEXT } from '@shared/duplicates';
import { SOURCE_LABELS } from '@shared/paperEntry';
import { formatPhone } from '@shared/phone';
import type { EntryRow } from '@shared/adminTypes';
import type { EntrySource, PaymentMethod } from '@shared/types';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';

const METHOD_WORD: Record<PaymentMethod, string> = { cash: 'Cash', etransfer: 'e-Transfer' };

function declaration(row: EntryRow): string {
  if (!row.paymentMethod) return "Hasn't said how they'll pay";
  const intent = row.paymentIntent === 'already_did' ? 'says already paid' : 'plans to pay';
  return `${METHOD_WORD[row.paymentMethod]} · ${intent}`;
}

/** "Paper", "Text", or "Phone" when the admin entered it for them. Nothing for a website entry. */
function sourceWord(row: EntryRow): string | null {
  return row.source !== 'web' && row.source in SOURCE_LABELS
    ? SOURCE_LABELS[row.source as EntrySource]
    : null;
}

export interface PaymentRowProps {
  row: EntryRow;
  busy: boolean;
  onPay: (method?: PaymentMethod) => void;
  onUndo: () => void;
  /** Where "Picks" goes: the admin's entry screen for this player. Omit to leave the link out. */
  picksHref?: string;
  /** An `sms:` link with a neutral note about payment, for an unpaid entry with a phone number. */
  nudgeHref?: string;
}

/**
 * One entry in the payments queue (DESIGN_SYSTEM §6): name, phone, what they said, and one big
 * button. 56px high, built for one thumb at the counter (Commissioner Counter Test).
 */
export function PaymentRow({ row, busy, onPay, onUndo, picksHref, nudgeHref }: PaymentRowProps) {
  const paid = row.paymentStatus === 'paid';
  const name = row.displayName;
  const source = sourceWord(row);

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <p className="flex flex-wrap items-center gap-2 font-heading text-h3">
            <span className="break-words">{name}</span>
            {paid && <StatusBadge status="paid" />}
            {row.lateOverride && <span className="badge badge-pending">Late entry</span>}
          </p>
          <p className="text-body text-ink-muted">
            {declaration(row)}
            {source && ` · ${source}`}
          </p>
          {row.phone && (
            <a
              href={`tel:${row.phone}`}
              className="inline-flex min-h-touch items-center text-body underline"
            >
              {formatPhone(row.phone)}
            </a>
          )}
        </div>

        {row.paymentMethod || paid ? (
          paid ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={onUndo}
              aria-label={`Undo paid for ${name}`}
            >
              Undo
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => onPay()}
              aria-label={`Mark ${name} paid`}
            >
              Paid
            </Button>
          )
        ) : null}
      </div>

      {!row.paymentMethod && !paid && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Mark ${name} paid`}>
          <Button
            variant="primary"
            className="px-2"
            disabled={busy}
            onClick={() => onPay('cash')}
            aria-label={`Mark ${name} paid in cash`}
          >
            Paid cash
          </Button>
          <Button
            variant="primary"
            className="px-2"
            disabled={busy}
            onClick={() => onPay('etransfer')}
            aria-label={`Mark ${name} paid by e-Transfer`}
          >
            Paid e-Transfer
          </Button>
        </div>
      )}

      {(picksHref || (nudgeHref && !paid)) && (
        <div className="flex flex-wrap items-center gap-x-5">
          {picksHref && (
            <Link
              to={picksHref}
              className="inline-flex min-h-touch items-center text-body text-ink-emphasis underline"
              aria-label={`Picks for ${name}`}
            >
              Picks
            </Link>
          )}
          {nudgeHref && !paid && (
            <a
              href={nudgeHref}
              className="inline-flex min-h-touch items-center text-body text-ink-emphasis underline"
              aria-label={`Text ${name} about payment`}
            >
              Text about payment
            </a>
          )}
        </div>
      )}

      {row.duplicates.map((d) => (
        <p key={d.otherPlayerId} className="rounded-md bg-gold-50 p-2 text-body text-gold-800">
          <span aria-hidden="true">ⓘ </span>
          <strong>Check:</strong> possible duplicate of {d.otherName} (
          {d.reasons.map((r) => DUPLICATE_REASON_TEXT[r].toLowerCase()).join(', ')}).
        </p>
      ))}
    </li>
  );
}
