const CONFIG = {
  paid: { label: 'Paid', className: 'badge-paid', icon: '✓' },
  unpaid: { label: 'Unpaid', className: 'badge-unpaid', icon: '' },
  pending: { label: 'Pending approval', className: 'badge-pending', icon: '' },
  open: { label: 'Open', className: 'badge-open', icon: '' },
  locked: { label: 'Locked', className: 'badge-locked', icon: '🔒' },
  final: { label: 'Final', className: 'badge-final', icon: '' },
  draft: { label: 'Draft', className: 'badge-draft', icon: '' },
} as const;

export type BadgeStatus = keyof typeof CONFIG;

/** Always a word (and often an icon), never color alone. */
export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { label, className, icon } = CONFIG[status];
  return (
    <span className={`badge ${className}`}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}
