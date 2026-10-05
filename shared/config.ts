/**
 * Deployment constants shared by the web app and Cloud Functions.
 * The pool lives in a named Firestore database inside a shared Firebase project (DECISIONS.md D-015),
 * so every Firestore handle must name it. A bare getFirestore() points at "(default)", which belongs
 * to other apps in the project.
 */
export const FIRESTORE_DATABASE_ID = 'db-tunaspool';

/**
 * Cloud Functions region (DECISIONS.md D-028). Firestore triggers must run where the database
 * lives, and db-tunaspool is in nam5, so everything runs in us-central1. Used by both the
 * functions' global options and the web app's callable client, so they cannot drift.
 */
export const FUNCTIONS_REGION = 'us-central1';

/**
 * The pool's own Storage bucket for paper-sheet photos (DECISIONS.md D-029). The project's default
 * bucket is shared with other apps and is never used. Pinned in firebase.json too.
 */
export const PAPER_SHEETS_BUCKET = 'tunaspool-paper-sheets';
