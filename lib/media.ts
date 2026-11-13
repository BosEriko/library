import {
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { after } from "next/server";
import { getDb } from "@/lib/firebase";
import { AdultContentError, errorMessage, NotFoundError } from "@/lib/http";
import { storeImage, type StoredImage } from "@/lib/images";
import { inFlight } from "@/lib/in-flight";
import { getAnimeManga } from "@/lib/providers/anime-manga";
import { getIgdb } from "@/lib/providers/igdb";
import { acquireLock, getCached, releaseLock, setCached } from "@/lib/redis";
import {
  hasCurrentSource,
  mediaId,
  type Media,
  type MediaType,
  type StoredMedia,
} from "@/lib/types";

const COLLECTION = "media";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const COVER_WIDTH = 480;
const BANNER_WIDTH = 1600;
const REFRESH_LOCK_SECONDS = 60;
const SAVE_LOCK_SECONDS = 30;
const SAVE_RETRY_MS = 250;
const SAVE_ATTEMPTS = 40;
const REFUSED_TTL_SECONDS = 24 * 60 * 60;

type Refusal = "missing" | "adult";

interface StoredImages {
  coverImage: StoredImage | null;
  bannerImage: StoredImage | null;
}

type MediaDocument = Media & {
  images?: StoredImages;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function fetchFromProvider(type: MediaType, id: string): Promise<Media> {
  return type === "GAME" ? getIgdb(id) : getAnimeManga(id, type);
}

function toStoredMedia(doc: MediaDocument): StoredMedia {
  const media: Media & { images?: StoredImages } = { ...doc };

  delete media.images;

  return {
    ...media,
    createdAt: doc.createdAt.toDate().toISOString(),
    updatedAt: doc.updatedAt.toDate().toISOString(),
  };
}

async function storeImages(media: Media, previous: StoredImages | undefined): Promise<StoredImages> {
  const [coverImage, bannerImage] = await Promise.all([
    storeImage(
      `media/${media.id}/cover`,
      media.coverImage,
      COVER_WIDTH,
      previous?.coverImage ?? null,
    ),
    storeImage(
      `media/${media.id}/banner`,
      media.bannerImage,
      BANNER_WIDTH,
      previous?.bannerImage ?? null,
    ),
  ]);

  return { coverImage, bannerImage };
}

function assertAllowed(media: Media, allowAdult: boolean): void {
  if (media.isAdult && !allowAdult) {
    throw new AdultContentError(`${media.id} is adult content`);
  }
}

function isComplete(doc: MediaDocument): boolean {
  return doc.isAdult !== undefined && (doc.type !== "GAME" || doc.details?.steamUrl !== undefined);
}

function isFresh(doc: MediaDocument): boolean {
  return (
    isComplete(doc) &&
    hasCurrentSource(doc) &&
    Date.now() - doc.updatedAt.toMillis() < MAX_AGE_MS
  );
}

function currentDocument(snapshot: DocumentSnapshot): MediaDocument | null {
  const saved = snapshot.exists ? (snapshot.data() as MediaDocument) : null;

  return saved && hasCurrentSource(saved) ? saved : null;
}

async function saveMedia(ref: DocumentReference, media: Media): Promise<MediaDocument> {
  const lock = `save:${media.id}`;

  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    if (await acquireLock(lock, SAVE_LOCK_SECONDS)) {
      try {
        const existing = currentDocument(await ref.get());
        const images = await storeImages(media, existing?.images);
        const now = Timestamp.now();
        const document: MediaDocument = {
          ...media,
          coverImage: images.coverImage?.url ?? media.coverImage,
          bannerImage: images.bannerImage?.url ?? media.bannerImage,
          images,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };

        await ref.set(document);

        return document;
      } finally {
        await releaseLock(lock);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, SAVE_RETRY_MS));
  }

  throw new Error(`Timed out waiting to save ${media.id}`);
}

async function refreshInBackground(
  ref: DocumentReference,
  type: MediaType,
  id: string,
): Promise<void> {
  if (!(await acquireLock(`refresh:${mediaId(type, id)}`, REFRESH_LOCK_SECONDS))) {
    return;
  }

  try {
    await saveMedia(ref, await fetchFromProvider(type, id));
  } catch (error) {
    console.warn(`Background refresh of ${mediaId(type, id)} failed: ${errorMessage(error)}`);
  }
}

export async function getOrFetchMedia(
  type: MediaType,
  id: string,
  allowAdult: boolean,
): Promise<StoredMedia> {
  const ref = getDb().collection(COLLECTION).doc(mediaId(type, id));
  const existing = currentDocument(await ref.get());

  if (existing && isFresh(existing)) {
    assertAllowed(existing, allowAdult);

    return toStoredMedia(existing);
  }

  if (existing && isComplete(existing)) {
    assertAllowed(existing, allowAdult);
    after(() => refreshInBackground(ref, type, id));

    return toStoredMedia(existing);
  }

  const refusedKey = `refused:${mediaId(type, id)}`;

  if (!existing) {
    const [refused] = await getCached<Refusal>([refusedKey]);

    if (refused === "missing") {
      throw new NotFoundError(`${mediaId(type, id)} not found`);
    }

    if (refused === "adult" && !allowAdult) {
      throw new AdultContentError(`${mediaId(type, id)} is adult content`);
    }
  }

  let media: Media;

  try {
    media = await inFlight(`media:${mediaId(type, id)}`, () => fetchFromProvider(type, id));
  } catch (error) {
    if (existing) {
      assertAllowed(existing, allowAdult);

      return toStoredMedia(existing);
    }

    if (error instanceof NotFoundError) {
      await setCached([[refusedKey, "missing"]], REFUSED_TTL_SECONDS);
    }

    throw error;
  }

  if (media.isAdult && !allowAdult) {
    await setCached([[refusedKey, "adult"]], REFUSED_TTL_SECONDS);
  }

  assertAllowed(media, allowAdult);

  return toStoredMedia(await saveMedia(ref, media));
}

export function saveMediaItems(items: Media[]): Promise<Media[]> {
  return Promise.all(
    items.map(async (media) => {
      let saved: MediaDocument | null = null;

      try {
        saved = await saveMedia(getDb().collection(COLLECTION).doc(media.id), media);
      } catch (error) {
        console.warn(`Failed to save ${media.id}: ${errorMessage(error)}`);
      }

      return {
        ...media,
        coverImage: saved?.images?.coverImage?.url ?? null,
        bannerImage: saved?.images?.bannerImage?.url ?? null,
      };
    }),
  );
}
