import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let firestore: Firestore | null = null;

export function getDb(): Firestore {
  if (firestore) {
    return firestore;
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

  firestore = getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });

  return firestore;
}
