import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { after } from "next/server";
import { getDb } from "@/lib/firebase";
import { AdultContentError, errorMessage } from "@/lib/http";
import { deleteImage, storeImage, type StoredImage } from "@/lib/images";
import { getAniList } from "@/lib/providers/anilist";
import { getIgdb } from "@/lib/providers/igdb";
import { acquireLock } from "@/lib/redis";
import {
  mediaId,
  savedWithMalIds,
  type Media,
  type MediaType,
  type StoredMedia,
} from "@/lib/types";

const COLLECTION = "media";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const COVER_WIDTH = 480;
const BANNER_WIDTH = 1600;
const REFRESH_LOCK_SECONDS = 60;

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
  return type === "GAME" ? getIgdb(id) : getAniList(id, type);
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

async function deleteReplacedImages(
  previous: StoredImages | undefined,
  current: StoredImages,
): Promise<void> {
  const replaced = [
    previous?.coverImage?.url !== current.coverImage?.url ? previous?.coverImage : null,
    previous?.bannerImage?.url !== current.bannerImage?.url ? previous?.bannerImage : null,
  ].filter((image): image is StoredImage => Boolean(image));

  await Promise.all(replaced.map(deleteImage));
}

function assertAllowed(media: Media, allowAdult: boolean): void {
  if (media.isAdult && !allowAdult) {
    throw new AdultContentError(`${media.id} is adult content`);
  }
}

function isFresh(doc: MediaDocument): boolean {
  return doc.isAdult !== undefined && Date.now() - doc.updatedAt.toMillis() < MAX_AGE_MS;
}

async function saveMedia(
  ref: DocumentReference,
  media: Media,
  existing: MediaDocument | null,
): Promise<MediaDocument> {
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
  await deleteReplacedImages(existing?.images, images);

  return document;
}

async function refreshInBackground(
  ref: DocumentReference,
  type: MediaType,
  id: string,
  existing: MediaDocument,
): Promise<void> {
  if (!(await acquireLock(`refresh:${mediaId(type, id)}`, REFRESH_LOCK_SECONDS))) {
    return;
  }

  try {
    await saveMedia(ref, await fetchFromProvider(type, id), existing);
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
  const snapshot = await ref.get();
  const saved = snapshot.exists ? (snapshot.data() as MediaDocument) : null;
  const existing = saved && savedWithMalIds(saved) ? saved : null;

  if (existing && isFresh(existing)) {
    assertAllowed(existing, allowAdult);

    return toStoredMedia(existing);
  }

  if (existing && existing.isAdult !== undefined) {
    assertAllowed(existing, allowAdult);
    after(() => refreshInBackground(ref, type, id, existing));

    return toStoredMedia(existing);
  }

  let media: Media;

  try {
    media = await fetchFromProvider(type, id);
  } catch (error) {
    if (existing) {
      assertAllowed(existing, allowAdult);

      return toStoredMedia(existing);
    }

    throw error;
  }

  assertAllowed(media, allowAdult);

  return toStoredMedia(await saveMedia(ref, media, existing));
}
