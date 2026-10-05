import { FirebaseError } from 'firebase/app';

/** A message fit to show an admin: the server's plain-words reason when there is one. */
export function friendlyError(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (err.code === 'functions/unavailable' || err.code === 'functions/deadline-exceeded') {
      return "Couldn't reach the pool. Check your signal and try again.";
    }
    if (err.code === 'functions/unauthenticated' || err.code === 'functions/permission-denied') {
      return 'You need to be signed in as an admin to do that.';
    }
    return err.message.replace(/^.*?:\s*/, '') || 'Something went wrong.';
  }
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}
