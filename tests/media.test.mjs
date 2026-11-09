import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";

const DAY_MS = 24 * 60 * 60 * 1000;

const docs = new Map();
const events = [];
const scheduled = [];
let provider = async () => {
  throw new Error("provider not set");
};
let lockAcquired = true;
let failWrites = false;
const heldLocks = new Set();

function fakeDb() {
  return {
    collection: () => ({
      doc: (id) => ({
        get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
        set: async (data) => {
          if (failWrites) throw new Error("write failed");
          events.push(`set ${id}`);
          docs.set(id, data);
        },
      }),
    }),
  };
}

mock.module("@/lib/firebase", { namedExports: { getDb: fakeDb } });
mock.module("@/lib/providers/anime-manga", {
  namedExports: { getAnimeManga: (...args) => provider(...args) },
});
mock.module("@/lib/providers/igdb", {
  namedExports: { getIgdb: (...args) => provider(...args) },
});
mock.module("@/lib/images", {
  namedExports: {
    storeImage: async (path, source, _width, previous) => {
      if (!source) return null;
      if (previous?.source === source) return previous;
      events.push(`upload ${path}`);
      return { url: `https://bucket/${path}-${source}`, source };
    },
  },
});
mock.module("@/lib/redis", {
  namedExports: {
    acquireLock: async (key) => {
      if (key.startsWith("refresh:")) return lockAcquired;
      if (heldLocks.has(key)) return false;
      heldLocks.add(key);
      return true;
    },
    releaseLock: async (key) => {
      heldLocks.delete(key);
    },
  },
});
mock.module("next/server", {
  namedExports: { after: (callback) => scheduled.push(callback) },
});

const { getOrFetchMedia, saveMediaItems } = await import("@/lib/media");
const { AdultContentError } = await import("@/lib/http");

function media(overrides = {}) {
  return {
    id: "ANIME_1",
    type: "ANIME",
    sourceId: "1",
    title: "Title",
    altTitles: [],
    synopsis: null,
    coverImage: "cover-v1",
    bannerImage: null,
    year: 2020,
    status: "FINISHED",
    genres: [],
    score: 8,
    isAdult: false,
    source: { provider: "myanimelist", url: "https://myanimelist.net/anime/1" },
    details: {},
    ...overrides,
  };
}

function savedDoc(ageDays, overrides = {}) {
  const updatedAt = Timestamp.fromMillis(Date.now() - ageDays * DAY_MS);

  return {
    ...media({ coverImage: "https://bucket/media/ANIME_1/cover-cover-v1" }),
    images: {
      coverImage: { url: "https://bucket/media/ANIME_1/cover-cover-v1", source: "cover-v1" },
      bannerImage: null,
    },
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

test.beforeEach(() => {
  docs.clear();
  events.length = 0;
  scheduled.length = 0;
  heldLocks.clear();
  lockAcquired = true;
  failWrites = false;
});

test("a new title is fetched, its images uploaded and saved", async () => {
  provider = async () => media();

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.equal(result.coverImage, "https://bucket/media/ANIME_1/cover-cover-v1");
  assert.equal("images" in result, false);
  assert.deepEqual(events, ["upload media/ANIME_1/cover", "set ANIME_1"]);
});

test("a fresh saved copy is returned without calling the provider", async () => {
  docs.set("ANIME_1", savedDoc(5));
  provider = async () => assert.fail("provider should not be called");

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.equal(result.title, "Title");
  assert.equal(scheduled.length, 0);
});

test("an expired copy is returned right away and refreshed in the background, keeping the replaced image", async () => {
  docs.set("ANIME_1", savedDoc(31));
  provider = async () => media({ title: "New title", coverImage: "cover-v2" });

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.equal(result.title, "Title");
  assert.equal(scheduled.length, 1);

  await scheduled[0]();

  assert.equal(docs.get("ANIME_1").title, "New title");
  assert.deepEqual(events, ["upload media/ANIME_1/cover", "set ANIME_1"]);
});

test("the background refresh is skipped when another one holds the lock", async () => {
  docs.set("ANIME_1", savedDoc(31));
  lockAcquired = false;
  provider = async () => assert.fail("provider should not be called");

  await getOrFetchMedia("ANIME", "1", false);
  await scheduled[0]();

  assert.deepEqual(events, []);
});

test("an unchanged image is kept instead of uploaded again", async () => {
  docs.set("ANIME_1", savedDoc(31));
  provider = async () => media({ title: "New title" });

  await getOrFetchMedia("ANIME", "1", false);
  await scheduled[0]();

  assert.deepEqual(events, ["set ANIME_1"]);
});

test("adult titles are refused and not saved without adult=true", async () => {
  provider = async () => media({ isAdult: true });

  await assert.rejects(getOrFetchMedia("ANIME", "1", false), AdultContentError);

  assert.equal(docs.size, 0);
  assert.deepEqual(events, []);
});

test("adult titles are saved when adult=true is passed", async () => {
  provider = async () => media({ isAdult: true });

  const result = await getOrFetchMedia("ANIME", "1", true);

  assert.equal(result.isAdult, true);
  assert.equal(docs.size, 1);
});

test("a copy saved before isAdult existed is refetched before it is returned", async () => {
  const old = savedDoc(5);
  delete old.isAdult;
  docs.set("ANIME_1", old);
  provider = async () => media({ isAdult: true });

  await assert.rejects(getOrFetchMedia("ANIME", "1", false), AdultContentError);
  assert.equal(scheduled.length, 0);
});

test("the saved copy is returned when the provider fails", async () => {
  const old = savedDoc(40);
  delete old.isAdult;
  docs.set("ANIME_1", old);
  provider = async () => {
    throw new Error("provider down");
  };

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.equal(result.title, "Title");
});

const olderSource = { provider: "older", url: "https://older.test/anime/100" };

test("a copy with an older source is replaced, never returned", async () => {
  docs.set("ANIME_1", savedDoc(5, { title: "Another title", source: olderSource, details: {} }));
  provider = async () => media();

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.equal(result.title, "Title");
  assert.equal(scheduled.length, 0);
  assert.equal(docs.get("ANIME_1").source.provider, "myanimelist");
});

test("a copy with an older source isn't used when the provider fails", async () => {
  docs.set("ANIME_1", savedDoc(5, { title: "Another title", source: olderSource, details: {} }));
  provider = async () => {
    throw new Error("provider down");
  };

  await assert.rejects(getOrFetchMedia("ANIME", "1", false), /provider down/);
});

const savedGame = {
  id: "GAME_1",
  type: "GAME",
  source: { provider: "igdb", url: "https://www.igdb.com/games/one" },
};

test("a game saved before Steam links existed is refetched before it is returned", async () => {
  docs.set("GAME_1", savedDoc(5, { ...savedGame, details: { platforms: ["PC"] } }));
  provider = async () =>
    media({ ...savedGame, details: { platforms: ["PC"], steamUrl: "https://store.steampowered.com/app/1" } });

  const result = await getOrFetchMedia("GAME", "1", false);

  assert.equal(result.details.steamUrl, "https://store.steampowered.com/app/1");
  assert.equal(scheduled.length, 0);
});

test("a saved game that isn't on Steam is returned without calling the provider", async () => {
  docs.set("GAME_1", savedDoc(5, { ...savedGame, details: { steamUrl: null } }));
  provider = async () => assert.fail("provider should not be called");

  const result = await getOrFetchMedia("GAME", "1", false);

  assert.equal(result.details.steamUrl, null);
  assert.equal(scheduled.length, 0);
});

test("a provider failure with nothing saved is passed on", async () => {
  provider = async () => {
    throw new Error("provider down");
  };

  await assert.rejects(getOrFetchMedia("ANIME", "1", false), /provider down/);
});

test("titles shown in a list are saved by their id and point at the saved images", async () => {
  const items = await saveMediaItems([
    media(),
    media({ id: "ANIME_2", sourceId: "2", coverImage: "cover-2", bannerImage: "banner-2" }),
  ]);

  assert.deepEqual(
    items.map(({ coverImage, bannerImage }) => [coverImage, bannerImage]),
    [
      ["https://bucket/media/ANIME_1/cover-cover-v1", null],
      ["https://bucket/media/ANIME_2/cover-cover-2", "https://bucket/media/ANIME_2/banner-banner-2"],
    ],
  );
  assert.equal(docs.get("ANIME_2").title, "Title");
  assert.equal("createdAt" in items[0], false);
});

test("a title already saved with the same images isn't uploaded again", async () => {
  docs.set("ANIME_1", savedDoc(5));

  const [item] = await saveMediaItems([media({ title: "New title" })]);

  assert.equal(item.coverImage, "https://bucket/media/ANIME_1/cover-cover-v1");
  assert.equal(docs.get("ANIME_1").title, "New title");
  assert.deepEqual(events, ["set ANIME_1"]);
});

test("the same new title saved by two lists at once is uploaded only once", async () => {
  const [first, second] = await Promise.all([saveMediaItems([media()]), saveMediaItems([media()])]);

  assert.equal(first[0].coverImage, second[0].coverImage);
  assert.deepEqual(events, ["upload media/ANIME_1/cover", "set ANIME_1", "set ANIME_1"]);
});

test("a title that can't be saved is shown without images instead of the provider's", async () => {
  failWrites = true;
  mock.method(console, "warn", () => {});

  const [item] = await saveMediaItems([media()]);

  assert.equal(item.coverImage, null);
  assert.equal(item.bannerImage, null);
});
