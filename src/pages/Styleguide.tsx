import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { Panel } from '../components/ui/Panel';
import { SectionBar } from '../components/ui/SectionBar';
import { StatusBadge, type BadgeStatus } from '../components/ui/StatusBadge';

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
              <li key={s.name} className="overflow-hidden rounded-md border-2 border-line-subtle bg-surface">
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
                Pick one team to win every game. <span className="emphasis">No picks can be changed after lock.</span>
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
          </div>
        </section>
      </main>
    </div>
  );
}
