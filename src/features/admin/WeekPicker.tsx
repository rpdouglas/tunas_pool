import type { WeekView } from '../../lib/weekModel';

const STATUS_WORD: Record<string, string> = { open: 'Open', locked: 'Locked', final: 'Final' };

/** A plain select, so it works one-handed on any phone. */
export function WeekPicker({
  weeks,
  value,
  onChange,
}: {
  weeks: WeekView[];
  value: string;
  onChange: (weekId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="week-picker" className="field-label">
        Week
      </label>
      <select
        id="week-picker"
        className="field w-auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {[...weeks]
          .sort((a, b) => b.weekNumber - a.weekNumber)
          .map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.weekNumber} · {STATUS_WORD[w.status] ?? w.status}
            </option>
          ))}
      </select>
    </div>
  );
}
