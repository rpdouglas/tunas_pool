import { useState } from 'react';
import { paymentRowText, type PaymentRowData } from '@shared/bingoStaffView';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { StatusBadge } from '../../../components/ui/StatusBadge';

export interface PayExtra {
  receivedAtMs: number;
  reason: string;
}

export interface BingoPaymentRowProps {
  row: PaymentRowData;
  /** Only the commissioner confirms or undoes an e-Transfer (D-114). */
  isAdmin: boolean;
  busy: boolean;
  onPay: (method: 'cash' | 'etransfer', extra?: PayExtra) => void;
  onUndo: () => void;
  /** Take back money taken late, which counts for next week's draw. */
  onUndoNext?: () => void;
}

/** "2026-11-18T17:50" from a datetime-local box, as the device's own time. */
const fromLocal = (value: string) => new Date(value).getTime();

/**
 * One card in this week's bingo payments: the Commissioner Counter Test, one tap for cash and an
 * Undo. "Received earlier?" sets when the money came (D-119) for cash handed over before six and
 * typed in after; it needs a reason.
 */
export function BingoPaymentRow({
  row,
  isAdmin,
  busy,
  onPay,
  onUndo,
  onUndoNext,
}: BingoPaymentRowProps) {
  const [earlier, setEarlier] = useState(false);
  const [when, setWhen] = useState('');
  const [reason, setReason] = useState('');
  const paid = row.due?.paid === true;
  const name = row.displayName;
  const extra = earlier && when ? { receivedAtMs: fromLocal(when), reason } : undefined;
  const canUndo = paid && (isAdmin || row.due?.method === 'cash');
  const canUndoNext = !paid && row.paidNext && onUndoNext && (isAdmin || row.nextMethod === 'cash');

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <p className="flex flex-wrap items-center gap-2 font-heading text-h3">
            <span className="break-words">{name}</span>
            {paid && <StatusBadge status="paid" />}
            {row.paper && <span className="badge badge-draft">Paper</span>}
          </p>
          <p className="text-body text-ink-muted">
            {row.label}: {row.numbers.join(' ')}
          </p>
          <p className="text-body">{paymentRowText(row)}</p>
        </div>
        {canUndo ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={onUndo}
            aria-label={`Undo paid for ${name}, ${row.label}`}
          >
            Undo
          </Button>
        ) : null}
      </div>

      {canUndoNext ? (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={onUndoNext}
          aria-label={`Undo the late payment for ${name}, ${row.label}`}
        >
          Undo late payment
        </Button>
      ) : null}
      {!paid ? (
        <>
          <div
            className={`grid gap-2 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}
            role="group"
            aria-label={`Mark ${name} paid`}
          >
            <Button
              disabled={busy || (earlier && (!when || reason.trim().length < 3))}
              onClick={() => onPay('cash', extra)}
              aria-label={`Mark ${name}, ${row.label}, paid in cash`}
            >
              Paid cash
            </Button>
            {isAdmin ? (
              <Button
                disabled={busy || (earlier && (!when || reason.trim().length < 3))}
                onClick={() => onPay('etransfer', extra)}
                aria-label={`Mark ${name}, ${row.label}, paid by e-Transfer`}
              >
                Paid e-Transfer
              </Button>
            ) : null}
          </div>
          <button
            type="button"
            className="min-h-touch self-start text-body underline"
            aria-expanded={earlier}
            onClick={() => setEarlier((v) => !v)}
          >
            {earlier ? 'Received now' : 'Received earlier?'}
          </button>
          {earlier ? (
            <div className="flex flex-col gap-3">
              <Field
                label="When the money came in"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
              <Field
                label="Reason"
                hint="For example: handed over before six, busy counter."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
