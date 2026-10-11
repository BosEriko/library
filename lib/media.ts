import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { getIgdb } from "@/lib/providers/igdb";
import { getJikan } from "@/lib/providers/jikan";
import { mediaId, type Media, type MediaType, type StoredMedia } from "@/lib/types";

const COLLECTION = "media";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type MediaDocument = Media & { createdAt: Timestamp; updatedAt: Timestamp };

function fetchFromProvider(type: MediaType, id: string): Promise<Media> {
  return type === "GAME" ? getIgdb(id) : getJikan(id, type);
}

function toStoredMedia(doc: MediaDocument): StoredMedia {
  return {
    ...doc,
    createdAt: doc.createdAt.toDate().toISOString(),
    updatedAt: doc.updatedAt.toDate().toISOString(),
  };
}

export async function getOrFetchMedia(type: MediaType, id: string): Promise<StoredMedia> {
  const ref = getDb().collection(COLLECTION).doc(mediaId(type, id));
  const snapshot = await ref.get();
  const existing = snapshot.exists ? (snapshot.data() as MediaDocument) : null;

  if (existing && Date.now() - existing.updatedAt.toMillis() < MAX_AGE_MS) {
    return toStoredMedia(existing);
  }

  let media: Media;

  try {
    media = await fetchFromProvider(type, id);
  } catch (error) {
    if (existing) {
      return toStoredMedia(existing);
    }

    throw error;
  }

  const now = Timestamp.now();
  const document: MediaDocument = {
    ...media,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await ref.set(document);

  return toStoredMedia(document);
}
