import { useId, useState, type ReactNode } from 'react';

/**
 * One row of the earlier boards (D-139): a week's name that opens its board below. The board
 * mounts only while open, so a closed week loads nothing.
 */
export function BoardDisclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <li className="flex flex-col rounded-md bg-surface-muted">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-touch items-center gap-2 px-3 py-2 text-left font-semibold text-ink-emphasis"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {label}
      </button>
      {open && (
        <div id={panelId} className="px-3 pb-3">
          {children}
        </div>
      )}
    </li>
  );
}
