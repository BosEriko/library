import test, { mock } from "node:test";
import assert from "node:assert/strict";

process.env.IGDB_CLIENT_ID = "test-client";
process.env.IGDB_CLIENT_SECRET = "test-secret";
process.env.IGDB_API_URL = "https://igdb.test/v4";

const cache = new Map();
const ttls = new Map();

mock.module("@/lib/redis", {
  namedExports: {
    getCached: async (keys) => keys.map((key) => cache.get(key)),
    setCached: async (entries, ttlSeconds) => {
      for (const [key, value] of entries) {
        cache.set(key, value);
        ttls.set(key, ttlSeconds);
      }
    },
  },
});

const { getIgdb } = await import("@/lib/providers/igdb");

function mockFetch() {
  return mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("id.twitch.tv")) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Response.json({ access_token: "fresh", expires_in: 3600 });
    }

    return Response.json([{ id: 1, name: "Game" }]);
  });
}

function tokenRequests(fetch) {
  return fetch.mock.calls.filter((call) => String(call.arguments[0]).includes("id.twitch.tv"));
}

function authHeaders(fetch) {
  return fetch.mock.calls
    .filter((call) => String(call.arguments[0]).endsWith("/games"))
    .map((call) => call.arguments[1].headers.Authorization);
}

test.afterEach(() => mock.restoreAll());

test("requests at once share one new token, which is saved to Redis until it expires", async () => {
  const fetch = mockFetch();

  await Promise.all([getIgdb("1"), getIgdb("1"), getIgdb("1")]);

  assert.equal(tokenRequests(fetch).length, 1);
  assert.deepEqual(authHeaders(fetch), ["Bearer fresh", "Bearer fresh", "Bearer fresh"]);
  assert.equal(cache.get("igdb:token").value, "fresh");
  assert.equal(ttls.get("igdb:token"), 3540);
});

test("once the token in memory expires, a token saved in Redis is used instead of requesting one", async () => {
  const later = Date.now() + 2 * 60 * 60 * 1000;
  mock.timers.enable({ apis: ["Date"], now: later });
  cache.set("igdb:token", { value: "shared", expiresAt: later + 60_000 });
  const fetch = mockFetch();

  await getIgdb("1");

  assert.equal(tokenRequests(fetch).length, 0);
  assert.deepEqual(authHeaders(fetch), ["Bearer shared"]);
});
