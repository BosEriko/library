import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { storeImage, type StoredImage } from "@/lib/images";
import { getAniList } from "@/lib/providers/anilist";
import { getIgdb } from "@/lib/providers/igdb";
import { mediaId, type Media, type MediaType, type StoredMedia } from "@/lib/types";

const COLLECTION = "media";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const COVER_WIDTH = 480;
const BANNER_WIDTH = 1600;

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

  return toStoredMedia(document);
}
