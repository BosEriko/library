import test from "node:test";
import assert from "node:assert/strict";

delete process.env.REDIS_URL;

const { acquireLock } = await import("@/lib/redis");

test("locks are always granted without Redis, so work goes ahead as before", async () => {
  assert.equal(await acquireLock("chart:ANIME_2026-W46", 60), true);
  assert.equal(await acquireLock("chart:ANIME_2026-W46", 60), true);
});
