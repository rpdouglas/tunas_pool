/**
 * Sends uncaught script errors to the `reportClientError` callable (PROJECT_PLAN Sprint 9), so a
 * broken screen is seen in the project's logs. A handful per visit at most, each one once, and never
 * in a way that can itself break the page. Expected failures (no signal, a refused read) are handled
 * where they happen and are not reported.
 */
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

const MAX_PER_VISIT = 5;
const sent = new Set<string>();

export function reportError(error: unknown): void {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? '') : '';
    const key = `${message}\n${stack.split('\n')[1] ?? ''}`;
    // Not signed in yet means the callable would refuse it; an import of a new version that is gone
    // from the server is a stale tab, not a bug.
    if (!auth.currentUser || sent.has(key) || sent.size >= MAX_PER_VISIT) return;
    if (
      /Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)
    )
      return;
    sent.add(key);
    void httpsCallable(
      functions,
      'reportClientError',
    )({
      message,
      stack,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
      release: import.meta.env.VITE_RELEASE ?? '',
    }).catch(() => undefined);
  } catch {
    // Reporting must never be the thing that breaks.
  }
}

/** Catch what nothing else caught. Called once, at startup. */
export function watchForErrors(): void {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
}
