import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const CURRENT_WEEK_CACHE = "public, s-maxage=388800, stale-while-revalidate=3600";
const docs = new Map();
const calls = [];
const locks = [];
const saved = [];
const unsaved = new Set();
let limited = null;
let lock = async () => true;
let trending = async () => [];

function query(filters) {
  return {
    where: (field, op, value) => {
      assert.equal(op, "==");
      return query([...filters, [field, value]]);
    },
    select: () => query(filters),
    get: async () => ({
      docs: [...docs.values()]
        .filter((doc) => filters.every(([field, value]) => doc[field] === value))
        .map((doc) => ({ data: () => doc })),
    }),
  };
}

mock.module("@/lib/firebase", {
  namedExports: {
    getDb: () => ({
      collection: () => ({
        ...query([]),
        doc: (id) => ({
          get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
          create: async (data) => {
            if (docs.has(id)) {
              throw new Error("6 ALREADY_EXISTS: Document already exists");
            }
            docs.set(id, data);
          },
        }),
      }),
    }),
  },
});
mock.module("@/lib/providers/anime-manga", {
  namedExports: {
    listAnimeManga: async (...args) => {
      calls.push(args);
      return trending(...args);
    },
  },
});
mock.module("@/lib/providers/igdb", {
  namedExports: {
    listIgdb: async (...args) => {
      calls.push(args);
      return trending(...args);
    },
  },
});
mock.module("@/lib/media", {
  namedExports: {
    saveMediaItems: async (items) =>
      items.map((item) => {
        saved.push(item.id);
        const stored = (kind) =>
          item[kind] && !unsaved.has(item.id) ? `https://bucket/media/${item.id}/${kind}.webp` : null;
        return { ...item, coverImage: stored("coverImage"), bannerImage: stored("bannerImage") };
      }),
  },
});
mock.module("@/lib/redis", {
  namedExports: {
    acquireLock: async (key, ttlSeconds) => {
      locks.push([key, ttlSeconds]);
      return lock(key);
    },
    releaseLock: async () => {},
  },
});
mock.module("@/lib/rate-limit", {
  namedExports: { rateLimit: async () => limited },
});
mock.timers.enable({ apis: ["Date"], now: NOW });
mock.method(console, "error", () => {});

const { GET } = await import("@/app/api/charts/[type]/route");

function media(sourceId, type = "ANIME", images = {}) {
  return {
    id: `${type}_${sourceId}`,
    type,
    sourceId,
    title: sourceId,
    coverImage: null,
    bannerImage: null,
    source: { provider: "myanimelist" },
    ...images,
  };
}

function entry(sourceId, rank, previousRank, movement, weeksOnChart, peak) {
  return { rank, previousRank, movement, weeksOnChart, peak, media: media(sourceId) };
}

function savedChart(week, entries, overrides = {}) {
  return {
    type: "ANIME",
    week,
    adult: false,
    previousWeek: null,
    entries,
    updatedAt: Timestamp.fromMillis(NOW - 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function summary(chart) {
  return chart.entries.map(({ media, ...rest }) => ({ id: media.sourceId, ...rest }));
}

function get(path) {
  const url = new URL(`https://library.boseriko.com${path}`);
  const [, , , type] = url.pathname.split("/");
  return GET({ nextUrl: url, headers: new Headers() }, { params: Promise.resolve({ type }) });
}

test.beforeEach(() => {
  mock.timers.setTime(NOW);
  docs.clear();
  calls.length = 0;
  locks.length = 0;
  saved.length = 0;
  unsaved.clear();
  limited = null;
  lock = async () => true;
  trending = async () => [media("1"), media("2")];
});

test("the first request of the week builds the chart from currently releasing trending titles", async () => {
  const response = await get("/api/charts/anime");
  const chart = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), CURRENT_WEEK_CACHE);
  assert.deepEqual(calls, [["ANIME", "trending", 20, false, "RELEASING"]]);
  assert.deepEqual(locks, [["chart:ANIME_2026-W46", 60]]);
  assert.equal(chart.type, "ANIME");
  assert.equal(chart.week, "2026-W46");
  assert.equal(chart.startsAt, "2026-11-09T00:00:00.000Z");
  assert.equal(chart.endsAt, "2026-11-16T00:00:00.000Z");
  assert.equal(chart.previousWeek, null);
  assert.equal(chart.nextWeek, null);
  assert.equal(chart.updatedAt, "2026-11-11T12:00:00.000Z");
  assert.equal("images" in chart, false);
  assert.deepEqual(summary(chart), [
    { id: "1", rank: 1, previousRank: null, movement: "new", weeksOnChart: 1, peak: 1 },
    { id: "2", rank: 2, previousRank: null, movement: "new", weeksOnChart: 1, peak: 2 },
  ]);
  assert.deepEqual(docs.get("ANIME_2026-W46").entries, chart.entries);
  assert.equal(docs.get("ANIME_2026-W46").adult, false);
});

test("a saved chart for this week is served without asking the provider again", async () => {
  const first = await (await get("/api/charts/anime")).json();
  trending = async () => [media("3")];

  const again = await (await get("/api/charts/anime?week=2026-W46")).json();

  assert.equal(calls.length, 1);
  assert.equal(locks.length, 1);
  assert.deepEqual(again.entries, first.entries);
});

test("manga, games and adult charts are built and saved separately", async () => {
  trending = async () => [media("7", "GAME")];

  await get("/api/charts/manga?adult=true");
  await get("/api/charts/game");

  assert.deepEqual(calls, [
    ["MANGA", "trending", 20, true, "RELEASING"],
    ["trending", 20, false],
  ]);
  assert.deepEqual([...docs.keys()], ["MANGA_2026-W46_adult", "GAME_2026-W46"]);
  assert.equal(docs.get("MANGA_2026-W46_adult").adult, true);
});

test("every title on a new chart is saved by its id, and the chart uses those saved images", async () => {
  unsaved.add("ANIME_2");
  trending = async () => [
    media("1", "ANIME", { coverImage: "https://cdn.test/1.jpg", bannerImage: "https://cdn.test/1-wide.jpg" }),
    media("2", "ANIME", { coverImage: "https://cdn.test/2.jpg", bannerImage: null }),
  ];

  const response = await get("/api/charts/anime");
  const chart = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(saved, ["ANIME_1", "ANIME_2"]);
  assert.deepEqual(
    chart.entries.map(({ media }) => [media.coverImage, media.bannerImage]),
    [
      ["https://bucket/media/ANIME_1/coverImage.webp", "https://bucket/media/ANIME_1/bannerImage.webp"],
      [null, null],
    ],
  );
  assert.deepEqual(docs.get("ANIME_2026-W46").entries, chart.entries);
  assert.equal("images" in docs.get("ANIME_2026-W46"), false);
  assert.doesNotMatch(JSON.stringify(chart), /cdn\.test/);
});

test("a saved chart is served as it is, without saving its titles again", async () => {
  await get("/api/charts/anime");
  saved.length = 0;

  await get("/api/charts/anime?week=2026-W46");

  assert.deepEqual(saved, []);
});

test("movement, weeks on chart and peak compare against the most recent earlier saved chart", async () => {
  docs.set("ANIME_2026-W40", savedChart("2026-W40", [entry("5", 1, null, "new", 1, 1), entry("1", 2, null, "new", 1, 2)]));
  docs.set(
    "ANIME_2026-W44",
    savedChart(
      "2026-W44",
      [
        entry("1", 1, 2, "up", 2, 1),
        entry("2", 2, null, "new", 1, 2),
        entry("3", 3, null, "new", 1, 3),
        entry("4", 4, null, "new", 1, 4),
      ],
      { previousWeek: "2026-W40" },
    ),
  );
  docs.set("ANIME_2026-W45_adult", savedChart("2026-W45", [entry("4", 1, null, "new", 1, 1)], { adult: true }));
  docs.set("MANGA_2026-W45", savedChart("2026-W45", [entry("4", 1, null, "new", 1, 1)], { type: "MANGA" }));
  trending = async () => ["2", "1", "3", "5", "6"].map((id) => media(id));

  const chart = await (await get("/api/charts/anime")).json();

  assert.equal(chart.previousWeek, "2026-W44");
  assert.deepEqual(summary(chart), [
    { id: "2", rank: 1, previousRank: 2, movement: "up", weeksOnChart: 2, peak: 1 },
    { id: "1", rank: 2, previousRank: 1, movement: "down", weeksOnChart: 3, peak: 1 },
    { id: "3", rank: 3, previousRank: 3, movement: "same", weeksOnChart: 2, peak: 3 },
    { id: "5", rank: 4, previousRank: null, movement: "new", weeksOnChart: 1, peak: 1 },
    { id: "6", rank: 5, previousRank: null, movement: "new", weeksOnChart: 1, peak: 5 },
  ]);
  assert.equal(docs.get("ANIME_2026-W46").previousWeek, "2026-W44");
});

test("past weeks are served from Firestore with links to the nearest saved weeks", async () => {
  docs.set("ANIME_2026-W40", savedChart("2026-W40", [entry("5", 1, null, "new", 1, 1)]));
  docs.set("ANIME_2026-W44", savedChart("2026-W44", [entry("1", 1, null, "new", 1, 1)], { previousWeek: "2026-W40" }));
  docs.set("ANIME_2026-W46", savedChart("2026-W46", [entry("1", 1, 1, "same", 2, 1)], { previousWeek: "2026-W44" }));
  docs.set("ANIME_2026-W45_adult", savedChart("2026-W45", [], { adult: true, previousWeek: "2026-W44" }));

  const response = await get("/api/charts/anime?week=2026-W44");
  const chart = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=604800, stale-while-revalidate=86400");
  assert.equal(chart.week, "2026-W44");
  assert.equal(chart.startsAt, "2026-10-26T00:00:00.000Z");
  assert.equal(chart.endsAt, "2026-11-02T00:00:00.000Z");
  assert.equal(chart.previousWeek, "2026-W40");
  assert.equal(chart.nextWeek, "2026-W46");
  assert.deepEqual(summary(chart), [{ id: "1", rank: 1, previousRank: null, movement: "new", weeksOnChart: 1, peak: 1 }]);
  assert.equal(calls.length, 0);
});

test("a past week without a later chart is only cached until the current week ends", async () => {
  docs.set("ANIME_2026-W44", savedChart("2026-W44", [entry("1", 1, null, "new", 1, 1)]));

  const response = await get("/api/charts/anime?week=2026-W44");

  assert.equal(response.status, 200);
  assert.equal((await response.json()).nextWeek, null);
  assert.equal(response.headers.get("cache-control"), CURRENT_WEEK_CACHE);
});

test("a past week that was never saved is not found and is not built", async () => {
  const response = await get("/api/charts/anime?week=2026-W45");

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=60");
  assert.equal(calls.length, 0);
  assert.equal(locks.length, 0);
  assert.equal(docs.size, 0);
});

test("future, malformed and nonexistent weeks and unknown types are not found", async () => {
  for (const path of [
    "/api/charts/anime?week=2026-W47",
    "/api/charts/anime?week=2026-W53",
    "/api/charts/anime?week=2025-W53",
    "/api/charts/anime?week=2026-W00",
    "/api/charts/anime?week=2026-46",
    "/api/charts/movie",
  ]) {
    const response = await get(path);

    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("cache-control"), "public, s-maxage=60");
  }

  assert.equal(calls.length, 0);
  assert.equal(docs.size, 0);
});

test("when another request saves the chart first, its saved chart is returned", async () => {
  const winner = savedChart("2026-W46", [entry("9", 1, null, "new", 1, 1)]);
  trending = async () => {
    docs.set("ANIME_2026-W46", winner);
    return [media("1")];
  };

  const response = await get("/api/charts/anime");

  assert.equal(response.status, 200);
  assert.deepEqual(summary(await response.json()), [
    { id: "9", rank: 1, previousRank: null, movement: "new", weeksOnChart: 1, peak: 1 },
  ]);
  assert.equal(docs.get("ANIME_2026-W46"), winner);
});

test("requests that don't get the build lock wait for the saved chart instead of asking the provider", async () => {
  lock = async () => false;

  const building = await get("/api/charts/anime");

  assert.equal(building.status, 502);
  assert.equal(building.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 0);
  assert.equal(docs.size, 0);

  const winner = savedChart("2026-W46", [entry("9", 1, null, "new", 1, 1)]);
  lock = async () => {
    docs.set("ANIME_2026-W46", winner);
    return false;
  };

  const built = await get("/api/charts/anime");

  assert.equal(built.status, 200);
  assert.equal(built.headers.get("cache-control"), CURRENT_WEEK_CACHE);
  assert.deepEqual(summary(await built.json()).map((row) => row.id), ["9"]);
  assert.equal(calls.length, 0);
});

test("a chart that finishes building after its week has ended is returned but not saved", async () => {
  trending = async () => {
    mock.timers.setTime(Date.parse("2026-11-16T00:00:00.000Z"));
    return [media("1")];
  };

  const response = await get("/api/charts/anime");
  const chart = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=60");
  assert.equal(chart.week, "2026-W46");
  assert.deepEqual(summary(chart).map((row) => row.id), ["1"]);
  assert.equal(docs.size, 0);
});

test("a chart that can't be built is not saved or cached, so a later request tries again", async () => {
  for (const failing of [async () => { throw new Error("provider down"); }, async () => []]) {
    trending = failing;

    const response = await get("/api/charts/anime");

    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "Failed to load chart" });
    assert.equal(docs.size, 0);
  }

  trending = async () => [media("1")];

  assert.equal((await get("/api/charts/anime")).status, 200);
  assert.ok(docs.has("ANIME_2026-W46"));
});

test("rate limited requests stop before loading the chart", async () => {
  limited = new Response(null, { status: 429 });

  assert.equal((await get("/api/charts/anime")).status, 429);
  assert.equal(calls.length, 0);
  assert.equal(docs.size, 0);
});
