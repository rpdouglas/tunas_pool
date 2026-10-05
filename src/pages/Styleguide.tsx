import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { CopyField } from '../components/ui/CopyField';
import { Countdown } from '../components/ui/Countdown';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SegmentedChoice } from '../components/ui/SegmentedChoice';
import { StatTile } from '../components/ui/StatTile';
import { WordmarkLockup } from '../components/ui/WordmarkLockup';
import { Field } from '../components/ui/Field';
import { GameCard } from '../components/ui/GameCard';
import { Panel } from '../components/ui/Panel';
import { SectionBar } from '../components/ui/SectionBar';
import { StatusBadge, type BadgeStatus } from '../components/ui/StatusBadge';
import { TextAreaField } from '../components/ui/TextAreaField';

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
  const NOW = Date.UTC(2026, 9, 10, 12, 0);

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
          <div className="mt-4 flex flex-col gap-3 rounded-lg bg-surface p-4">
            <Countdown lockAtMs={NOW + (26 * 60 + 12) * 60_000} nowMs={NOW} />
            <Countdown lockAtMs={NOW + 40 * 60_000} nowMs={NOW} />
            <Countdown lockAtMs={NOW - 1} nowMs={NOW} />
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
