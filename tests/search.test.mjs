import test, { mock } from "node:test";
import assert from "node:assert/strict";

const cache = new Map();
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
    searchAnimeManga: async (query, type) => [
      { id: `${type}_1`, type, title: query, source: { provider: "myanimelist" }, details: {} },
    ],
  },
});
mock.module("@/lib/providers/igdb", {
  namedExports: {
    searchIgdb: async (query) => {
      if (gamesFail) throw new Error("IGDB down");
      return [{ id: "GAME_1", title: query }];
    },
  },
});

const { searchAll } = await import("@/lib/search");

test.beforeEach(() => {
  cache.clear();
  gamesFail = false;
});

test("searches are cached without regard to letter case", async () => {
  await searchAll("Zelda", 5, false);

  assert.deepEqual([...cache.keys()], ["search:safe:5:zelda"]);

  const cached = await searchAll("ZELDA", 5, false);

  assert.equal(cached.results.game[0].title, "Zelda");
});

test("adult and limit settings get their own cache entries", async () => {
  await searchAll("zelda", 5, false);
  await searchAll("zelda", 5, true);
  await searchAll("zelda", 10, false);

  assert.deepEqual([...cache.keys()].sort(), [
    "search:adult:5:zelda",
    "search:safe:10:zelda",
    "search:safe:5:zelda",
  ]);
});

test("a search cached with an older source is searched again", async () => {
  cache.set("search:safe:5:zelda", {
    results: {
      anime: [
        { id: "ANIME_9", type: "ANIME", title: "old", source: { provider: "older" }, details: {} },
      ],
      manga: [],
      game: [],
    },
    errors: {},
  });

  const result = await searchAll("zelda", 5, false);

  assert.equal(result.results.anime[0].title, "zelda");
  assert.equal(cache.get("search:safe:5:zelda").results.anime[0].title, "zelda");
});

test("a search where a provider failed is returned but not cached", async () => {
  gamesFail = true;

  const result = await searchAll("zelda", 5, false);

  assert.deepEqual(result.results.game, []);
  assert.equal(result.errors.game, "Search failed");
  assert.equal(cache.size, 0);
});
