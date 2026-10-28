import { describe, expect, it } from 'vitest';
import { isInAppBrowser } from './inAppBrowser';

describe('isInAppBrowser', () => {
  it('returns false for standard desktop browsers', () => {
    // Desktop Chrome
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false);

    // Desktop Safari
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      ),
    ).toBe(false);

    // Desktop Firefox
    expect(
      isInAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'),
    ).toBe(false);
  });

  it('returns false for standard mobile Safari and Chrome', () => {
    // iOS Mobile Safari
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);

    // Android Mobile Chrome
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
      ),
    ).toBe(false);
  });

  it('returns true for iOS in-app webviews', () => {
    // Gmail on iOS
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Gmail/6.0.231127',
      ),
    ).toBe(true);

    // Outlook on iOS
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Outlook-iOS/4.2348.0',
      ),
    ).toBe(true);

    // Instagram on iOS
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 311.0.0.19.108',
      ),
    ).toBe(true);

    // Google App (GSA) on iOS
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/293.0.591146609 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);

    // Generic iOS WebKit webview (no Safari token)
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ),
    ).toBe(true);
  });

  it('returns true for Android in-app webviews', () => {
    // Android WebView with `wv`
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.231205.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36',
      ),
    ).toBe(true);

    // Android Gmail webview
    expect(
      isInAppBrowser(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36 Gmail',
      ),
    ).toBe(true);
  });
});
