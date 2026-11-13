import test, { mock } from "node:test";
import assert from "node:assert/strict";

const cache = new Map();

const calls = [];
let gamesFail = false;

mock.module("@/lib/redis", {
  namedExports: {
    getCached: async (keys) => keys.map((key) => cache.get(key)),
    setCached: async (entries) => {
      for (const [key, value] of entries) cache.set(key, value);
    },
  },
});
mock.module("@/lib/providers/anime-manga", {
  namedExports: {
    searchAnimeManga: async (query, type, limit) => {
      calls.push([type, limit]);
      return Array.from({ length: limit }, (_, index) => ({
        id: `${type}_${index + 1}`,
        type,
        title: query,
        source: { provider: "myanimelist" },
        details: {},
      }));
    },
  },
});
mock.module("@/lib/providers/igdb", {
  namedExports: {
    searchIgdb: async (query, limit) => {
      calls.push(["GAME", limit]);
      if (gamesFail) throw new Error("IGDB down");
      return Array.from({ length: limit }, (_, index) => ({ id: `GAME_${index + 1}`, type: "GAME", title: query }));
    },
  },
});

const { searchAll } = await import("@/lib/search");

test.beforeEach(() => {
  cache.clear();
  calls.length = 0;
  gamesFail = false;
});

test("searches are cached by type without regard to letter case", async () => {
  await searchAll("Zelda", 5, false);

  assert.deepEqual([...cache.keys()].sort(), [
    "search:safe:5:anime:zelda",
    "search:safe:5:game:zelda",
    "search:safe:5:manga:zelda",
  ]);

  const cached = await searchAll("ZELDA", 5, false);

  assert.equal(cached.results.game[0].title, "Zelda");
  assert.equal(calls.length, 3);
});

test("each provider is asked for the requested limit", async () => {
  const result = await searchAll("zelda", 3, false);

  assert.deepEqual(calls, [
    ["ANIME", 3],
    ["MANGA", 3],
    ["GAME", 3],
  ]);
  assert.equal(result.results.anime.length, 3);
});

test("adult and limit settings get their own cache entries", async () => {
  await searchAll("zelda", 5, false);
  await searchAll("zelda", 5, true);
  await searchAll("zelda", 10, false);

  assert.equal(calls.length, 9);
  assert.ok(cache.has("search:adult:5:anime:zelda"));
  assert.ok(cache.has("search:safe:10:game:zelda"));
});

test("a search cached with an older source is searched again", async () => {
  cache.set("search:safe:5:anime:zelda", [
    { id: "ANIME_9", type: "ANIME", title: "old", source: { provider: "older" }, details: {} },
  ]);

  const result = await searchAll("zelda", 5, false);

  assert.equal(result.results.anime[0].title, "zelda");
  assert.equal(cache.get("search:safe:5:anime:zelda")[0].title, "zelda");
});

test("a provider that failed is returned empty and not cached, while the others are", async () => {
  gamesFail = true;

  const result = await searchAll("zelda", 5, false);

  assert.deepEqual(result.results.game, []);
  assert.equal(result.errors.game, "Search failed");
  assert.equal(cache.has("search:safe:5:game:zelda"), false);
  assert.equal(cache.has("search:safe:5:anime:zelda"), true);

  gamesFail = false;
  calls.length = 0;

  const retried = await searchAll("zelda", 5, false);

  assert.deepEqual(calls, [["GAME", 5]]);
  assert.equal(retried.errors.game, undefined);
});

test("the same search at once calls each provider once", async () => {
  await Promise.all([searchAll("zelda", 5, false), searchAll("zelda", 5, false)]);

  assert.equal(calls.length, 3);
});
