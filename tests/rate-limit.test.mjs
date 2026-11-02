import test, { mock } from "node:test";
import assert from "node:assert/strict";

const counts = new Map();
let redisAvailable = true;

mock.module("@/lib/redis", {
  namedExports: {
    increment: async (key) => {
      if (!redisAvailable) return null;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count;
    },
  },
});

const { rateLimit, RATE_LIMIT } = await import("@/lib/rate-limit");

function request(ip) {
  return new Request("https://library.boseriko.com/api/search?q=zelda", {
    headers: { "fly-client-ip": ip },
  });
}

test.beforeEach(() => {
  counts.clear();
  redisAvailable = true;
});

test("requests up to the limit are allowed", async () => {
  for (let i = 0; i < RATE_LIMIT; i++) {
    assert.equal(await rateLimit(request("1.1.1.1")), null);
  }
});

test("the request after the limit gets a 429 with Retry-After", async () => {
  for (let i = 0; i < RATE_LIMIT; i++) await rateLimit(request("1.1.1.1"));

  const response = await rateLimit(request("1.1.1.1"));

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "Too many requests" });
  assert.equal(response.headers.get("cache-control"), "no-store");

  const retryAfter = Number(response.headers.get("retry-after"));
  assert.ok(retryAfter >= 1 && retryAfter <= 60);
});

test("each address has its own limit", async () => {
  for (let i = 0; i < RATE_LIMIT; i++) await rateLimit(request("1.1.1.1"));

  assert.equal(await rateLimit(request("2.2.2.2")), null);
});

test("requests are allowed when Redis is unavailable", async () => {
  redisAvailable = false;

  for (let i = 0; i < RATE_LIMIT + 5; i++) {
    assert.equal(await rateLimit(request("1.1.1.1")), null);
  }
});
