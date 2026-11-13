import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { NotFoundError } from "@/lib/http";

process.env.ANIME_MANGA_API_URL = "https://anime-manga.test/graphql";

const { getAnimeManga, listAnimeManga, scheduleAnime, searchAnimeManga, seasonAnimeManga } = await import(
  "@/lib/providers/anime-manga"
);

const anime = {
  id: 154587,
  idMal: 52991,
  title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey's End", native: "葬送のフリーレン" },
  synonyms: ["Frieren: Beyond Journey's End"],
  coverImage: { extraLarge: "https://images.test/cover.png", large: null },
  bannerImage: "https://images.test/banner.jpg",
  description: "An elf mage<br><br>keeps <i>travelling</i>.",
  format: "TV",
  status: "FINISHED",
  season: "FALL",
  seasonYear: 2023,
  startDate: { year: 2023, month: 9, day: 29 },
  endDate: { year: 2024, month: 3, day: 22 },
  genres: ["Adventure", "Drama"],
  averageScore: 91,
  isAdult: false,
  episodes: 28,
  duration: 24,
  chapters: null,
  volumes: null,
  studios: { nodes: [{ name: "MADHOUSE" }] },
  staff: { edges: [] },
};

function mockApi(data) {
  return mock.method(globalThis, "fetch", async () => Response.json({ data }));
}

test.afterEach(() => mock.restoreAll());

test("search normalizes anime and manga into the shared schema", async () => {
  mockApi({ Page: { media: [anime] } });

  const [media] = await searchAnimeManga("frieren", "ANIME", 5, false);

  assert.equal(media.id, "ANIME_52991");
  assert.equal(media.sourceId, "52991");
  assert.equal(media.title, "Sousou no Frieren");
  assert.deepEqual(media.altTitles, ["Frieren: Beyond Journey's End", "葬送のフリーレン"]);
  assert.equal(media.synopsis, "An elf magekeeps travelling.");
  assert.equal(media.score, 9.1);
  assert.equal(media.year, 2023);
  assert.equal(media.isAdult, false);
  assert.equal(media.coverImage, "https://images.test/cover.png");
  assert.deepEqual(media.source, {
    provider: "myanimelist",
    url: "https://myanimelist.net/anime/52991",
  });
  assert.deepEqual(media.details, {
    format: "TV",
    episodes: 28,
    duration: "24 min per ep",
    season: "fall",
    studios: ["MADHOUSE"],
    airedFrom: "2023-09-29T00:00:00.000Z",
    airedFromPrecision: "day",
    airedTo: "2024-03-22T00:00:00.000Z",
  });
});

test("start dates say how precise they are", async () => {
  mockApi({
    Page: {
      media: [
        { ...anime, startDate: { year: 2027, month: 1, day: null } },
        { ...anime, idMal: 2, startDate: { year: 2027, month: null, day: null } },
        { ...anime, idMal: 3, startDate: { year: null, month: null, day: null } },
      ],
    },
  });

  const items = await listAnimeManga("ANIME", "upcoming", 20, false);

  assert.deepEqual(
    items.map((media) => [media.details.airedFrom, media.details.airedFromPrecision]),
    [
      ["2027-01-01T00:00:00.000Z", "month"],
      ["2027-01-01T00:00:00.000Z", "year"],
      [null, null],
    ],
  );
});

const winter = {
  season: "winter",
  year: 2027,
  startsAt: new Date("2027-01-01T00:00:00.000Z"),
  endsAt: new Date("2027-04-01T00:00:00.000Z"),
};

test("an anime season is looked up by season and year", async () => {
  const fetch = mockApi({ Page: { media: [anime] } });

  const items = await seasonAnimeManga("ANIME", winter, 20, false);

  const { variables } = JSON.parse(fetch.mock.calls[0].arguments[1].body);
  assert.equal(variables.season, "WINTER");
  assert.equal(variables.seasonYear, 2027);
  assert.deepEqual(variables.sort, ["POPULARITY_DESC"]);
  assert.equal(variables.startDate, undefined);
  assert.deepEqual(items.map((media) => media.sourceId), ["52991"]);
});

test("a manga season covers titles that start within its months", async () => {
  const fetch = mockApi({ Page: { media: [] } });

  await seasonAnimeManga("MANGA", winter, 20, false);

  const { query, variables } = JSON.parse(fetch.mock.calls[0].arguments[1].body);
  assert.match(query, /startDate_greater: \$startDate/);
  assert.match(query, /startDate_lesser: \$endDate/);
  assert.equal(variables.startDate, 20261231);
  assert.equal(variables.endDate, 20270400);
  assert.equal(variables.season, undefined);
  assert.deepEqual(variables.sort, ["POPULARITY_DESC"]);
});

test("titles without a MyAnimeList id are left out of search and lists", async () => {
  const withoutMal = { ...anime, id: 1, idMal: null };
  const fetch = mockApi({
    Page: { media: [withoutMal, anime, { ...anime, id: 2, idMal: 3 }, { ...anime, id: 4, idMal: 5 }] },
  });

  const search = await searchAnimeManga("frieren", "ANIME", 2, false);
  const list = await listAnimeManga("ANIME", "top", 2, false);

  assert.deepEqual(search.map((media) => media.sourceId), ["52991", "3"]);
  assert.deepEqual(list.map((media) => media.sourceId), ["52991", "3"]);
  for (const call of fetch.mock.calls) {
    assert.equal(JSON.parse(call.arguments[1].body).variables.perPage, 50);
  }
});

test("the trending list can be limited to titles that are currently releasing", async () => {
  const fetch = mockApi({ Page: { media: [anime] } });

  await listAnimeManga("MANGA", "trending", 20, false, "RELEASING");
  await listAnimeManga("MANGA", "trending", 20, false);

  const [releasing, trending] = fetch.mock.calls.map(
    (call) => JSON.parse(call.arguments[1].body).variables,
  );
  assert.equal(releasing.status, "RELEASING");
  assert.deepEqual(releasing.sort, ["TRENDING_DESC", "POPULARITY_DESC"]);
  assert.equal(trending.status, undefined);
  assert.deepEqual(trending.sort, ["TRENDING_DESC", "POPULARITY_DESC"]);
});

test("profiles are looked up by MyAnimeList id", async () => {
  const fetch = mockApi({ Media: anime });

  const media = await getAnimeManga("52991", "ANIME");

  const body = JSON.parse(fetch.mock.calls[0].arguments[1].body);
  assert.match(body.query, /Media\(idMal: \$id, type: \$type\)/);
  assert.deepEqual(body.variables, { id: 52991, type: "ANIME" });
  assert.equal(media.id, "ANIME_52991");
  assert.equal(media.source.url, "https://myanimelist.net/anime/52991");
  assert.equal(String(fetch.mock.calls[0].arguments[0]), "https://anime-manga.test/graphql");
});

test("search excludes adult titles unless they are allowed", async () => {
  const fetch = mockApi({ Page: { media: [] } });

  await searchAnimeManga("frieren", "ANIME", 5, false);
  await searchAnimeManga("frieren", "ANIME", 5, true);

  const [safe, adult] = fetch.mock.calls.map((call) => JSON.parse(call.arguments[1].body).query);
  assert.match(safe, /isAdult: false/);
  assert.doesNotMatch(adult, /isAdult: false/);
});

test("manga authors are listed once even with both story and art roles", async () => {
  mockApi({
    Media: {
      ...anime,
      format: "MANGA",
      chapters: 140,
      volumes: 14,
      staff: {
        edges: [
          { role: "Story", node: { name: { full: "Kanehito Yamada" } } },
          { role: "Art", node: { name: { full: "Tsukasa Abe" } } },
          { role: "Story & Art", node: { name: { full: "Tsukasa Abe" } } },
          { role: "Editing", node: { name: { full: "Someone Else" } } },
        ],
      },
    },
  });

  const media = await getAnimeManga("52991", "MANGA");

  assert.equal(media.id, "MANGA_52991");
  assert.equal(media.source.url, "https://myanimelist.net/manga/52991");
  assert.deepEqual(media.details.authors, ["Kanehito Yamada", "Tsukasa Abe"]);
  assert.equal(media.details.chapters, 140);
  assert.equal(media.details.publishedFromPrecision, "day");
});

test("a missing title is reported as not found", async () => {
  mockApi({ Media: null });

  await assert.rejects(getAnimeManga("999999999", "ANIME"), NotFoundError);
});

test("a missing API address is reported", async () => {
  const url = process.env.ANIME_MANGA_API_URL;
  delete process.env.ANIME_MANGA_API_URL;

  try {
    await assert.rejects(getAnimeManga("52991", "ANIME"), /ANIME_MANGA_API_URL must be set/);
  } finally {
    process.env.ANIME_MANGA_API_URL = url;
  }
});

test("the schedule maps provider ids back to external ids and pages through episodes", async () => {
  const bodies = [];
  const responses = [
    { Page: { media: [{ id: 154587, idMal: 52991 }, { id: 7, idMal: null }] } },
    {
      Page: {
        pageInfo: { hasNextPage: true },
        airingSchedules: [{ mediaId: 154587, episode: 1, airingAt: 1763300000 }],
      },
    },
    {
      Page: {
        pageInfo: { hasNextPage: false },
        airingSchedules: [{ mediaId: 154587, episode: 2, airingAt: 1763904800 }],
      },
    },
  ];
  mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return Response.json({ data: responses.shift() });
  });

  const episodes = await scheduleAnime(
    ["52991"],
    new Date("2026-10-31T00:00:00.000Z"),
    new Date("2026-12-02T00:00:00.000Z"),
    false,
  );

  assert.deepEqual(episodes, [
    { id: "52991", episode: 1, airsAt: new Date(1763300000 * 1000).toISOString() },
    { id: "52991", episode: 2, airsAt: new Date(1763904800 * 1000).toISOString() },
  ]);
  assert.match(bodies[0].query, /isAdult: false/);
  assert.deepEqual(bodies[0].variables.ids, [52991]);
  assert.deepEqual(bodies[1].variables.mediaIds, [154587]);
  assert.equal(bodies[2].variables.page, 2);
});

test("the schedule skips the episode query when no ids are found", async () => {
  const fetch = mockApi({ Page: { media: [] } });

  assert.deepEqual(await scheduleAnime(["1"], new Date(), new Date(), true), []);
  assert.equal(fetch.mock.callCount(), 1);
});
