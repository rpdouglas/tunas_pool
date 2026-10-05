import { useId, type InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

/** A large checkbox with the whole row as its 48px target. */
export function Checkbox({ label, error, id, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="flex min-h-touch cursor-pointer items-center gap-3 text-body font-semibold"
      >
        <input
          id={inputId}
          type="checkbox"
          className="h-6 w-6 flex-none accent-purple-700"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...rest}
        />
        {label}
      </label>
      {error ? (
        <p id={errorId} role="alert" className="text-body-sm font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
