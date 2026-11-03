import test, { mock } from "node:test";
import assert from "node:assert/strict";

process.env.IGDB_CLIENT_ID = "test-client";
process.env.IGDB_CLIENT_SECRET = "test-secret";
process.env.IGDB_API_URL = "https://igdb.test/v4";

const { searchIgdb } = await import("@/lib/providers/igdb");

const game = {
  id: 1022,
  name: "The Legend of Zelda",
  cover: { image_id: "co1uii" },
  artworks: [{ image_id: "ar1" }],
  first_release_date: 509328000,
  genres: [{ name: "Adventure" }],
  themes: [{ id: 1, name: "Action" }],
  total_rating: 81.4,
  platforms: [{ name: "Wii" }],
  involved_companies: [{ company: { name: "Nintendo" }, developer: true, publisher: true }],
};

function mockIgdb(games) {
  return mock.method(globalThis, "fetch", async (url) =>
    String(url).includes("id.twitch.tv")
      ? Response.json({ access_token: "token", expires_in: 3600 })
      : Response.json(games),
  );
}

function gameQueries(fetch) {
  return fetch.mock.calls
    .filter((call) => String(call.arguments[0]).endsWith("/games"))
    .map((call) => call.arguments[1].body);
}

test.afterEach(() => mock.restoreAll());

test("search normalizes IGDB games into the shared schema", async () => {
  mockIgdb([game]);

  const [media] = await searchIgdb("zelda", 5, false);

  assert.equal(media.id, "GAME_1022");
  assert.equal(media.score, 8.1);
  assert.equal(media.year, 1986);
  assert.equal(media.isAdult, false);
  assert.equal(media.coverImage, "https://images.igdb.com/igdb/image/upload/t_cover_big/co1uii.jpg");
  assert.equal(media.bannerImage, "https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg");
  assert.deepEqual(media.genres, ["Adventure", "Action"]);
  assert.deepEqual(media.details.developers, ["Nintendo"]);
});

test("games on Steam link to their store page", async () => {
  const fetch = mockIgdb([
    {
      ...game,
      external_games: [
        { uid: "zelda-gog", external_game_source: 5 },
        { uid: "367520", external_game_source: 1 },
      ],
    },
    game,
  ]);

  const [onSteam, notOnSteam] = await searchIgdb("zelda", 5, false);

  assert.match(gameQueries(fetch)[0], /external_games\.uid,external_games\.external_game_source/);
  assert.equal(onSteam.details.steamUrl, "https://store.steampowered.com/app/367520");
  assert.equal(notOnSteam.details.steamUrl, null);
});

test("search excludes the erotic theme unless adult titles are allowed", async () => {
  const fetch = mockIgdb([]);

  await searchIgdb("zelda", 5, false);
  await searchIgdb("zelda", 5, true);

  const [safe, adult] = gameQueries(fetch);
  assert.match(safe, /where themes != \(42\);/);
  assert.doesNotMatch(adult, /themes !=/);
});

test("games with the erotic theme are flagged as adult", async () => {
  mockIgdb([{ ...game, themes: [{ id: 42, name: "Erotic" }] }]);

  const [media] = await searchIgdb("zelda", 5, true);

  assert.equal(media.isAdult, true);
});

test("quotes in the search text are escaped", async () => {
  const fetch = mockIgdb([]);

  await searchIgdb('say "hi"', 5, true);

  assert.match(gameQueries(fetch)[0], /^search "say \\"hi\\"";/);
});
