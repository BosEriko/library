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

function fakeDb() {
  return {
    collection: () => ({
      doc: (id) => ({
        get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
        set: async (data) => {
          events.push(`set ${id}`);
          docs.set(id, data);
        },
      }),
    }),
  };
}

mock.module("@/lib/firebase", { namedExports: { getDb: fakeDb } });
mock.module("@/lib/providers/anilist", {
  namedExports: { getAniList: (...args) => provider(...args) },
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
    deleteImage: async (image) => {
      events.push(`delete ${image.url}`);
    },
  },
});
mock.module("@/lib/redis", {
  namedExports: { acquireLock: async () => lockAcquired },
});
mock.module("next/server", {
  namedExports: { after: (callback) => scheduled.push(callback) },
});

const { getOrFetchMedia } = await import("@/lib/media");
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
  lockAcquired = true;
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

test("an expired copy is returned right away and refreshed in the background", async () => {
  docs.set("ANIME_1", savedDoc(31));
  provider = async () => media({ title: "New title", coverImage: "cover-v2" });

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.equal(result.title, "Title");
  assert.equal(scheduled.length, 1);

  await scheduled[0]();

  assert.equal(docs.get("ANIME_1").title, "New title");
  assert.deepEqual(events, [
    "upload media/ANIME_1/cover",
    "set ANIME_1",
    "delete https://bucket/media/ANIME_1/cover-cover-v1",
  ]);
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

const aniListSource = { provider: "anilist", url: "https://anilist.co/anime/100" };

test("a copy saved under its AniList id is replaced, never returned", async () => {
  docs.set("ANIME_1", savedDoc(5, { title: "Another title", source: aniListSource, details: {} }));
  provider = async () => media();

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.equal(result.title, "Title");
  assert.equal(scheduled.length, 0);
  assert.equal(docs.get("ANIME_1").source.provider, "myanimelist");
});

test("a copy saved under its AniList id isn't used when the provider fails", async () => {
  docs.set("ANIME_1", savedDoc(5, { title: "Another title", source: aniListSource, details: {} }));
  provider = async () => {
    throw new Error("provider down");
  };

  await assert.rejects(getOrFetchMedia("ANIME", "1", false), /provider down/);
});

test("a copy with the old AniList source is returned without it and refreshed", async () => {
  docs.set("ANIME_1", savedDoc(5, { source: aniListSource, details: { anilistId: 100, format: "TV" } }));
  provider = async () => media({ details: { format: "TV" } });

  const result = await getOrFetchMedia("ANIME", "1", false);

  assert.deepEqual(result.source, { provider: "myanimelist", url: "https://myanimelist.net/anime/1" });
  assert.deepEqual(result.details, { format: "TV" });
  assert.equal(scheduled.length, 1);

  await scheduled[0]();

  assert.equal(docs.get("ANIME_1").source.provider, "myanimelist");
  assert.deepEqual(events, ["set ANIME_1"]);
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
