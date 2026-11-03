import test, { mock } from "node:test";
import assert from "node:assert/strict";

const calls = [];
let load = async () => ({});
let limited = null;

mock.module("@/lib/media", {
  namedExports: {
    getOrFetchMedia: async (...args) => {
      calls.push(args);
      return load(...args);
    },
  },
});
mock.module("@/lib/rate-limit", {
  namedExports: {
    rateLimit: async (_request, scope) => {
      calls.push(["limit", scope]);
      return limited;
    },
  },
});

const { GET } = await import("@/app/api/[type]/[id]/[image]/route");
const { AdultContentError, NotFoundError } = await import("@/lib/http");

const COVER = "https://bucket/media/ANIME_21/cover-new.webp";
const BANNER = "https://bucket/media/ANIME_21/banner-new.webp";

function get(path) {
  const url = new URL(`https://library.boseriko.com${path}`);
  const [, , type, id, image] = url.pathname.split("/");
  return GET({ nextUrl: url, headers: new Headers() }, { params: Promise.resolve({ type, id, image }) });
}

test.beforeEach(() => {
  calls.length = 0;
  limited = null;
  load = async () => ({ coverImage: COVER, bannerImage: BANNER });
});

test("the cover redirects to the current cover image", async () => {
  const response = await get("/api/anime/21/cover");

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), COVER);
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.deepEqual(calls, [["limit", "image"], ["ANIME", "21", false]]);
});

test("the banner redirects to the current banner image", async () => {
  const response = await get("/api/anime/21/banner");

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), BANNER);
});

test("adult=true is passed on", async () => {
  await get("/api/manga/7/cover?adult=true");

  assert.deepEqual(calls.at(-1), ["MANGA", "7", true]);
});

test("a title without that image is not found", async () => {
  load = async () => ({ coverImage: COVER, bannerImage: null });

  const response = await get("/api/anime/21/banner");

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=60");
});

test("unknown images, types and ids are not found without loading anything", async () => {
  for (const path of ["/api/anime/21/poster", "/api/movie/21/cover", "/api/anime/abc/cover"]) {
    assert.equal((await get(path)).status, 404);
  }

  assert.deepEqual(calls.filter((call) => call[0] !== "limit"), []);
});

test("missing titles are not found", async () => {
  load = async () => {
    throw new NotFoundError("gone");
  };

  assert.equal((await get("/api/anime/21/cover")).status, 404);
});

test("adult titles without adult=true are refused", async () => {
  load = async () => {
    throw new AdultContentError("adult");
  };

  const response = await get("/api/anime/21/cover");

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Adult content" });
});

test("provider failures are not cached", async () => {
  load = async () => {
    throw new Error("provider down");
  };
  mock.method(console, "error", () => {});

  const response = await get("/api/anime/21/cover");

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rate limited requests stop before loading the title", async () => {
  limited = new Response(null, { status: 429 });

  assert.equal((await get("/api/anime/21/cover")).status, 429);
  assert.deepEqual(calls, [["limit", "image"]]);
});
