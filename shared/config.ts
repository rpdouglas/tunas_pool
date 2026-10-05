/**
 * Deployment constants shared by the web app and Cloud Functions.
 * The pool lives in a named Firestore database inside a shared Firebase project (DECISIONS.md D-015),
 * so every Firestore handle must name it. A bare getFirestore() points at "(default)", which belongs
 * to other apps in the project.
 */
export const FIRESTORE_DATABASE_ID = 'db-tunaspool';
