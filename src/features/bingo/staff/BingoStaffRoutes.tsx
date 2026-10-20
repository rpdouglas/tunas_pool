/**
 * Tunas 649 Bingo, the staff side (BINGO_PLAN S15): Payments, Draw, Members, and for the
 * commissioner Settings and Totals. One lazy chunk, at /admin/bingo for the commissioner and
 * /counter/bingo for Devon, with his limits (D-114) shown as missing buttons and enforced again by
 * the functions. Back Office surface.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { cutoffAt } from '@shared/bingo';
import { addDays } from '@shared/time';
import { dollars, drawDay } from '@shared/bingoView';
import { drawStep, paidCountText, totalsText } from '@shared/bingoStaffView';
import { BingoNumberPicker } from '../../../components/ui/BingoNumberPicker';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Field } from '../../../components/ui/Field';
import { Panel } from '../../../components/ui/Panel';
import { useAuth } from '../../auth/useAuth';
import { bingoError } from '../bingoData';
import { ApprovedDrawRow, BingoDrawPanel } from './BingoDrawPanel';
import { BingoPaymentRow, type PayExtra } from './BingoPaymentRow';
import {
  useAddMember,
  useApproveDraw,
  useBingoRoster,
  useBingoTotals,
  useCorrectDraw,
  useEnterDraw,
  useSetBingoPayment,
  useSetCode,
  useSetConfig,
  useSetPayout,
  useSkipDraw,
  useStaffBingo,
  useStaffCreateCard,
  useStartCycle,
  type StaffBingo,
  type StaffConfig,
} from './staffData';

function Alert({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-body font-semibold text-ink-urgent">
      <span aria-hidden="true">⚠ </span>
      {message}
    </p>
  ) : null;
}

function Done({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="text-body font-semibold">
      <span aria-hidden="true">✓ </span>
      {message}
    </p>
  ) : null;
}

/** Run a callable and keep its plain-words error, or a done note. */
function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (p: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setDone(null);
    try {
      await p();
      if (ok) setDone(ok);
      return true;
    } catch (err) {
      setError(bingoError(err));
      return false;
    }
  };
  return { error, done, run, setDone };
}

export default function BingoStaffRoutes({ base }: { base: string }) {
  const { isAdmin } = useAuth();
  const data = useStaffBingo();
  const tabs = [
    { to: `${base}/payments`, label: 'Payments' },
    { to: `${base}/draw`, label: 'Draw' },
    { to: `${base}/members`, label: 'Members' },
    ...(isAdmin
      ? [
          { to: `${base}/settings`, label: 'Settings' },
          { to: `${base}/totals`, label: 'Totals' },
        ]
      : []),
  ];

  let body: ReactNode;
  if (data.isError) body = <Alert message="Bingo didn't load. Check your signal and refresh." />;
  else if (!data.data)
    body = (
      <p role="status" className="text-body">
        Loading…
      </p>
    );
  else {
    const d = data.data;
    body = (
      <Routes>
        <Route index element={<Navigate to={`${base}/payments`} replace />} />
        <Route path="payments" element={<PaymentsScreen d={d} isAdmin={isAdmin} base={base} />} />
        <Route path="draw" element={<DrawScreen d={d} isAdmin={isAdmin} base={base} />} />
        <Route path="members" element={<MembersScreen d={d} isAdmin={isAdmin} />} />
        {isAdmin ? <Route path="settings" element={<SettingsScreen d={d} />} /> : null}
        {isAdmin ? <Route path="totals" element={<TotalsScreen />} /> : null}
        <Route path="*" element={<Navigate to={`${base}/payments`} replace />} />
      </Routes>
    );
  }

  return (
    <div className="flex max-w-player flex-col gap-4">
      <h1 className="font-heading text-h2">Bingo</h1>
      <nav aria-label="Bingo" className="flex flex-wrap gap-x-4">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className="flex min-h-touch items-center text-body underline-offset-4 aria-[current=page]:font-semibold aria-[current=page]:underline"
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {body}
    </div>
  );
}

const nextDrawOf = (drawDate: string) => addDays(drawDate, 7);

function GameLine({ d }: { d: StaffBingo }) {
  if (!d.open) return null;
  return (
    <p className="text-body">
      Game {d.open.number}
      {d.open.test ? ' (practice)' : ''} · pot {dollars(d.open.potCents)} · {d.open.drawsApproved}{' '}
      draw
      {d.open.drawsApproved === 1 ? '' : 's'} so far
    </p>
  );
}

function NotReady({ d, isAdmin, base }: { d: StaffBingo; isAdmin: boolean; base: string }) {
  if (d.config && d.open) return null;
  return (
    <Panel>
      <p className="text-body">
        {!d.config ? "Bingo isn't set up yet." : 'No game is open right now.'}{' '}
        {isAdmin ? (
          <NavLink to={`${base}/settings`} className="underline">
            {!d.config ? 'Set it up' : 'Start a game'}
          </NavLink>
        ) : (
          'Ask the commissioner.'
        )}
      </p>
    </Panel>
  );
}

// ---- Payments: every card this week, one tap each; then winners to pay ----
function PaymentsScreen({ d, isAdmin, base }: { d: StaffBingo; isAdmin: boolean; base: string }) {
  const pay = useSetBingoPayment();
  const payout = useSetPayout();
  const { error, run } = useAction();
  const [lateReason, setLateReason] = useState('');
  const afterCutoff = Boolean(
    d.open && d.dueDraw && Date.now() >= cutoffAt(d.dueDraw, d.open.config.cutoff).getTime(),
  );
  const busy = pay.isPending || payout.isPending;

  return (
    <>
      <NotReady d={d} isAdmin={isAdmin} base={base} />
      {d.open && d.dueDraw ? (
        <Panel title={`Payments for ${drawDay(d.dueDraw)}`}>
          <div className="flex flex-col gap-3">
            <GameLine d={d} />
            {afterCutoff ? (
              <Field
                label="After 6 PM: money taken now counts for next week. Reason"
                hint="Needed after the cutoff, for example: e-Transfer came in after six."
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
              />
            ) : null}
            <p className="text-body font-semibold">{paidCountText(d.rows)}</p>
            <Alert message={error} />
            {d.rows.length === 0 ? <p className="text-body">No cards in this game yet.</p> : null}
            <ul className="flex flex-col gap-2">
              {d.rows.map((row) => (
                <BingoPaymentRow
                  key={row.cardId}
                  row={row}
                  isAdmin={isAdmin}
                  busy={busy}
                  onPay={(method, extra?: PayExtra) =>
                    run(() =>
                      pay.mutateAsync({
                        cardId: row.cardId,
                        paid: true,
                        method,
                        ...(extra ? { receivedAtMs: extra.receivedAtMs } : {}),
                        reason: extra?.reason || lateReason || undefined,
                      }),
                    )
                  }
                  onUndoNext={() =>
                    run(() =>
                      pay.mutateAsync({
                        cardId: row.cardId,
                        paid: false,
                        drawDate: nextDrawOf(d.dueDraw!),
                      }),
                    )
                  }
                  onUndo={() =>
                    run(() =>
                      pay.mutateAsync({ cardId: row.cardId, paid: false, drawDate: d.dueDraw! }),
                    )
                  }
                />
              ))}
            </ul>
          </div>
        </Panel>
      ) : null}

      {d.unpaid.map((c) => (
        <Panel key={c.id} title={`Winners to pay: game ${c.number}`}>
          <ul className="flex flex-col gap-2">
            {c.winners.map((w) => (
              <li
                key={w.cardId}
                className="flex flex-col gap-2 rounded-md border-2 border-line-subtle bg-surface p-3"
              >
                <p className="font-heading text-h3">
                  {w.displayName}: {dollars(w.shareCents)}
                </p>
                {w.paidOut ? (
                  <p className="text-body">
                    <span aria-hidden="true">✓ </span>Paid,{' '}
                    {w.paidOut.method === 'etransfer' ? 'e-Transfer' : 'cash'}.
                  </p>
                ) : (
                  <div className={`grid gap-2 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          payout.mutateAsync({
                            cycleId: c.id,
                            cardId: w.cardId,
                            paid: true,
                            method: 'cash',
                          }),
                        )
                      }
                    >
                      Paid out cash
                    </Button>
                    {isAdmin ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            payout.mutateAsync({
                              cycleId: c.id,
                              cardId: w.cardId,
                              paid: true,
                              method: 'etransfer',
                            }),
                          )
                        }
                      >
                        Paid out e-Transfer
                      </Button>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </>
  );
}

// ---- Draw: type, approve, correct, skip ----
function DrawScreen({ d, isAdmin, base }: { d: StaffBingo; isAdmin: boolean; base: string }) {
  const enter = useEnterDraw();
  const approve = useApproveDraw();
  const correct = useCorrectDraw();
  const skip = useSkipDraw();
  const { error, done, run, setDone } = useAction();
  const busy = enter.isPending || approve.isPending || correct.isPending || skip.isPending;

  if (!d.open || !d.dueDraw) return <NotReady d={d} isAdmin={isAdmin} base={base} />;
  const due = d.draws.find((x) => x.date === d.dueDraw) ?? null;
  const cutoffMs = due?.cutoffAtMs || cutoffAt(d.dueDraw, d.open.config.cutoff).getTime();
  const step = drawStep(due?.status ?? null, Date.now(), cutoffMs);
  const approved = d.draws.filter((x) => x.status === 'approved' && x.numbers);

  const outcomeText = (o: {
    kind: string;
    winners?: { displayName: string; shareCents: number }[];
  }) =>
    o.kind === 'won'
      ? `Approved. Bingo! ${(o.winners ?? []).map((w) => `${w.displayName} wins ${dollars(w.shareCents)}`).join(', ')}. The next game is open.`
      : o.kind === 'capped' || o.kind === 'carried'
        ? 'Approved. That was the last week of this game; see Payments for any winners. The next game is open.'
        : 'Approved. Cards are updated.';

  return (
    <>
      <GameLine d={d} />
      <Done message={done} />
      <BingoDrawPanel
        drawDate={d.dueDraw}
        step={step}
        numbers={due?.numbers ?? null}
        isAdmin={isAdmin}
        busy={busy}
        error={error}
        onEnter={(numbers) =>
          run(() => enter.mutateAsync({ numbers }), 'Saved. Now check them and approve.')
        }
        onApprove={async () => {
          setDone(null);
          try {
            setDone(outcomeText(await approve.mutateAsync({ drawDate: d.dueDraw! })));
          } catch (err) {
            await run(() => Promise.reject(err));
          }
        }}
        onSkip={(reason) =>
          run(
            () => skip.mutateAsync({ drawDate: d.dueDraw!, reason }),
            'Skipped. Its money moved to the next draw.',
          )
        }
      />
      {approved.length > 0 ? (
        <Panel title="Draws this game">
          <ul className="flex flex-col gap-2">
            {approved.map((x) => (
              <ApprovedDrawRow
                key={x.date}
                drawDate={x.date}
                label={drawDay(x.date)}
                numbers={x.numbers!}
                paidCards={x.paidCards}
                corrected={x.corrected}
                isAdmin={isAdmin}
                busy={busy}
                onCorrect={(numbers, reason) =>
                  run(
                    () =>
                      correct.mutateAsync({
                        cycleId: d.open!.id,
                        drawDate: x.date,
                        numbers,
                        reason,
                      }),
                    'Corrected. Cards are worked out again.',
                  )
                }
              />
            ))}
          </ul>
        </Panel>
      ) : null}
      {isAdmin && d.correctable && d.correctable.draws.length > 0 ? (
        <Panel title={`Last game (${d.correctable.cycle.number}): until a winner is paid`}>
          <ul className="flex flex-col gap-2">
            {d.correctable.draws.map((x) => (
              <ApprovedDrawRow
                key={x.date}
                drawDate={x.date}
                label={drawDay(x.date)}
                numbers={x.numbers ?? []}
                paidCards={x.paidCards}
                corrected={x.corrected}
                isAdmin
                busy={busy}
                onCorrect={(numbers, reason) =>
                  run(
                    () =>
                      correct.mutateAsync({
                        cycleId: d.correctable!.cycle.id,
                        drawDate: x.date,
                        numbers,
                        reason,
                      }),
                    'Corrected. That game is worked out again.',
                  )
                }
              />
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}

// ---- Members: who's in, a paper member, a paper card ----
function MembersScreen({ d, isAdmin }: { d: StaffBingo; isAdmin: boolean }) {
  const roster = useBingoRoster(true);
  const add = useAddMember();
  const card = useStaffCreateCard();
  const { error, done, run } = useAction();
  const [who, setWho] = useState('');
  const [age, setAge] = useState(false);
  const [cardFor, setCardFor] = useState('');

  return (
    <>
      <Done message={done} />
      <Alert message={error} />
      <Panel title={`Members (${d.members.length})`}>
        {d.members.length === 0 ? (
          <p className="text-body">Nobody yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body">
            {d.members.map((m) => (
              <li key={m.playerId} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{m.displayName}</span>
                {m.paper ? <span className="badge badge-draft">Paper</span> : null}
                <span className="text-ink-muted">
                  {m.activeCards} card{m.activeCards === 1 ? '' : 's'}
                  {m.paused ? ' · sitting out' : m.limit < 5 ? ` · own limit ${m.limit}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Add a member on paper">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(() => add.mutateAsync({ playerId: who, ageConfirmed: age }), 'Added.').then(
              (ok) => {
                if (ok) {
                  setWho('');
                  setAge(false);
                }
              },
            );
          }}
        >
          <p className="text-body text-ink-muted">
            For someone without a phone. They must be on the roster first
            {isAdmin ? '' : ' (add them from the Counter screen)'}.
          </p>
          <label className="field-label" htmlFor="bingo-add-member">
            Who
          </label>
          <select
            id="bingo-add-member"
            className="field"
            value={who}
            onChange={(e) => setWho(e.target.value)}
          >
            <option value="">Choose a player</option>
            {(roster.data ?? []).map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.displayName}
              </option>
            ))}
          </select>
          <Checkbox
            label="I checked they're 18 or older, in person"
            checked={age}
            onChange={(e) => setAge(e.target.checked)}
          />
          <Button type="submit" variant="secondary" disabled={!who || !age || add.isPending}>
            Add to bingo
          </Button>
        </form>
      </Panel>

      {d.open ? (
        <Panel title="Add a paper card">
          <div className="flex flex-col gap-3">
            <label className="field-label" htmlFor="bingo-card-for">
              For
            </label>
            <select
              id="bingo-card-for"
              className="field"
              value={cardFor}
              onChange={(e) => setCardFor(e.target.value)}
            >
              <option value="">Choose a member</option>
              {d.members.map((m) => (
                <option key={m.playerId} value={m.playerId}>
                  {m.displayName}
                </option>
              ))}
            </select>
            {cardFor ? (
              <BingoNumberPicker
                busy={card.isPending}
                onSubmit={(numbers) =>
                  run(() => card.mutateAsync({ playerId: cardFor, numbers }), 'Card added.')
                }
              />
            ) : null}
          </div>
        </Panel>
      ) : null}
    </>
  );
}

// ---- Settings (commissioner): the game's settings, the code, starting a game ----
const DEFAULT_CONFIG: StaffConfig = {
  enabled: false,
  priceCents: 1000,
  operatorPct: 40,
  cutoff: { weekday: 3, time: '18:00', tz: 'America/Toronto' },
  maxCardsPerPlayer: 5,
  maxWeeks: 26,
  joinWindowDraws: 1,
};

function SettingsScreen({ d }: { d: StaffBingo }) {
  const save = useSetConfig();
  const code = useSetCode();
  const start = useStartCycle();
  const { error, done, run } = useAction();
  const [c, setC] = useState<StaffConfig>(d.config ?? DEFAULT_CONFIG);
  const [newCode, setNewCode] = useState('');
  const [practice, setPractice] = useState(true);
  const num = (v: string) => (v === '' ? NaN : Number(v));

  return (
    <>
      <Done message={done} />
      <Alert message={error} />
      <Panel title="Settings">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => save.mutateAsync({ config: c }),
              'Saved. Changes apply from the next game.',
            );
          }}
        >
          <p className="text-body text-ink-muted">
            A running game keeps the settings it started with. Changes apply from the next game.
          </p>
          <Checkbox
            label="Bingo is on (members and the code page can be found)"
            checked={c.enabled}
            onChange={(e) => setC({ ...c, enabled: e.target.checked })}
          />
          <Field
            label="Price a card a draw, in dollars"
            inputMode="decimal"
            value={String(c.priceCents / 100)}
            onChange={(e) => setC({ ...c, priceCents: Math.round(num(e.target.value) * 100) })}
          />
          <Field
            label="House share, in percent"
            inputMode="numeric"
            value={String(c.operatorPct)}
            onChange={(e) => setC({ ...c, operatorPct: num(e.target.value) })}
          />
          <Field
            label="Cutoff on Wednesday (24-hour, Toronto time)"
            value={c.cutoff.time}
            onChange={(e) => setC({ ...c, cutoff: { ...c.cutoff, time: e.target.value } })}
          />
          <Field
            label="Most cards one person can have (1 to 5)"
            inputMode="numeric"
            value={String(c.maxCardsPerPlayer)}
            onChange={(e) => setC({ ...c, maxCardsPerPlayer: num(e.target.value) })}
          />
          <Field
            label="Longest game, in weeks"
            inputMode="numeric"
            value={String(c.maxWeeks)}
            onChange={(e) => setC({ ...c, maxWeeks: num(e.target.value) })}
          />
          <Button type="submit" variant="secondary" disabled={save.isPending}>
            Save settings
          </Button>
        </form>
      </Panel>

      <Panel title="Invite code">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => code.mutateAsync({ code: newCode }),
              'New code set. The old one no longer works.',
            ).then((ok) => ok && setNewCode(''));
          }}
        >
          <Field
            label="New code"
            hint="8 to 32 letters and numbers. The old code stops working. It's never shown again, or written in the log."
            autoComplete="off"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={code.isPending || !newCode.trim()}>
            Set the code
          </Button>
        </form>
      </Panel>

      {!d.open && d.config ? (
        <Panel title="Start a game">
          <div className="flex flex-col gap-3">
            <Checkbox
              label="Practice game (the dry run: no real money)"
              checked={practice}
              onChange={(e) => setPractice(e.target.checked)}
            />
            <Button
              disabled={start.isPending}
              onClick={() => run(() => start.mutateAsync({ test: practice }), 'Game started.')}
            >
              Start the game
            </Button>
          </div>
        </Panel>
      ) : null}
    </>
  );
}

// ---- Totals (commissioner): concentration, as totals only (D-128) ----
function TotalsScreen() {
  const totals = useBingoTotals(true);
  if (totals.isError) return <Alert message="Totals didn't load." />;
  if (!totals.data)
    return (
      <p role="status" className="text-body">
        Loading…
      </p>
    );
  return (
    <Panel title="Totals this game">
      <div className="flex flex-col gap-2 text-body">
        <p className="text-ink-muted">
          Totals only, never names: to notice if a few people carry most of the spending.
          {totals.data.test ? ' This is a practice game.' : ''}
        </p>
        {totals.data.draws.length === 0 ? <p>No game is open.</p> : null}
        {totals.data.draws.map((t) => (
          <p key={t.drawDate}>
            <span className="font-semibold">{drawDay(t.drawDate)}:</span> {totalsText(t)}
          </p>
        ))}
      </div>
    </Panel>
  );
}
