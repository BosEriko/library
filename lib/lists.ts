import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { inFlight } from "@/lib/in-flight";
import { saveMediaItems } from "@/lib/media";
import { listAnimeManga } from "@/lib/providers/anime-manga";
import { listIgdb } from "@/lib/providers/igdb";
import { acquireLock, releaseLock } from "@/lib/redis";
import { hasCurrentSource, type ListName, type Media, type MediaList, type MediaType } from "@/lib/types";

const COLLECTION = "lists";
const LIST_SIZE = 20;
const REFRESH_LOCK_SECONDS = 60;

export const LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SavedItems {
  items: Media[];
  updatedAt: Timestamp;
}

interface ListDocument extends SavedItems {
  type: MediaType;
  list: ListName;
  adult: boolean;
}

export interface ListResult {
  list: MediaList;
  stale: boolean;
}

export function fetchList(
  type: MediaType,
  list: ListName,
  allowAdult: boolean,
  status?: "RELEASING",
): Promise<Media[]> {
  return type === "GAME"
    ? listIgdb(list, LIST_SIZE, allowAdult)
    : listAnimeManga(type, list, LIST_SIZE, allowAdult, status);
}

function toMediaList(doc: ListDocument): MediaList {
  return {
    type: doc.type,
    list: doc.list,
    items: doc.items,
    updatedAt: doc.updatedAt.toDate().toISOString(),
  };
}

export async function getOrFetchItems<D extends SavedItems>(
  ref: DocumentReference,
  fetchItems: () => Promise<Media[]>,
  fields: Omit<D, keyof SavedItems>,
): Promise<{ doc: D; stale: boolean }> {
  const snapshot = await ref.get();
  const saved = snapshot.exists ? (snapshot.data() as D) : null;
  const existing = saved && saved.items.every(hasCurrentSource) ? saved : null;

  if (existing && Date.now() - existing.updatedAt.toMillis() < LIST_MAX_AGE_MS) {
    return { doc: existing, stale: false };
  }

  return inFlight(`items:${ref.path}`, () => refreshItems(ref, fetchItems, fields, existing));
}

async function refreshItems<D extends SavedItems>(
  ref: DocumentReference,
  fetchItems: () => Promise<Media[]>,
  fields: Omit<D, keyof SavedItems>,
  existing: D | null,
): Promise<{ doc: D; stale: boolean }> {
  const lock = `refresh:${ref.path}`;

  const locked = await acquireLock(lock, REFRESH_LOCK_SECONDS);

  if (!locked && existing) {
    return { doc: existing, stale: true };
  }

  try {
    return await rebuildItems(ref, fetchItems, fields, existing);
  } finally {
    if (locked) {
      await releaseLock(lock);
    }
  }
}

async function rebuildItems<D extends SavedItems>(
  ref: DocumentReference,
  fetchItems: () => Promise<Media[]>,
  fields: Omit<D, keyof SavedItems>,
  existing: D | null,
): Promise<{ doc: D; stale: boolean }> {
  let items: Media[];

  try {
    items = await fetchItems();
  } catch (error) {
    if (existing) {
      return { doc: existing, stale: true };
    }

    throw error;
  }

  if (items.length === 0 && existing) {
    return { doc: existing, stale: true };
  }

  items = await saveMediaItems(items);

  const doc = { ...fields, items, updatedAt: Timestamp.now() } as D;

  await ref.set(doc);

  return { doc, stale: false };
}

export async function getOrFetchList(
  type: MediaType,
  list: ListName,
  allowAdult: boolean,
): Promise<ListResult> {
  const ref = getDb()
    .collection(COLLECTION)
    .doc(`${type}_${list}${allowAdult ? "_adult" : ""}`);
  const { doc, stale } = await getOrFetchItems<ListDocument>(
    ref,
    () => fetchList(type, list, allowAdult),
    { type, list, adult: allowAdult },
  );

  return { list: toMediaList(doc), stale };
}
