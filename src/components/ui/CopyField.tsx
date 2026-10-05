import { useState } from 'react';

/** Read-only value with a Copy button that confirms "Copied" (DESIGN_SYSTEM §6). */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older in-app browsers: fall back to a selection the player can copy by hand.
      const input = document.getElementById(`copy-${label}`) as HTMLInputElement | null;
      input?.select();
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`copy-${label}`} className="field-label">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={`copy-${label}`}
          className="field flex-1"
          value={value}
          readOnly
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="btn btn-secondary min-w-24" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? `${label} copied` : ''}
      </p>
    </div>
  );
}
