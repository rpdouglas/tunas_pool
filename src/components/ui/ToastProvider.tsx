import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastOptions } from './toastContext';

interface ToastItem extends ToastOptions {
  id: number;
}

/**
 * Bottom toast (DESIGN_SYSTEM §6): same verb as the button, with an optional Undo. Successes stay 8
 * seconds so a one-handed admin can reach Undo. Errors stay until dismissed. Newest on top.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((all) => [{ id, ...options }, ...all].slice(0, 3));
      if (options.tone !== 'error') window.setTimeout(() => dismiss(id), 8000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex flex-col items-center gap-2 px-4 pb-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-player items-center justify-between gap-3 rounded-md px-4 py-2 shadow-raised ${
              t.tone === 'error' ? 'bg-red-800 text-ink-inverse' : 'bg-purple-800 text-ink-inverse'
            }`}
          >
            <p className="py-1 text-body font-semibold">
              <span aria-hidden="true">{t.tone === 'error' ? '⚠ ' : '✓ '}</span>
              {t.message}
            </p>
            <div className="flex flex-none items-center">
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  className="min-h-touch min-w-touch px-3 font-heading text-h3 text-gold-300 underline"
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                className="min-h-touch min-w-touch px-3 text-body"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
