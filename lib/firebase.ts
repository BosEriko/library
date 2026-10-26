import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let firestore: Firestore | null = null;

export function getDb(): Firestore {
  if (firestore) {
    return firestore;
  }

  const existingApp = getApps()[0];
  const app =
    existingApp ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

  firestore = getFirestore(app);

  if (!existingApp) {
    firestore.settings({ ignoreUndefinedProperties: true });
  }

  return firestore;
}
