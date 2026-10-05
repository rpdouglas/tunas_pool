import { Link, useSearchParams } from 'react-router-dom';
import { usePendingClaimCount } from './claims/claimsData';

const LINKS = [
  { to: '/admin/claims', label: 'Claims', note: 'Players asking to link their history' },
  { to: '/admin/reports', label: 'Reports', note: 'The season week by week, and CSV files' },
  { to: '/admin/audit', label: 'Audit log', note: 'Who changed what, when, and why' },
  { to: '/admin/seasons', label: 'Seasons', note: 'Archive a finished season' },
  { to: '/admin/settings', label: 'Settings', note: 'e-Transfer address and contact email' },
];

/**
 * The rest of the Back Office (D-091). The four screens used every week stay in the bar; these are
 * the ones opened now and then, as big rows that are easy to hit with a thumb.
 */
export default function MorePage() {
  const season = useSearchParams()[0].get('season');
  const suffix = season ? `?season=${encodeURIComponent(season)}` : '';
  const pending = usePendingClaimCount().data ?? 0;
  return (
    <div className="flex max-w-player flex-col gap-4">
      <h1 className="font-heading text-h2">More</h1>
      <ul className="flex flex-col gap-2">
        {LINKS.map((link) => (
          <li key={link.to}>
            <Link
              to={`${link.to}${suffix}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-md border-2 border-line-subtle bg-surface px-4 py-2"
            >
              <span className="flex flex-col">
                <span className="font-heading text-h3">
                  {link.label}
                  {link.label === 'Claims' && pending > 0 && (
                    <span className="badge badge-pending ml-2">
                      {pending}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </span>
                <span className="text-body-sm text-ink-muted">{link.note}</span>
              </span>
              <span aria-hidden="true" className="text-h3 text-ink-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
