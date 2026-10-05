import { useId } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedChoiceProps<T extends string> {
  legend: string;
  options: SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * Two (or more) big options, like Cash | e-Transfer (DESIGN_SYSTEM §6). Real radio buttons, styled
 * like pick buttons, so keyboards and screen readers get a normal radio group.
 */
export function SegmentedChoice<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
}: SegmentedChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="field-label mb-2">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="pick text-h3"
            data-state={disabled ? 'locked' : undefined}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
