import { describe, expect, it } from 'vitest';
import { isInAppBrowser } from './inAppBrowser';

describe('isInAppBrowser', () => {
  it('spots the browsers built into Facebook, Messenger, and Instagram', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/470.0.0;FBDV/iPhone15,2]',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/465.0]',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Messenger/460.0',
    ]) {
      expect(isInAppBrowser(ua)).toBe(true);
    }
  });

  it('leaves Safari, Chrome, and desktop browsers alone', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '',
    ]) {
      expect(isInAppBrowser(ua)).toBe(false);
    }
  });
});
