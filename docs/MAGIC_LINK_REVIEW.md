# Magic Link & Session Persistence Review

**Date:** 2026-10-28  
**Scope:** Review of how the email magic link login works, why users experience having to log in repeatedly, and architectural options to resolve it.

---

## 1. How the Magic Link Flow Operates

The magic link system in Tunas Pool spans the following files and lifecycle stages:

| Stage | Files | Mechanism |
|---|---|---|
| **1. Request Link** | [`src/features/auth/EmailLinkForm.tsx`](file:///workspaces/tunas_pool/src/features/auth/EmailLinkForm.tsx)<br>[`src/features/auth/emailLink.ts`](file:///workspaces/tunas_pool/src/features/auth/emailLink.ts#L56-L60) | User submits email. `sendSignInLink(email, next)` calls Firebase `sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true })`. Stores the email address in browser `localStorage` as `tunas.emailForSignIn`. |
| **2. Land on Finish** | [`src/pages/FinishSignIn.tsx`](file:///workspaces/tunas_pool/src/pages/FinishSignIn.tsx) | Landing route `/auth/finish?next=...`. Checks `isSignInWithEmailLink(auth, href)`. Checks `localStorage` for `tunas.emailForSignIn`. If missing (e.g. opened in another browser), prompts user: *"Finish on this phone: type the email address it was sent to."* |
| **3. Account Linking vs Sign-In** | [`src/features/auth/emailLink.ts`](file:///workspaces/tunas_pool/src/features/auth/emailLink.ts#L87-L119)<br>[`functions/src/index.ts`](file:///workspaces/tunas_pool/functions/src/index.ts#L798) | Calls `finishSignIn(email, href)`: <br>• If new guest: calls `linkWithCredential` to link the anonymous `uid` to the email.<br>• If existing user: signs in via `signInWithEmailLink` and calls Cloud Function `adoptGuestProfile` to migrate the guest's picks. |
| **4. Session Persistence** | [`src/lib/firebase.ts`](file:///workspaces/tunas_pool/src/lib/firebase.ts#L43-L51) | Initialized with `persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]`. |

---

## 2. Root Causes: Why Users Have to Log In Every Time

Once a user successfully logs in, Firebase Auth stores refresh and ID tokens in **IndexedDB** (`indexedDBLocalPersistence`), which does not expire on its own and survives tab/browser restarts. 

However, in mobile real-world use, several friction points cause the "login every time" symptom:

### Cause 1: In-App Email Browsers (The Primary Mobile Culprit)
* **What happens:** When users open an email on iOS or Android (Gmail, Outlook, Yahoo, Messenger), tapping the magic link opens in an **in-app webview** (Safari View Controller or Chrome Custom Tab), **not** in their main Safari or Chrome browser.
* **The issue:** The in-app webview has a sandboxed, isolated storage jar:
  1. It cannot access `tunas.emailForSignIn` in Safari's `localStorage`, forcing the user to manually type their email again.
  2. The authenticated session is saved **only inside that temporary in-app webview**.
  3. When the user closes the email app and goes back to Safari (or opens their Home Screen bookmark) to check the pool later, **Safari is still an unauthenticated guest**.
  4. The user concludes that the site logged them out or that login didn't work.

### Cause 2: Action Code "Burn" Bug for Returning Users ([Decision D-033](file:///workspaces/tunas_pool/docs/DECISIONS.md#L39))
* **What happens:** In [`src/features/auth/useAuth.ts`](file:///workspaces/tunas_pool/src/features/auth/useAuth.ts#L14), `useGuestSession` automatically logs visitors in as anonymous guests (`signInAnonymously`).
* When an existing player requests a magic link and clicks it:
  1. [`finishSignIn`](file:///workspaces/tunas_pool/src/features/auth/emailLink.ts#L94-L110) inspects `current?.isAnonymous`, which is `true`.
  2. It first executes `linkWithCredential(current, ...)`.
  3. Firebase Auth rejects this with `auth/email-already-in-use` because the email already has an account.
  4. **The single-use action code (`oobCode`) is consumed by Firebase during the failed `linkWithCredential` attempt.**
  5. The fallback `signInAndMove` immediately throws `auth/invalid-action-code`.
  6. The app catches this and triggers `sendSignInLink` again, showing: *"This email already has an account, so we sent you a fresh link. Open the new email to finish."*
* **Impact:** Every returning player who clicks an email link has their first link burned and is forced to wait for and open a second email link. If they try clicking the first link again, they get "link has expired or was already used."

### Cause 3: Home Screen PWA Isolation (iOS)
* If a player installed Tunas Pool using Safari's **"Add to Home Screen"**:
  - iOS treats the standalone Home Screen web app as a separate app container with separate IndexedDB storage from Safari.
  - When requesting the link inside the Home Screen web app, switching to Mail and tapping the link opens in **Safari**.
  - Safari is now authenticated, but tapping the Home Screen icon opens the standalone PWA, which remains an **unauthenticated guest**.

### Cause 4: Safari Private Browsing & Ephemeral Tabs
* If a user plays from Safari Private Browsing mode, iOS completely wipes LocalStorage and IndexedDB when the private tab or browser is closed.
* Each new visit generates a fresh anonymous guest session.

### Cause 5: UI Copy Creates the Impression That Sign-In Is Required Every Week
* Tunas Pool is architected around guest-first participation: anyone can make and submit picks without logging in.
* However, in [`src/components/layout/AppMenu.tsx`](file:///workspaces/tunas_pool/src/components/layout/AppMenu.tsx#L160-L164), if a user does not have a linked account, the drawer displays:
  > **Guest**  
  > *Sign in to save your picks*
* Even if their device has an active player profile with submitted picks, players seeing "Guest" often think they are logged out and must request a magic link every week.

---

## 3. Recommended Actions & Next Steps

1. **Fix the Returning User Sign-In Flow:**
   - Differentiate between **"Save this phone's picks"** (guest linking via `linkWithCredential`) and **"Sign in to existing account"** (direct `signInWithEmailLink`).
   - If a returning user specifies they already have an account, call `signInWithEmailLink` directly so the action code is never burned by a failed `linkWithCredential`.

2. **In-App Browser Detection & Guidance:**
   - On `/auth/finish`, detect if the user agent is an in-app browser (e.g. Gmail / Outlook / WebKit webview).
   - Show an explicit prompt: *"You are viewing this inside your email app. Tap ⋮ or the Safari icon to open in your main browser so your login stays remembered."*

3. **Menu Header Clarity for Returning Guests:**
   - If a device has already submitted picks (`profile` exists from `claimedByUid == guestUid`), display their display name in the menu rather than defaulting to "Guest", with a gentler callout to link an email for cross-device access.
