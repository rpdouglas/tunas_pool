import { useState, type FormEvent } from 'react';
import { drawStepText, parseDrawNumbers, type DrawStep } from '@shared/bingoStaffView';
import { BingoBalls } from '../../../components/ui/BingoCard';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Panel } from '../../../components/ui/Panel';

export interface BingoDrawPanelProps {
  drawDate: string;
  step: DrawStep;
  numbers: number[] | null;
  isAdmin: boolean;
  busy: boolean;
  error: string | null;
  onEnter: (numbers: number[]) => void;
  onApprove: () => void;
  onSkip: (reason: string) => void;
}

/**
 * This week's draw for staff (D-126): type the six numbers after the cutoff, then a person checks
 * and approves. The commissioner can also skip a cancelled draw (D-129); a typo is fixed by typing
 * the numbers again while it waits, or with Correct once approved.
 */
export function BingoDrawPanel({
  drawDate,
  step,
  numbers,
  isAdmin,
  busy,
  error,
  onEnter,
  onApprove,
  onSkip,
}: BingoDrawPanelProps) {
  const [text, setText] = useState('');
  const [typed, setTyped] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState('');

  function enter(e: FormEvent) {
    e.preventDefault();
    const parsed = parseDrawNumbers(text);
    if (!parsed.ok) return setTyped(parsed.message);
    setTyped(null);
    onEnter(parsed.numbers);
    setText('');
  }

  const shownError = typed ?? error;
  return (
    <Panel title="This week's draw">
      <div className="flex flex-col gap-4">
        <p className="text-body" role="status">
          {drawStepText(step, drawDate, numbers)}
        </p>
        {step === 'waiting-approval' && numbers ? <BingoBalls numbers={numbers} hits={[]} /> : null}
        {step === 'waiting-approval' ? (
          <Button onClick={onApprove} disabled={busy}>
            Approve these numbers
          </Button>
        ) : null}
        {step !== 'before-cutoff' ? (
          <form className="flex flex-col gap-3" onSubmit={enter} noValidate>
            <Field
              label={
                step === 'waiting-approval' ? 'Typo? Type the six numbers again' : 'The six numbers'
              }
              hint="With spaces, like 4 5 6 33 34 35."
              inputMode="numeric"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={busy || !text.trim()}>
              Save the numbers
            </Button>
          </form>
        ) : null}
        {shownError ? (
          <p role="alert" className="text-body font-semibold text-ink-urgent">
            <span aria-hidden="true">⚠ </span>
            {shownError}
          </p>
        ) : null}
        {isAdmin ? (
          skipping ? (
            <div className="flex flex-col gap-3">
              <Field
                label="Why is this draw skipped?"
                hint="Money paid for it moves to the next draw. No card changes."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setSkipping(false)} disabled={busy}>
                  Don't skip
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onSkip(reason)}
                  disabled={busy || reason.trim().length < 3}
                >
                  Skip the draw
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="min-h-touch self-start text-body underline"
              onClick={() => setSkipping(true)}
            >
              The draw was cancelled or postponed
            </button>
          )
        ) : null}
      </div>
    </Panel>
  );
}

/** An approved draw, with Correct for the commissioner (D-129). */
export function ApprovedDrawRow({
  drawDate,
  label,
  numbers,
  paidCards,
  corrected,
  isAdmin,
  busy,
  onCorrect,
}: {
  drawDate: string;
  label: string;
  numbers: number[];
  paidCards: number;
  corrected: boolean;
  isAdmin: boolean;
  busy: boolean;
  onCorrect: (numbers: number[], reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <li
      className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3"
      data-draw={drawDate}
    >
      <p className="font-heading text-h3">
        {label}
        {corrected ? <span className="badge badge-pending ml-2">Corrected</span> : null}
      </p>
      <p className="text-body">
        {numbers.join(' ')} · {paidCards} card{paidCards === 1 ? '' : 's'} paid
      </p>
      {isAdmin ? (
        open ? (
          <div className="flex flex-col gap-3">
            <Field
              label="The right six numbers"
              inputMode="numeric"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Field label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            {error ? (
              <p role="alert" className="text-body font-semibold text-ink-urgent">
                <span aria-hidden="true">⚠ </span>
                {error}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                disabled={busy || reason.trim().length < 3}
                onClick={() => {
                  const parsed = parseDrawNumbers(text);
                  if (!parsed.ok) return setError(parsed.message);
                  setError(null);
                  onCorrect(parsed.numbers, reason);
                }}
              >
                Correct it
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="min-h-touch self-start text-body underline"
            onClick={() => setOpen(true)}
          >
            Correct this draw
          </button>
        )
      ) : null}
    </li>
  );
}
