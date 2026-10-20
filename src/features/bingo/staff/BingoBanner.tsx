import { Link } from 'react-router-dom';
import { bannerText } from '@shared/bingoStaffView';
import { useDrawWaiting } from './staffData';

/**
 * The Back Office's notice that a bingo draw is waiting for approval (R-22): the v1 notification,
 * since there are no pushes or emails. Loaded lazily by the layouts, so the pool's first download
 * doesn't grow. Shows nothing if bingo isn't set up.
 */
export default function BingoBanner({ base }: { base: string }) {
  const waiting = useDrawWaiting(true);
  const text = bannerText(waiting.data ?? null);
  if (!text) return null;
  return (
    <div className="bg-gold-400 text-ink">
      <div className="mx-auto max-w-backoffice px-4 py-2">
        <Link to={`${base}/draw`} className="flex min-h-touch items-center font-semibold underline">
          {text}
        </Link>
      </div>
    </div>
  );
}
