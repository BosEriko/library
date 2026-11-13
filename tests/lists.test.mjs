import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";

const docs = new Map();
const saved = [];
let fetched = [];
let fetches = 0;
let lockFree = true;

mock.module("@/lib/firebase", {
  namedExports: {
    getDb: () => ({
      collection: () => ({
        doc: (id) => ({
          path: `lists/${id}`,
          get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
          set: async (data) => docs.set(id, data),
        }),
      }),
    }),
  },
});
mock.module("@/lib/providers/anime-manga", {
  namedExports: {
    listAnimeManga: async () => {
      fetches += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return fetched;
    },
  },
});
mock.module("@/lib/providers/igdb", {
  namedExports: { listIgdb: async () => fetched },
});
mock.module("@/lib/media", {
  namedExports: {
    saveMediaItems: async (items) =>
      items.map((item) => {
        saved.push(item.id);
        return { ...item, coverImage: `https://bucket/media/${item.id}/cover.webp` };
      }),
  },
});

mock.module("@/lib/redis", {
  namedExports: {
    acquireLock: async () => lockFree,
    releaseLock: async () => {},
  },
});

const { getOrFetchList } = await import("@/lib/lists");

function item(sourceId, provider, details = {}) {
  return { id: `ANIME_${sourceId}`, type: "ANIME", sourceId, title: sourceId, source: { provider }, details };
}

function savedList(items) {
  return { type: "ANIME", list: "top", adult: false, items, updatedAt: Timestamp.now() };
}

test.beforeEach(() => {
  docs.clear();
  saved.length = 0;
  fetches = 0;
  lockFree = true;
  fetched = [item("52991", "myanimelist")];
});

test("a fresh list saved with MyAnimeList ids is returned as is", async () => {
  docs.set("ANIME_top", savedList([item("21", "myanimelist")]));

  const { list } = await getOrFetchList("ANIME", "top", false);

  assert.deepEqual(list.items.map((media) => media.sourceId), ["21"]);
  assert.deepEqual(saved, []);
});

test("a fresh list with an older source is rebuilt", async () => {
  docs.set("ANIME_top", savedList([item("154587", "older")]));

  const { list, stale } = await getOrFetchList("ANIME", "top", false);

  assert.equal(stale, false);
  assert.deepEqual(list.items.map((media) => media.sourceId), ["52991"]);
  assert.deepEqual(docs.get("ANIME_top").items.map((media) => media.sourceId), ["52991"]);
});

test("a rebuilt list saves each title by its id and points at the saved images", async () => {
  const { list } = await getOrFetchList("ANIME", "top", false);

  assert.deepEqual(saved, ["ANIME_52991"]);
  assert.equal(list.items[0].coverImage, "https://bucket/media/ANIME_52991/cover.webp");
  assert.equal(docs.get("ANIME_top").items[0].coverImage, "https://bucket/media/ANIME_52991/cover.webp");
});

test("requests for the same expired list at once rebuild it once", async () => {
  await Promise.all([
    getOrFetchList("ANIME", "top", false),
    getOrFetchList("ANIME", "top", false),
    getOrFetchList("ANIME", "top", false),
  ]);

  assert.equal(fetches, 1);
});

test("an expired list being rebuilt elsewhere is returned as stale without calling the provider", async () => {
  const old = savedList([item("21", "myanimelist")]);
  old.updatedAt = Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000);
  docs.set("ANIME_top", old);
  lockFree = false;

  const { list, stale } = await getOrFetchList("ANIME", "top", false);

  assert.equal(stale, true);
  assert.equal(fetches, 0);
  assert.deepEqual(list.items.map((media) => media.sourceId), ["21"]);
});

test("a list never saved is built even while another build holds the lock", async () => {
  lockFree = false;

  const { list } = await getOrFetchList("ANIME", "top", false);

  assert.equal(fetches, 1);
  assert.deepEqual(list.items.map((media) => media.sourceId), ["52991"]);
});
