import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { NotFoundError } from "@/lib/http";

process.env.ANIME_MANGA_API_URL = "https://anime-manga.test/graphql";

const { getAnimeManga, listAnimeManga, searchAnimeManga } = await import("@/lib/providers/anime-manga");

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
    airedTo: "2024-03-22T00:00:00.000Z",
  });
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
