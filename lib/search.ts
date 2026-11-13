import { REDIS_TTL_SECONDS } from "@/lib/cache";
import { errorMessage } from "@/lib/http";
import { inFlight } from "@/lib/in-flight";
import { searchAnimeManga } from "@/lib/providers/anime-manga";
import { searchIgdb } from "@/lib/providers/igdb";
import { getCached, setCached } from "@/lib/redis";
import { hasCurrentSource, type Media, type MediaSegment } from "@/lib/types";

const SEGMENTS: MediaSegment[] = ["anime", "manga", "game"];

export interface SearchResults {
  results: Record<MediaSegment, Media[]>;
  errors: Partial<Record<MediaSegment, string>>;
}

function searchSegment(
  segment: MediaSegment,
  query: string,
  limit: number,
  allowAdult: boolean,
): Promise<Media[]> {
  if (segment === "game") {
    return searchIgdb(query, limit, allowAdult);
  }

  return searchAnimeManga(query, segment === "anime" ? "ANIME" : "MANGA", limit, allowAdult);
}

function cacheKey(segment: MediaSegment, query: string, limit: number, allowAdult: boolean): string {
  return `search:${allowAdult ? "adult" : "safe"}:${limit}:${segment}:${query.toLowerCase()}`;
}

function searchAndCache(
  segment: MediaSegment,
  query: string,
  limit: number,
  allowAdult: boolean,
): Promise<Media[]> {
  const key = cacheKey(segment, query, limit, allowAdult);

  return inFlight(key, async () => {
    const results = await searchSegment(segment, query, limit, allowAdult);

    await setCached([[key, results]], REDIS_TTL_SECONDS);

    return results;
  });
}

export async function searchAll(
  query: string,
  limit: number,
  allowAdult: boolean,
): Promise<SearchResults> {
  const cached = await getCached<Media[]>(
    SEGMENTS.map((segment) => cacheKey(segment, query, limit, allowAdult)),
  );
  const settled = await Promise.allSettled(
    SEGMENTS.map((segment, index) => {
      const hit = cached[index];

      return hit && hit.every(hasCurrentSource)
        ? Promise.resolve(hit)
        : searchAndCache(segment, query, limit, allowAdult);
    }),
  );

  const results = {} as Record<MediaSegment, Media[]>;
  const errors: Partial<Record<MediaSegment, string>> = {};

  settled.forEach((result, index) => {
    const segment = SEGMENTS[index];

    if (result.status === "fulfilled") {
      results[segment] = result.value;
    } else {
      results[segment] = [];
      errors[segment] = "Search failed";
      console.error(`Search failed for ${segment}: ${errorMessage(result.reason)}`);
    }
  });

  return { results, errors };
}
