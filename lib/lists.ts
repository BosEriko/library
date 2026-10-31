import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { listAniList } from "@/lib/providers/anilist";
import { listIgdb } from "@/lib/providers/igdb";
import type { ListName, Media, MediaList, MediaType } from "@/lib/types";

const COLLECTION = "lists";
const LIST_SIZE = 20;

export const LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface ListDocument {
  type: MediaType;
  list: ListName;
  adult: boolean;
  items: Media[];
  updatedAt: Timestamp;
}

export interface ListResult {
  list: MediaList;
  stale: boolean;
}

function fetchList(type: MediaType, list: ListName, allowAdult: boolean): Promise<Media[]> {
  return type === "GAME"
    ? listIgdb(list, LIST_SIZE, allowAdult)
    : listAniList(type, list, LIST_SIZE, allowAdult);
}

function toMediaList(doc: ListDocument): MediaList {
  return {
    type: doc.type,
    list: doc.list,
    items: doc.items,
    updatedAt: doc.updatedAt.toDate().toISOString(),
  };
}

export async function getOrFetchList(
  type: MediaType,
  list: ListName,
  allowAdult: boolean,
): Promise<ListResult> {
  const ref = getDb()
    .collection(COLLECTION)
    .doc(`${type}_${list}${allowAdult ? "_adult" : ""}`);
  const snapshot = await ref.get();
  const existing = snapshot.exists ? (snapshot.data() as ListDocument) : null;

  if (existing && Date.now() - existing.updatedAt.toMillis() < LIST_MAX_AGE_MS) {
    return { list: toMediaList(existing), stale: false };
  }

  let items: Media[];

  try {
    items = await fetchList(type, list, allowAdult);
  } catch (error) {
    if (existing) {
      return { list: toMediaList(existing), stale: true };
    }

    throw error;
  }

  if (items.length === 0 && existing) {
    return { list: toMediaList(existing), stale: true };
  }

  const document: ListDocument = {
    type,
    list,
    adult: allowAdult,
    items,
    updatedAt: Timestamp.now(),
  };

  await ref.set(document);

  return { list: toMediaList(document), stale: false };
}
