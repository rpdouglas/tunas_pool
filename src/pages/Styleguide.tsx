import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { CopyField } from '../components/ui/CopyField';
import { Countdown } from '../components/ui/Countdown';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SegmentedChoice } from '../components/ui/SegmentedChoice';
import { StatTile } from '../components/ui/StatTile';
import { PawnShopHelmet, TunaBadge, WordmarkArt } from '../components/ui/BrandArt';
import { WordmarkLockup } from '../components/ui/WordmarkLockup';
import { WinnerBanner } from '../components/ui/WinnerBanner';
import { useToast } from '../components/ui/toastContext';
import { PaymentRow } from '../features/admin/payments/PaymentRow';
import { ClaimCard } from '../features/admin/claims/ClaimCard';
import { RosterRow } from '../features/admin/roster/RosterRow';
import type { RosterRow as RosterRowData } from '../features/admin/roster/roster';
import { PhotoField } from '../components/ui/PhotoField';
import { PickRow } from '../components/ui/PickRow';
import { LeaderboardRow } from '../components/ui/LeaderboardRow';
import { ShareBar } from '../components/ui/ShareBar';
import { ShareCard } from '../components/ui/ShareCard';
import { TextSizeControl } from '../components/ui/TextSizeControl';
import type { ClaimRow, EntryRow } from '@shared/adminTypes';
import type { WeekWinner } from '@shared/types';
import { Field } from '../components/ui/Field';
import { GameCard } from '../components/ui/GameCard';
import { Panel } from '../components/ui/Panel';
import { SectionBar } from '../components/ui/SectionBar';
import { StatusBadge, type BadgeStatus } from '../components/ui/StatusBadge';
import { TextAreaField } from '../components/ui/TextAreaField';

const SAMPLE_ROW: EntryRow = {
  playerId: 'p1',
  displayName: 'Dale D.',
  phone: '+16135550123',
  email: null,
  source: 'web',
  enteredBy: 'self',
  hasPaperPhoto: false,
  picksSubmittedAtMs: null,
  lateOverride: false,
  paymentMethod: 'etransfer',
  paymentIntent: 'will_do',
  paymentStatus: 'unpaid',
  paidAtMs: null,
  record: null,
  duplicates: [],
};

const SAMPLE_ROSTER: RosterRowData = {
  playerId: 'r1',
  displayName: 'Rosalie M.',
  phone: '+16135550144',
  usualPayment: 'cash',
  notes: 'Large-print sheet. Her daughter drops it off.',
  active: true,
  origin: 'admin',
  claimed: false,
  entry: null,
};

const SAMPLE_CLAIM: ClaimRow = {
  claimId: 'c1',
  claimedName: 'Rosalie M.',
  claimedPhone: '+16135550144',
  requesterEmail: 'granddaughter@example.com',
  createdAtMs: Date.UTC(2026, 9, 8, 15, 30),
  requesterProfile: null,
  candidates: [
    {
      playerId: 'r1',
      displayName: 'Rosalie M.',
      phone: '+16135550144',
      reasons: ['phone', 'name'],
      linked: false,
      active: true,
      weeksPlayed: 3,
    },
    {
      playerId: 'r2',
      displayName: 'Rose Martin',
      phone: null,
      reasons: ['similar_name'],
      linked: true,
      active: true,
      weeksPlayed: 1,
    },
  ],
  suggestedPlayerId: 'r1',
  sharedSuggestion: false,
};

const SAMPLE_WINNER: WeekWinner = {
  playerIds: ['a'],
  displayNames: ['Dale D.'],
  record: { wins: 12, losses: 3 },
  mnfPrediction: 58,
  decision: 'tiebreaker',
  tiedPlayerIds: ['a', 'b'],
  potCents: 20_000,
  shareCents: 20_000,
  leftoverCents: 0,
  publishedAt: { seconds: 0, nanoseconds: 0, toDate: () => new Date(0) },
};

const STATUSES: BadgeStatus[] = ['paid', 'unpaid', 'pending', 'draft', 'open', 'locked', 'final'];

const SWATCHES: Array<{ name: string; className: string; hex: string }> = [
  { name: 'Ravens purple', className: 'bg-purple-700', hex: '#241773' },
  { name: 'Black', className: 'bg-black', hex: '#000000' },
  { name: 'Metallic gold', className: 'bg-gold-600', hex: '#9E7C0C' },
  { name: 'UI gold', className: 'bg-gold-400', hex: '#D9AF26' },
  { name: 'Ravens red', className: 'bg-red-700', hex: '#C60C30' },
];

/** Dev-only component gallery. Every new UI component gets an entry here (CLAUDE.md §5). */
export default function Styleguide() {
  const [pick, setPick] = useState<'away' | 'home' | null>('home');
  const [cardPick, setCardPick] = useState<'away' | 'home' | null>(null);
  const [method, setMethod] = useState<'cash' | 'etransfer' | null>('etransfer');
  const [adult, setAdult] = useState(false);
  const [sheet, setSheet] = useState<Record<string, 'away' | 'home' | null>>({ g1: 'home' });
  const [photo, setPhoto] = useState<File | null>(null);
  const NOW = Date.UTC(2026, 9, 10, 12, 0);
  const { showToast } = useToast();

  return (
    <div className="min-h-screen bg-page-backoffice">
      <header className="bg-gameday px-4 pb-14 pt-10 text-center">
        <p className="wordmark text-wordmark" aria-hidden="true">
          Tunas
        </p>
        <p className="ribbon my-3 text-xl" aria-hidden="true">
          Weekly Football Pool
        </p>
        <h1 className="font-heading text-h2 italic text-ink-inverse">Styleguide</h1>
      </header>

      <main className="mx-auto flex max-w-player flex-col gap-8 px-4 py-8">
        <section aria-labelledby="sg-colors">
          <h2 id="sg-colors" className="mb-3 font-heading text-h2 italic">
            Brand colors
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {SWATCHES.map((s) => (
              <li
                key={s.name}
                className="overflow-hidden rounded-md border-2 border-line-subtle bg-surface"
              >
                <div className={`h-14 ${s.className}`} />
                <p className="px-2 pt-1 font-heading text-h3">{s.name}</p>
                <p className="px-2 pb-2 text-body-sm text-ink-muted">{s.hex}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="sg-buttons">
          <h2 id="sg-buttons" className="mb-3 font-heading text-h2 italic">
            Buttons
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button>Submit picks</Button>
            <Button variant="secondary">Edit picks</Button>
            <Button variant="ghost">Copy email</Button>
            <Button disabled>2 games left</Button>
          </div>
        </section>

        <section aria-labelledby="sg-panels">
          <h2 id="sg-panels" className="mb-3 font-heading text-h2 italic">
            Panel and section bar
          </h2>
          <div className="panel">
            <SectionBar>Sunday games</SectionBar>
            <p className="p-4 text-body">Colts at Commanders (London)</p>
          </div>
          <div className="mt-4">
            <Panel title="How to play">
              <p className="text-body">
                Pick one team to win every game.{' '}
                <span className="emphasis">No picks can be changed after lock.</span>
              </p>
            </Panel>
          </div>
        </section>

        <section aria-labelledby="sg-pick">
          <h2 id="sg-pick" className="mb-3 font-heading text-h2 italic">
            Pick buttons
          </h2>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <button
              type="button"
              className="pick"
              aria-pressed={pick === 'away'}
              onClick={() => setPick(pick === 'away' ? null : 'away')}
            >
              Colts
            </button>
            <span className="font-heading text-ink-muted">at</span>
            <button
              type="button"
              className="pick"
              aria-pressed={pick === 'home'}
              onClick={() => setPick(pick === 'home' ? null : 'home')}
            >
              Commanders
            </button>
          </div>
        </section>

        <section aria-labelledby="sg-gamecard">
          <h2 id="sg-gamecard" className="mb-3 font-heading text-h2 italic">
            Game card
          </h2>
          <ol className="flex flex-col gap-3 rounded-lg bg-purple-700 p-3">
            <GameCard
              away="Jaguars"
              home="Rams"
              kickoffLabel="Sun 9:30 AM"
              venueNote="London"
              pick={cardPick}
              onPick={setCardPick}
            />
            <GameCard away="Chiefs" home="Chargers" kickoffLabel="Mon 8:15 PM" pick="away" />
            <GameCard
              away="Colts"
              home="Commanders"
              kickoffLabel="Sun 1:00 PM (read-only preview)"
            />
          </ol>
        </section>

        <section aria-labelledby="sg-lockup">
          <h2 id="sg-lockup" className="mb-3 font-heading text-h2 italic">
            Wordmark lockup
          </h2>
          <div className="bg-gameday flex flex-col items-center gap-6 rounded-lg p-6">
            <WordmarkLockup />
            <WordmarkLockup size="compact" />
          </div>
        </section>

        <section aria-labelledby="sg-art">
          <h2 id="sg-art" className="mb-3 font-heading text-h2 italic">
            Brand art
          </h2>
          <div className="bg-gameday flex flex-col items-center gap-6 rounded-lg p-6">
            <WordmarkArt />
            <TunaBadge />
            <TunaBadge className="w-20" alt="Tuna, the pool mascot" />
            <PawnShopHelmet />
          </div>
        </section>

        <section aria-labelledby="sg-progress">
          <h2 id="sg-progress" className="mb-3 font-heading text-h2 italic">
            Progress bar
          </h2>
          <div className="flex flex-col gap-2 overflow-hidden rounded-lg">
            <ProgressBar done={9} total={15} onNext={() => undefined} />
            <ProgressBar done={15} total={15} />
          </div>
        </section>

        <section aria-labelledby="sg-segmented">
          <h2 id="sg-segmented" className="mb-3 font-heading text-h2 italic">
            Segmented choice
          </h2>
          <div className="flex flex-col gap-4">
            <SegmentedChoice
              legend="How will you pay?"
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'etransfer', label: 'e-Transfer' },
              ]}
              value={method}
              onChange={setMethod}
            />
            <SegmentedChoice
              legend="Locked"
              options={[
                { value: 'will_do', label: 'Will do' },
                { value: 'already_did', label: 'Already did' },
              ]}
              value="already_did"
              onChange={() => undefined}
              disabled
            />
          </div>
        </section>

        <section aria-labelledby="sg-copy">
          <h2 id="sg-copy" className="mb-3 font-heading text-h2 italic">
            Copy field and checkbox
          </h2>
          <div className="flex flex-col gap-4">
            <CopyField label="e-Transfer email" value="tunasweeklypool2026@yahoo.com" />
            <Checkbox
              label="I'm 18 or older"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
            />
            <Checkbox
              label="I'm 18 or older (error)"
              checked={false}
              onChange={() => undefined}
              error="Confirm you're 18 or older to enter."
            />
          </div>
        </section>

        <section aria-labelledby="sg-stats">
          <h2 id="sg-stats" className="mb-3 font-heading text-h2 italic">
            Stat tiles and countdown
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Week" value="6" />
            <StatTile label="Entry fee" value="$20" accent />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatTile compact label="Pot" value="$180" accent />
            <StatTile compact label="Paid" value="9/14" />
            <StatTile compact label="Unpaid" value="5" />
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-lg bg-surface p-4">
            <Countdown lockAtMs={NOW + (26 * 60 + 12) * 60_000} nowMs={NOW} />
            <Countdown lockAtMs={NOW + 40 * 60_000} nowMs={NOW} />
            <Countdown lockAtMs={NOW - 1} nowMs={NOW} />
          </div>
        </section>

        <section aria-labelledby="sg-payments">
          <h2 id="sg-payments" className="mb-3 font-heading text-h2 italic">
            Payments queue row (Back Office)
          </h2>
          <ul className="flex flex-col gap-2">
            <PaymentRow
              row={SAMPLE_ROW}
              busy={false}
              onPay={() => undefined}
              onUndo={() => undefined}
            />
            <PaymentRow
              row={{
                ...SAMPLE_ROW,
                displayName: 'Jen K.',
                paymentMethod: null,
                paymentIntent: null,
                phone: null,
              }}
              busy={false}
              onPay={() => undefined}
              onUndo={() => undefined}
            />
            <PaymentRow
              row={{
                ...SAMPLE_ROW,
                displayName: 'Troy T.',
                paymentStatus: 'paid',
                paymentIntent: 'already_did',
              }}
              busy={false}
              onPay={() => undefined}
              onUndo={() => undefined}
            />
            <PaymentRow
              row={{
                ...SAMPLE_ROW,
                displayName: 'Alex R.',
                lateOverride: true,
                duplicates: [
                  {
                    otherPlayerId: 'x',
                    otherName: 'Alexander R.',
                    reasons: ['phone', 'similar_name'],
                  },
                ],
              }}
              busy={true}
              onPay={() => undefined}
              onUndo={() => undefined}
            />
          </ul>
        </section>

        <section aria-labelledby="sg-paper">
          <h2 id="sg-paper" className="mb-3 font-heading text-h2 italic">
            Paper entry (Back Office)
          </h2>
          <ol className="flex max-w-player flex-col gap-2">
            {[
              { id: 'g1', away: 'Colts', home: 'Commanders' },
              { id: 'g2', away: 'Bills', home: 'Dolphins' },
              { id: 'g3', away: 'Buccaneers', home: 'Cardinals' },
            ].map((g, i) => (
              <PickRow
                key={g.id}
                number={i + 1}
                away={g.away}
                home={g.home}
                pick={sheet[g.id] ?? null}
                onPick={(p) => setSheet((prev) => ({ ...prev, [g.id]: p }))}
              />
            ))}
          </ol>
          <div className="mt-4 flex max-w-player flex-col gap-4 rounded-lg bg-surface p-4">
            <PhotoField
              label="Photo of the sheet (optional)"
              hint="Kept with the entry. Only the admin can see it."
              file={photo}
              hasSaved={false}
              onChoose={setPhoto}
              onRemove={() => setPhoto(null)}
            />
            <PhotoField
              label="A photo already saved"
              file={null}
              hasSaved
              viewHref="#sg-paper"
              onChoose={() => undefined}
              onRemove={() => undefined}
            />
            <PhotoField
              label="When the upload fails"
              file={null}
              hasSaved={false}
              onChoose={() => undefined}
              onRemove={() => undefined}
              error="The photo didn't upload. Try again."
            />
          </div>
        </section>

        <section aria-labelledby="sg-roster">
          <h2 id="sg-roster" className="mb-3 font-heading text-h2 italic">
            Roster row (Back Office)
          </h2>
          <ul className="flex max-w-player flex-col gap-2">
            <RosterRow
              row={SAMPLE_ROSTER}
              enterHref="#sg-roster"
              late={false}
              showStatus
              onEdit={() => undefined}
            />
            <RosterRow
              row={{
                ...SAMPLE_ROSTER,
                playerId: 'r2',
                displayName: 'Bernie T.',
                notes: null,
                entry: {
                  ...SAMPLE_ROW,
                  playerId: 'r2',
                  source: 'text',
                  enteredBy: 'admin',
                  paymentStatus: 'paid',
                  lateOverride: true,
                },
              }}
              enterHref="#sg-roster"
              late
              showStatus
              onEdit={() => undefined}
            />
            <RosterRow
              row={{
                ...SAMPLE_ROSTER,
                playerId: 'r3',
                displayName: 'Hank O.',
                phone: null,
                notes: null,
              }}
              enterHref="#sg-roster"
              late
              showStatus
              onEdit={() => undefined}
            />
            <RosterRow
              row={{ ...SAMPLE_ROSTER, playerId: 'r5', displayName: 'Gord M.', claimed: true }}
              enterHref="#sg-roster"
              late={false}
              showStatus
              onEdit={() => undefined}
            />
            <RosterRow
              row={{ ...SAMPLE_ROSTER, playerId: 'r4', displayName: 'Old Timer', active: false }}
              enterHref={null}
              late={false}
              showStatus={false}
              onEdit={() => undefined}
            />
          </ul>
        </section>

        <section aria-labelledby="sg-claims">
          <h2 id="sg-claims" className="mb-3 font-heading text-h2 italic">
            Claim request (Back Office)
          </h2>
          <ul className="flex max-w-player flex-col gap-3">
            <ClaimCard
              claim={SAMPLE_CLAIM}
              others={[{ playerId: 'r9', displayName: 'Hank O.' }]}
              busy={false}
              onApprove={() => undefined}
              onReject={() => undefined}
            />
            <ClaimCard
              claim={{
                ...SAMPLE_CLAIM,
                claimId: 'c2',
                claimedName: 'Bern',
                claimedPhone: null,
                requesterEmail: 'bernie@example.com',
                requesterProfile: { playerId: 'u1', displayName: 'Bern', weeksPlayed: 2 },
                candidates: [],
                suggestedPlayerId: null,
                sharedSuggestion: true,
              }}
              others={[{ playerId: 'r9', displayName: 'Bernie T.' }]}
              busy={false}
              onApprove={() => undefined}
              onReject={() => undefined}
            />
          </ul>
        </section>

        <section aria-labelledby="sg-leaderboard">
          <h2 id="sg-leaderboard" className="mb-3 font-heading text-h2 italic">
            Leaderboard row and pick share
          </h2>
          <ol className="flex max-w-player flex-col gap-2">
            <LeaderboardRow rankLabel="1" name="Dale D." wins={12} losses={3} winner>
              <p className="text-body">That player's picks open here.</p>
            </LeaderboardRow>
            <LeaderboardRow
              rankLabel="Tied 2"
              name="Jen K."
              wins={9}
              losses={2}
              bestPossible={13}
              you
            >
              <p className="text-body">That player's picks open here.</p>
            </LeaderboardRow>
            <LeaderboardRow
              rankLabel="Tied 2"
              name="Hank O."
              wins={9}
              losses={2}
              bestPossible={13}
              late
            />
          </ol>
          <div className="mt-4 flex max-w-player flex-col gap-4 rounded-lg bg-surface p-4">
            <ShareBar
              awayTeam="Packers"
              homeTeam="Bears"
              awayCount={28}
              homeCount={12}
              awayPercent={70}
              homePercent={30}
              winner="home"
            />
            <ShareBar
              awayTeam="Buccaneers"
              homeTeam="Commanders"
              awayCount={20}
              homeCount={19}
              awayPercent={50}
              homePercent={48}
            />
          </div>
        </section>

        <section aria-labelledby="sg-share">
          <h2 id="sg-share" className="mb-3 font-heading text-h2 italic">
            Share card
          </h2>
          <div className="flex max-w-player flex-col gap-3">
            <ShareCard
              displayName="Kayla"
              weekNumber={5}
              lockLabel="Saturday, Oct 10, 11:59 PM"
              locked={false}
            />
            <ShareCard
              displayName="Dale D."
              weekNumber={5}
              lockLabel="Saturday, Oct 10, 11:59 PM"
              locked
            />
          </div>
        </section>

        <section aria-labelledby="sg-textsize">
          <h2 id="sg-textsize" className="mb-3 font-heading text-h2 italic">
            Text size
          </h2>
          <div className="flex max-w-player flex-col gap-4">
            <div className="rounded-lg bg-surface p-4">
              <TextSizeControl />
            </div>
            <div className="rounded-lg bg-purple-800 p-4">
              <TextSizeControl onDark />
            </div>
          </div>
        </section>

        <section aria-labelledby="sg-winner">
          <h2 id="sg-winner" className="mb-3 font-heading text-h2 italic">
            Winner banner and toasts
          </h2>
          <div className="flex flex-col gap-4">
            <WinnerBanner weekNumber={6} winner={SAMPLE_WINNER} />
            <WinnerBanner
              weekNumber={7}
              winner={{
                ...SAMPLE_WINNER,
                playerIds: ['a', 'b'],
                displayNames: ['Dale D.', 'Jen K.'],
                decision: 'split_pot',
                mnfPrediction: 50,
                potCents: 20_000,
                shareCents: 10_000,
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  showToast({
                    message: 'Dale D. marked paid',
                    actionLabel: 'Undo',
                    onAction: () => undefined,
                  })
                }
              >
                Show success toast
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  showToast({ message: "Couldn't reach the pool. Try again.", tone: 'error' })
                }
              >
                Show error toast
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="sg-badges">
          <h2 id="sg-badges" className="mb-3 font-heading text-h2 italic">
            Status badges
          </h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </section>

        <section aria-labelledby="sg-fields">
          <h2 id="sg-fields" className="mb-3 font-heading text-h2 italic">
            Fields
          </h2>
          <div className="flex flex-col gap-4">
            <Field label="Name" defaultValue="Alex R." autoComplete="name" />
            <Field
              label="Phone"
              inputMode="tel"
              defaultValue="613 555"
              error="Phone number is too short. Enter all 10 digits."
            />
            <TextAreaField
              label="Matchups"
              hint="One game per line, like “Colts at Commanders”."
              defaultValue={'Sun 9:30 AM Jaguars at Rams (London)\nColts at Commanders'}
              rows={4}
            />
            <TextAreaField
              label="Notes"
              defaultValue="Comanders at Bears"
              error="Line 1: Did you mean Commanders?"
              rows={2}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
