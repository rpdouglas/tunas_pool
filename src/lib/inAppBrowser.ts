/**
 * Browsers built into other apps (Facebook, Messenger, Instagram and the like). Links shared in a
 * group chat open in these, and they behave differently: Google refuses to sign in inside them, and
 * an email link opens in the phone's real browser, away from the guest's picks (PROJECT_PLAN
 * Sprint 9). The pool works in them for making picks; this is for the sign-in screens.
 */
const IN_APP =
  /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|MicroMessenger|TikTok|Snapchat|Twitter|; wv\)/i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP.test(userAgent);
}
