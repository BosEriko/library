import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { getAniList, listAniList, searchAniList } from "@/lib/providers/anilist";
import { NotFoundError } from "@/lib/http";

const anime = {
  id: 154587,
  idMal: 52991,
  siteUrl: "https://anilist.co/anime/154587",
  title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey's End", native: "葬送のフリーレン" },
  synonyms: ["Frieren: Beyond Journey's End"],
  coverImage: { extraLarge: "https://s4.anilist.co/cover.png", large: null },
  bannerImage: "https://s4.anilist.co/banner.jpg",
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

function mockAniList(data) {
  return mock.method(globalThis, "fetch", async () => Response.json({ data }));
}

test.afterEach(() => mock.restoreAll());

test("search normalizes AniList media into the shared schema", async () => {
  mockAniList({ Page: { media: [anime] } });

  const [media] = await searchAniList("frieren", "ANIME", 5, false);

  assert.equal(media.id, "ANIME_52991");
  assert.equal(media.sourceId, "52991");
  assert.equal(media.title, "Sousou no Frieren");
  assert.deepEqual(media.altTitles, ["Frieren: Beyond Journey's End", "葬送のフリーレン"]);
  assert.equal(media.synopsis, "An elf magekeeps travelling.");
  assert.equal(media.score, 9.1);
  assert.equal(media.year, 2023);
  assert.equal(media.isAdult, false);
  assert.equal(media.coverImage, "https://s4.anilist.co/cover.png");
  assert.deepEqual(media.details, {
    anilistId: 154587,
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
  const fetch = mockAniList({
    Page: { media: [withoutMal, anime, { ...anime, id: 2, idMal: 3 }, { ...anime, id: 4, idMal: 5 }] },
  });

  const search = await searchAniList("frieren", "ANIME", 2, false);
  const list = await listAniList("ANIME", "top", 2, false);

  assert.deepEqual(search.map((media) => media.sourceId), ["52991", "3"]);
  assert.deepEqual(list.map((media) => media.sourceId), ["52991", "3"]);
  for (const call of fetch.mock.calls) {
    assert.equal(JSON.parse(call.arguments[1].body).variables.perPage, 50);
  }
});

test("profiles are looked up by MyAnimeList id", async () => {
  const fetch = mockAniList({ Media: anime });

  const media = await getAniList("52991", "ANIME");

  const body = JSON.parse(fetch.mock.calls[0].arguments[1].body);
  assert.match(body.query, /Media\(idMal: \$id, type: \$type\)/);
  assert.deepEqual(body.variables, { id: 52991, type: "ANIME" });
  assert.equal(media.id, "ANIME_52991");
  assert.equal(media.details.anilistId, 154587);
});

test("search excludes adult titles unless they are allowed", async () => {
  const fetch = mockAniList({ Page: { media: [] } });

  await searchAniList("frieren", "ANIME", 5, false);
  await searchAniList("frieren", "ANIME", 5, true);

  const [safe, adult] = fetch.mock.calls.map((call) => JSON.parse(call.arguments[1].body).query);
  assert.match(safe, /isAdult: false/);
  assert.doesNotMatch(adult, /isAdult: false/);
});

test("manga authors are listed once even with both story and art roles", async () => {
  mockAniList({
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

  const media = await getAniList("52991", "MANGA");

  assert.equal(media.id, "MANGA_52991");
  assert.deepEqual(media.details.authors, ["Kanehito Yamada", "Tsukasa Abe"]);
  assert.equal(media.details.chapters, 140);
});

test("a missing title is reported as not found", async () => {
  mockAniList({ Media: null });

  await assert.rejects(getAniList("999999999", "ANIME"), NotFoundError);
});
