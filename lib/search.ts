import { errorMessage } from "@/lib/http";
import { searchAniList } from "@/lib/providers/anilist";
import { searchIgdb } from "@/lib/providers/igdb";
import type { Media, MediaSegment } from "@/lib/types";

export interface SearchResults {
  results: Record<MediaSegment, Media[]>;
  errors: Partial<Record<MediaSegment, string>>;
}

export async function searchAll(
  query: string,
  limit: number,
  allowAdult: boolean,
): Promise<SearchResults> {
  const searches: Record<MediaSegment, Promise<Media[]>> = {
    anime: searchAniList(query, "ANIME", limit, allowAdult),
    manga: searchAniList(query, "MANGA", limit, allowAdult),
    game: searchIgdb(query, limit, allowAdult),
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

  return { results, errors };
}
