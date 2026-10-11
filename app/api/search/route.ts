import type { NextRequest } from "next/server";
import { CACHE_LONG, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { errorMessage } from "@/lib/http";
import { searchAniList } from "@/lib/providers/anilist";
import { searchIgdb } from "@/lib/providers/igdb";
import type { Media, MediaSegment } from "@/lib/types";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_QUERY_LENGTH = 100;

function parseLimit(value: string | null): number {
  const limit = Number.parseInt(value ?? "", 10);

  if (Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) {
    return json(
      { error: `q is required and must be at most ${MAX_QUERY_LENGTH} characters` },
      CACHE_NONE,
      400,
    );
  }

  const limit = parseLimit(searchParams.get("limit"));

  const searches: Record<MediaSegment, Promise<Media[]>> = {
    anime: searchAniList(query, "ANIME", limit),
    manga: searchAniList(query, "MANGA", limit),
    game: searchIgdb(query, limit),
  };

  const segments = Object.keys(searches) as MediaSegment[];
  const settled = await Promise.allSettled(Object.values(searches));

  const results = {} as Record<MediaSegment, Media[]>;
  const errors: Partial<Record<MediaSegment, string>> = {};

  settled.forEach((result, index) => {
    const segment = segments[index];

    if (result.status === "fulfilled") {
      results[segment] = result.value;
    } else {
      results[segment] = [];
      errors[segment] = "Search failed";
      console.error(`Search failed for ${segment}: ${errorMessage(result.reason)}`);
    }
  });

  const hasErrors = Object.keys(errors).length > 0;

  return json(
    { query, results, ...(hasErrors && { errors }) },
    hasErrors ? CACHE_SHORT : CACHE_LONG,
  );
}
