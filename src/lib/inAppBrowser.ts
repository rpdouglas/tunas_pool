/**
 * In-app browser detection (D-141).
 * Detects whether the current page is being viewed inside an in-app webview
 * (such as Gmail, Outlook, Yahoo Mail, Facebook, Instagram, or WebKit WebView)
 * rather than the user's primary mobile browser (Safari / Chrome).
 */

export function isInAppBrowser(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  const ua = userAgent || '';
  if (!ua) return false;

  // iOS in-app webviews (Gmail, Outlook, Yahoo, Facebook, Instagram, etc.)
  // On iOS, all browsers use WebKit. A regular Safari browser contains 'Safari' and no webview identifiers.
  // In-app webviews often include 'FBAN', 'FBAV', 'Instagram', 'GSA', 'Gmail', 'Outlook', or lack 'Safari'.
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS) {
    const isWebKit = /AppleWebKit/i.test(ua);
    const hasSafariToken = /Safari/i.test(ua);
    const hasInAppToken =
      /GSA\/|Gmail|Outlook|FBAV|FBAN|Instagram|Line\/|MicroMessenger|musical_ly|BytedanceWebview|Snapchat/i.test(
        ua,
      );
    if (hasInAppToken) return true;
    // Standalone WebKit webview without the Safari token
    if (isWebKit && !hasSafariToken) return true;
  }

  // Android in-app webviews
  // Typically include 'Version/4.0' with 'Chrome', or 'wv' (WebView), or explicit app identifiers.
  const isAndroid = /Android/i.test(ua);
  if (isAndroid) {
    if (/;\s*wv\b|Version\/4\.0|Gmail|Outlook|FBAN|FBAV|Instagram/i.test(ua)) {
      return true;
    }
  }

  return false;
}
