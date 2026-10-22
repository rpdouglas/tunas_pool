import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';

interface KioskPinPadProps {
  label?: string;
  sublabel?: string;
  error?: string | null;
  disabled?: boolean;
  onComplete: (pin: string) => void;
  onCancel?: () => void;
}

export function KioskPinPad({
  label = 'Enter your 4-digit PIN',
  sublabel,
  error,
  disabled = false,
  onComplete,
  onCancel,
}: KioskPinPadProps) {
  const [pin, setPin] = useState('');

  // Handle typing from physical keyboard as well as on-screen taps
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled) return;
      if (e.key >= '0' && e.key <= '9') {
        setPin((prev) => {
          if (prev.length < 4) {
            const next = prev + e.key;
            if (next.length === 4) {
              setTimeout(() => onComplete(next), 50);
            }
            return next;
          }
          return prev;
        });
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onComplete, onCancel]);

  function handleDigit(digit: string) {
    if (disabled || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => onComplete(next), 80);
    }
  }

  function handleDelete() {
    if (disabled) return;
    setPin((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    if (disabled) return;
    setPin('');
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="text-center">
        <h3 className="font-heading text-h3 text-ink">{label}</h3>
        {sublabel && <p className="mt-1 text-sm text-ink-muted">{sublabel}</p>}
      </div>

      {/* 4-dot PIN indicator */}
      <div
        className="flex items-center gap-3 py-2"
        role="group"
        aria-label="PIN dots"
      >
        {[0, 1, 2, 3].map((index) => {
          const filled = index < pin.length;
          return (
            <div
              key={index}
              className={`h-5 w-5 rounded-full border-2 transition-all ${
                filled
                  ? 'border-brand-ravens bg-brand-ravens scale-110 shadow-sm'
                  : 'border-ink-muted/40 bg-surface'
              }`}
              aria-hidden="true"
            />
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-center text-sm font-semibold text-ink-urgent">
          {error}
        </p>
      )}

      {/* 3x4 Numeric Keypad */}
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled || pin.length >= 4}
            onClick={() => handleDigit(digit)}
            className="flex h-16 items-center justify-center rounded-xl bg-surface-muted text-2xl font-bold text-ink shadow-sm transition active:scale-95 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold disabled:opacity-50"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled || pin.length === 0}
          onClick={handleClear}
          className="flex h-16 items-center justify-center rounded-xl bg-surface-muted text-base font-semibold text-ink-muted transition active:scale-95 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold disabled:opacity-30"
          aria-label="Clear PIN"
        >
          Clear
        </button>

        <button
          type="button"
          disabled={disabled || pin.length >= 4}
          onClick={() => handleDigit('0')}
          className="flex h-16 items-center justify-center rounded-xl bg-surface-muted text-2xl font-bold text-ink shadow-sm transition active:scale-95 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold disabled:opacity-50"
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled || pin.length === 0}
          onClick={handleDelete}
          className="flex h-16 items-center justify-center rounded-xl bg-surface-muted text-xl font-bold text-ink-muted transition active:scale-95 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold disabled:opacity-30"
          aria-label="Backspace"
        >
          ⌫
        </button>
      </div>

      {onCancel && (
        <div className="mt-2">
          <Button variant="ghost" onClick={onCancel} disabled={disabled}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
