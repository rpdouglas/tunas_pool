/** WEEK 4 / ENTRY FEE $20 tile from the sheet (DESIGN_SYSTEM §6). */
export function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="stat-tile">
      <p className="text-colhead">{label}</p>
      <p className={`stat-value ${accent ? 'is-accent' : ''}`.trim()}>{value}</p>
    </div>
  );
}
