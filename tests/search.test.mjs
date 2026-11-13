import test, { mock } from "node:test";
import assert from "node:assert/strict";

const calls = [];
let gamesFail = false;

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
  calls.length = 0;
  gamesFail = false;
});

test("every search asks each provider for the requested limit", async () => {
  const first = await searchAll("zelda", 3, false);
  await searchAll("zelda", 3, false);

  assert.deepEqual(calls, [
    ["ANIME", 3],
    ["MANGA", 3],
    ["GAME", 3],
    ["ANIME", 3],
    ["MANGA", 3],
    ["GAME", 3],
  ]);
  assert.equal(first.results.anime.length, 3);
  assert.equal(first.results.game[0].title, "zelda");
});

test("a provider that failed is returned empty with an error", async () => {
  gamesFail = true;

  const result = await searchAll("zelda", 5, false);

  assert.deepEqual(result.results.game, []);
  assert.equal(result.errors.game, "Search failed");
  assert.equal(result.results.anime.length, 5);
});
