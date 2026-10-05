import { describe, expect, it } from 'vitest';
import { createRateLimit, tidyClientError } from './clientErrors';

describe('tidyClientError', () => {
  it('keeps the message, stack, path, browser, and release, cut to length', () => {
    const tidy = tidyClientError({
      message: `  ${'m'.repeat(600)}`,
      stack: 's'.repeat(5000),
      path: '/week/2026/wk03',
      userAgent: 'u'.repeat(400),
      release: 'abc123',
      extra: 'ignored',
    })!;
    expect(tidy.message).toHaveLength(500);
    expect(tidy.stack).toHaveLength(4000);
    expect(tidy.userAgent).toHaveLength(300);
    expect(tidy).toMatchObject({ path: '/week/2026/wk03', release: 'abc123' });
    expect(Object.keys(tidy).sort()).toEqual(['message', 'path', 'release', 'stack', 'userAgent']);
  });

  it('drops the query string, which can carry a sign-in code', () => {
    expect(
      tidyClientError({ message: 'x', path: '/auth/finish?oobCode=SECRET&next=/#top' })?.path,
    ).toBe('/auth/finish');
  });

  it('refuses a report with no message, or that is not an object', () => {
    expect(tidyClientError({ stack: 'only a stack' })).toBeNull();
    expect(tidyClientError({ message: '   ' })).toBeNull();
    expect(tidyClientError(null)).toBeNull();
    expect(tidyClientError({ message: 42 })).toBeNull();
  });
});

describe('createRateLimit', () => {
  it('lets a few through each minute and then stops, until the next minute', () => {
    const allow = createRateLimit(3);
    expect([allow(1000), allow(1001), allow(1002), allow(1003)]).toEqual([true, true, true, false]);
    expect(allow(59_999)).toBe(false);
    expect(allow(61_000)).toBe(true);
  });
});
