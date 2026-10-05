/**
 * Script errors reported by the web app (PROJECT_PLAN Sprint 9), written to the functions' log so a
 * broken screen shows up in Cloud Logging and Error Reporting instead of going unseen. Pure
 * tidying and limiting here; the callable in index.ts writes the log line.
 *
 * Nothing private is asked for and nothing is trusted: text is cut to length, and the path is kept
 * without its query string, which can carry an email-link code.
 */
export interface ClientError {
  message: string;
  stack: string;
  path: string;
  userAgent: string;
  release: string;
}

const cut = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

export function tidyClientError(data: unknown): ClientError | null {
  const input = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const message = cut(typeof input.message === 'string' ? input.message.trim() : '', 500);
  if (!message) return null;
  return {
    message,
    stack: cut(input.stack, 4000),
    path: cut(input.path, 200).split('?')[0].split('#')[0],
    userAgent: cut(input.userAgent, 300),
    release: cut(input.release, 40),
  };
}

/** At most `limit` reports a minute per function instance: a broken page can't flood the log. */
export function createRateLimit(limit: number, windowMs = 60_000) {
  let windowStart = 0;
  let count = 0;
  return (nowMs: number): boolean => {
    if (nowMs - windowStart >= windowMs) {
      windowStart = nowMs;
      count = 0;
    }
    count += 1;
    return count <= limit;
  };
}
