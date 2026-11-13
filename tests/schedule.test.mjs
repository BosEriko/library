import test, { mock } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
const calls = [];
let fetched = [];
let failure = null;
let limited = null;

mock.module("@/lib/redis", {
  namedExports: {
    getCached: async (keys) => keys.map((key) => store.get(key)),
    setCached: async (entries, ttl) => {
      calls.push(["setCached", entries.map(([key]) => key), ttl]);
      for (const [key, value] of entries) store.set(key, value);
    },
  },
});
mock.module("@/lib/providers/anime-manga", {
  namedExports: {
    scheduleAnime: async (...args) => {
      calls.push(["scheduleAnime", ...args]);
      if (failure) throw failure;
      return fetched;
    },
  },
});
mock.module("@/lib/rate-limit", {
  namedExports: { rateLimit: async () => limited },
});

const { getSchedule, toScheduleIds, toScheduleMonth } = await import("@/lib/schedule");
const { GET } = await import("@/app/api/schedule/route");

const now = new Date("2026-11-14T12:00:00.000Z");

function get(query) {
  const url = new URL(`https://library.test/api/schedule?${query}`);
  return GET({ nextUrl: url, headers: new Headers() });
}

function episode(id, number, airsAt) {
  return { id, episode: number, airsAt };
}

test.beforeEach(() => {
  store.clear();
  calls.length = 0;
  fetched = [];
  failure = null;
  limited = null;
});

test("months are allowed from one month back to two months ahead", () => {
  assert.equal(toScheduleMonth("2026-10", now)?.month, "2026-10");
  assert.equal(toScheduleMonth("2027-01", now)?.month, "2027-01");
  assert.equal(toScheduleMonth("2026-09", now), null);
  assert.equal(toScheduleMonth("2027-02", now), null);
  assert.equal(toScheduleMonth("2026-13", now), null);
  assert.equal(toScheduleMonth("november", now), null);
});

test("the window covers the month plus a day on each side", () => {
  const period = toScheduleMonth("2026-11", now);

  assert.equal(period.startsAt.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal(period.endsAt.toISOString(), "2026-12-02T00:00:00.000Z");
});

test("ids must be 1 to 50 numeric ids", () => {
  assert.deepEqual(toScheduleIds("21,5114,21"), ["21", "5114"]);
  assert.equal(toScheduleIds(null), null);
  assert.equal(toScheduleIds(""), null);
  assert.equal(toScheduleIds("21,abc"), null);
  assert.equal(toScheduleIds("0"), null);
  assert.equal(toScheduleIds(Array.from({ length: 51 }, (_, i) => i + 1).join(",")), null);
});

test("only uncached ids are fetched, and each id is cached for the month", async () => {
  const period = toScheduleMonth("2026-11", now);
  store.set("schedule:21:2026-11", [episode("21", 1100, "2026-11-16T00:30:00.000Z")]);
  fetched = [episode("5114", 7, "2026-11-15T15:00:00.000Z")];

  const schedule = await getSchedule(["21", "5114", "99"], period, false);

  assert.deepEqual(
    schedule.episodes.map(({ id, episode }) => [id, episode]),
    [["5114", 7], ["21", 1100]],
  );
  assert.deepEqual(calls[0], ["scheduleAnime", ["5114", "99"], period.startsAt, period.endsAt, false]);
  assert.deepEqual(calls[1], [
    "setCached",
    ["schedule:5114:2026-11", "schedule:99:2026-11"],
    60 * 60 * 12,
  ]);
  assert.deepEqual(store.get("schedule:99:2026-11"), []);
});

test("a cached schedule doesn't reach the provider", async () => {
  const period = toScheduleMonth("2026-11", now);
  store.set("schedule:21:2026-11:adult", []);

  await getSchedule(["21"], period, true);

  assert.equal(calls.length, 0);
});

test("the route answers bad requests with 400", async () => {
  const response = await get("month=2020-01&ids=21");

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=60");
});

test("the route returns the schedule with a 12 hour cache", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  fetched = [episode("21", 1100, "2026-11-16T00:30:00.000Z")];

  const response = await get("month=2026-11&ids=21");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.month, "2026-11");
  assert.equal(body.episodes.length, 1);
  assert.match(response.headers.get("cache-control"), /s-maxage=43200/);
});

test("a provider failure returns 502 and is not cached", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now });
  failure = new Error("boom");
  mock.method(console, "error", () => {});

  const response = await get("month=2026-11&ids=21");

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(store.size, 0);
});

test("rate limited requests stop before anything else", async () => {
  limited = new Response(null, { status: 429 });

  const response = await get("month=2026-11&ids=21");

  assert.equal(response.status, 429);
  assert.equal(calls.length, 0);
});
