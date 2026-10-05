import { useEffect, useState } from 'react';
import { countdownText, formatPoolDateTime } from '@shared/time';

const HOUR = 60 * 60 * 1000;

/**
 * "1d 04h 12m to lock", in red under an hour (DESIGN_SYSTEM §6). The lock time itself is the
 * server's; this only counts down to it. The rules decide what is accepted (CLAUDE.md §4.4).
 */
export function Countdown({ lockAtMs, nowMs }: { lockAtMs: number; nowMs?: number }) {
  const [now, setNow] = useState(() => nowMs ?? Date.now());
  useEffect(() => {
    if (nowMs !== undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [nowMs]);

  const text = countdownText(lockAtMs, now);
  const lockLabel = formatPoolDateTime(new Date(lockAtMs));
  if (!text) {
    return (
      <p className="font-heading text-h3">
        <span aria-hidden="true">🔒 </span>Picks are locked
      </p>
    );
  }
  const urgent = lockAtMs - now < HOUR;
  return (
    <p className={`font-heading text-h3 ${urgent ? 'text-ink-urgent' : ''}`.trim()}>
      {urgent && <span aria-hidden="true">⏰ </span>}
      {text} to lock
      <span className="block font-body text-body font-normal">Picks lock {lockLabel}</span>
    </p>
  );
}
