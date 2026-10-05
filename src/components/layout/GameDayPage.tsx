import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Player screen shell: Game Day backdrop, compact wordmark, one column at max-w-player. */
export function GameDayPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="bg-gameday min-h-screen px-4 pb-16 pt-6">
      <div className="mx-auto flex max-w-player flex-col gap-6">
        <Link
          to="/"
          className="self-center text-center"
          aria-label="Tunas Weekly Football Pool home"
        >
          <span className="wordmark block text-h1" aria-hidden="true">
            Tunas
          </span>
          <span className="ribbon mt-2 text-body" aria-hidden="true">
            Weekly Football Pool
          </span>
        </Link>
        <h1 className="text-center font-heading text-h2 italic text-ink-inverse">{title}</h1>
        {children}
      </div>
    </main>
  );
}
