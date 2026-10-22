export interface AppStatusBarProps {
  /** The phone has no connection. */
  offline: boolean;
  /** A new version of the site is waiting (D-141). */
  updateReady: boolean;
  onRefresh: () => void;
  /** Hide the update notice for now; the new version still applies the next time the app opens. */
  onLater: () => void;
}

/**
 * A strip at the very top of every screen for the installed app (D-141): when the phone is
 * offline, and when a new version is ready. It sits in the page, not over it, so it never covers a
 * Submit button or a toast. Words and an icon, never color alone.
 */
export function AppStatusBar({ offline, updateReady, onRefresh, onLater }: AppStatusBarProps) {
  if (!offline && !updateReady) return null;
  return (
    <div className="bg-surface text-ink shadow-raised">
      <div className="mx-auto flex max-w-player flex-col gap-2 px-4 py-2">
        {offline && (
          <p role="status" className="py-1 text-body">
            <span aria-hidden="true">⚠ </span>
            <strong>You're offline.</strong> Your picks are saved on this phone; send them when
            you're back online.
          </p>
        )}
        {updateReady && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2">
            <p className="py-1 text-body font-semibold">
              <span aria-hidden="true">↻ </span>A new version of the pool is ready.
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="min-h-touch min-w-touch px-3 text-body underline"
                onClick={onLater}
              >
                Later
              </button>
              <button type="button" className="btn btn-primary" onClick={onRefresh}>
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
