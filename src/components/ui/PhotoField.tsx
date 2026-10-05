import { useId, type ChangeEvent } from 'react';

export interface PhotoFieldProps {
  label: string;
  hint?: string;
  /** A newly chosen photo that has not been uploaded yet. */
  file: File | null;
  /** True when a photo is already stored with the entry. */
  hasSaved: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
  /** A link that opens the stored photo. Omit when there is none, or it can't be shown. */
  viewHref?: string;
  error?: string;
}

/**
 * Attach a photo of a paper sheet: the phone's camera or a file (DESIGN_SYSTEM §6). The native file
 * input stays in the page, visually hidden, so the label is a real 48px control for keyboards and
 * screen readers.
 */
export function PhotoField({
  label,
  hint,
  file,
  hasSaved,
  onChoose,
  onRemove,
  viewHref,
  error,
}: PhotoFieldProps) {
  const inputId = useId();
  const attached = Boolean(file) || hasSaved;

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (chosen) onChoose(chosen);
    event.target.value = ''; // so choosing the same file again still fires
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="field-label">{label}</p>
      {hint ? <p className="text-body-sm text-ink-muted">{hint}</p> : null}
      {attached && (
        <p className="text-body">
          <span aria-hidden="true">✓ </span>
          {file ? `Photo ready to save: ${file.name}` : 'A photo is saved with this entry.'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputId}
          className="btn btn-ghost cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2"
        >
          {attached ? 'Retake photo' : 'Add a photo'}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={onChange}
          />
        </label>
        {hasSaved && !file && viewHref && (
          <a className="btn btn-ghost" href={viewHref} target="_blank" rel="noreferrer">
            View photo
          </a>
        )}
        {attached && (
          <button type="button" className="btn btn-ghost" onClick={onRemove}>
            Remove photo
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-body-sm font-semibold text-ink-urgent">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
