export interface ShareCardProps {
  /** The name other players already see. */
  displayName: string;
  weekNumber: number;
  /** "Saturday, Oct 10, 11:59 PM", in pool time. */
  lockLabel: string;
  /** True once picks are locked. */
  locked: boolean;
}

/**
 * The "picks are in" card (DESIGN_SYSTEM §6), made to be screenshotted or shared (PERSONAS: Kayla).
 * It shows a display name, the week, and that picks are in. Never a pick, a phone, an email, or
 * anything about payment, before or after the lock.
 */
export function ShareCard({ displayName, weekNumber, lockLabel, locked }: ShareCardProps) {
  return (
    <section
      aria-label="Your picks are in"
      className="flex flex-col items-center gap-2 rounded-lg border-3 border-black bg-purple-700 px-4 py-6 text-center text-ink-inverse shadow-sticker"
    >
      <p className="font-heading text-colhead uppercase text-gold-300">
        Tunas Weekly Football Pool · Week {weekNumber}
      </p>
      <p className="break-words font-heading text-h1 italic">{displayName}</p>
      <p className="sticker text-h3">
        <span aria-hidden="true">🔒 </span>Picks locked in
      </p>
      <p className="text-body">
        {locked ? 'Good luck this week!' : `Picks lock ${lockLabel}. Good luck!`}
      </p>
    </section>
  );
}
