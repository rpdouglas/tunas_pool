import { useState } from 'react';
import { NEUTRAL_BAR, TEAM_INFO, badgeInk } from '@shared/teamColors';
import { resolveTeam } from '@shared/teams';

/**
 * A team's logo (D-103), or its badge when the logo isn't there: a circle in the team's colour
 * with its short code. Logos are fetched at deploy into /teams, so a local build, a test, or a logo
 * ESPN moved shows the badge instead. Decorative: the team's name is always written next to it.
 */
export function TeamMark({ team, size = 56 }: { team: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const name = resolveTeam(team);
  const info = name ? TEAM_INFO[name] : null;
  const box = { width: size, height: size };

  if (info && !failed) {
    return (
      <img
        src={`/teams/${info.abbr}.png`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="flex-none object-contain"
        style={box}
        onError={() => setFailed(true)}
      />
    );
  }
  // Team colours are data, not design tokens (D-103), so they are set inline.
  const background = info?.primary ?? NEUTRAL_BAR;
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-pill font-heading text-body font-bold uppercase"
      style={{ ...box, background, color: badgeInk(background) }}
    >
      {info?.abbr ?? '?'}
    </span>
  );
}
