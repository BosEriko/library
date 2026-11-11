import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";

const docs = new Map();
const calls = [];
let fetched = [];
let failure = null;

mock.module("@/lib/firebase", {
  namedExports: {
    getDb: () => ({
      collection: (name) => ({
        doc: (id) => ({
          get: async () => ({ exists: docs.has(`${name}/${id}`), data: () => docs.get(`${name}/${id}`) }),
          set: async (data) => docs.set(`${name}/${id}`, data),
        }),
      }),
    }),
  },
});

function provider(name) {
  return async (...args) => {
    calls.push([name, ...args]);
    if (failure) throw failure;
    return fetched;
  };
}

mock.module("@/lib/providers/anime-manga", {
  namedExports: { listAnimeManga: provider("listAnimeManga"), seasonAnimeManga: provider("seasonAnimeManga") },
});
mock.module("@/lib/providers/igdb", {
  namedExports: { listIgdb: provider("listIgdb"), seasonIgdb: provider("seasonIgdb") },
});
mock.module("@/lib/media", {
  namedExports: {
    saveMediaItems: async (items) =>
      items.map((item) => ({ ...item, coverImage: `https://bucket/media/${item.id}/cover.webp` })),
  },
});

const { currentSeason, getOrFetchSeason, toSeasonPeriod } = await import("@/lib/seasons");

const now = new Date("2026-11-11T12:00:00.000Z");

function item(id, type = "ANIME") {
  return { id: `${type}_${id}`, type, sourceId: id, title: id, source: { provider: type === "GAME" ? "igdb" : "myanimelist" } };
}

function savedSeason(items, updatedAt = Timestamp.now()) {
  return { type: "ANIME", season: "winter", year: 2027, adult: false, items, updatedAt };
}

test.beforeEach(() => {
  docs.clear();
  calls.length = 0;
  fetched = [item("61338")];
  failure = null;
});

test("seasons follow the calendar in UTC", () => {
  assert.deepEqual(currentSeason(now), {
    season: "fall",
    year: 2026,
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T00:00:00.000Z"),
  });
  assert.equal(currentSeason(new Date("2026-12-31T23:59:59.999Z")).season, "fall");
  assert.deepEqual(currentSeason(new Date("2027-01-01T00:00:00.000Z")), {
    season: "winter",
    year: 2027,
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-04-01T00:00:00.000Z"),
  });
});

test("only the previous, current and next season are available", () => {
  assert.equal(toSeasonPeriod("2026-summer", now)?.season, "summer");
  assert.equal(toSeasonPeriod("2026-fall", now)?.season, "fall");
  assert.deepEqual(toSeasonPeriod("2027-winter", now), {
    season: "winter",
    year: 2027,
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-04-01T00:00:00.000Z"),
  });
  assert.equal(toSeasonPeriod("2026-spring", now), null);
  assert.equal(toSeasonPeriod("2027-spring", now), null);
  assert.equal(toSeasonPeriod("2025-fall", now), null);
});

test("anything that isn't a year and season is not found", () => {
  for (const value of ["2027-autumn", "27-winter", "2027-Winter", "2027-winter-1", "winter", ""]) {
    assert.equal(toSeasonPeriod(value, now), null, value);
  }
});

test("a season is fetched, saved by type and season, and returned with its dates", async () => {
  const winter = toSeasonPeriod("2027-winter", now);

  const { season, stale } = await getOrFetchSeason("ANIME", winter, false);

  assert.equal(stale, false);
  assert.deepEqual(calls, [["seasonAnimeManga", "ANIME", winter, 20, false]]);
  assert.equal(season.type, "ANIME");
  assert.equal(season.season, "winter");
  assert.equal(season.year, 2027);
  assert.equal(season.startsAt, "2027-01-01T00:00:00.000Z");
  assert.equal(season.endsAt, "2027-04-01T00:00:00.000Z");
  assert.equal(season.items[0].coverImage, "https://bucket/media/ANIME_61338/cover.webp");
  assert.deepEqual(docs.get("seasons/ANIME_2027-winter").items, season.items);
});

test("games come from the game provider, and adult seasons are saved separately", async () => {
  fetched = [item("1", "GAME")];
  const winter = toSeasonPeriod("2027-winter", now);

  await getOrFetchSeason("GAME", winter, true);

  assert.deepEqual(calls, [["seasonIgdb", winter, 20, true]]);
  assert.ok(docs.has("seasons/GAME_2027-winter_adult"));
});

test("a saved season is returned until it's a day old", async () => {
  docs.set("seasons/ANIME_2027-winter", savedSeason([item("21")]));

  const { season } = await getOrFetchSeason("ANIME", toSeasonPeriod("2027-winter", now), false);

  assert.deepEqual(season.items.map((media) => media.sourceId), ["21"]);
  assert.deepEqual(calls, []);
});

test("an old season is rebuilt, and kept if the provider fails", async () => {
  const old = Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000);
  docs.set("seasons/ANIME_2027-winter", savedSeason([item("21")], old));
  const winter = toSeasonPeriod("2027-winter", now);

  failure = new Error("provider down");
  const kept = await getOrFetchSeason("ANIME", winter, false);

  assert.equal(kept.stale, true);
  assert.deepEqual(kept.season.items.map((media) => media.sourceId), ["21"]);

  failure = null;
  const rebuilt = await getOrFetchSeason("ANIME", winter, false);

  assert.equal(rebuilt.stale, false);
  assert.deepEqual(rebuilt.season.items.map((media) => media.sourceId), ["61338"]);
});

test("a provider failure with nothing saved is reported", async () => {
  failure = new Error("provider down");

  await assert.rejects(getOrFetchSeason("ANIME", toSeasonPeriod("2027-winter", now), false), /provider down/);
});
