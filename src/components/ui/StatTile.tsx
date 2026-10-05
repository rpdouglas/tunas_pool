/** WEEK 4 / ENTRY FEE $20 tile from the sheet (DESIGN_SYSTEM §6). */
export function StatTile({
  label,
  value,
  accent = false,
  compact = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  /** Smaller numerals, for three across on a phone (Back Office). */
  compact?: boolean;
}) {
  return (
    <div className={`stat-tile ${compact ? 'is-compact' : ''}`.trim()}>
      <p className="text-colhead">{label}</p>
      <p className={`stat-value ${accent ? 'is-accent' : ''}`.trim()}>{value}</p>
    </div>
  );
}
