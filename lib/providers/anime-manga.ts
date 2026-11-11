import { fetchJson, NotFoundError } from "@/lib/http";
import {
  malSource,
  mediaId,
  type DatePrecision,
  type ListName,
  type Media,
  type SeasonPeriod,
} from "@/lib/types";

const PAGE_SIZE = 50;

type AnimeMangaType = "ANIME" | "MANGA";

const MEDIA_FIELDS = `
  idMal
  title { romaji english native }
  synonyms
  description(asHtml: false)
  coverImage { extraLarge large }
  bannerImage
  format
  status
  season
  seasonYear
  startDate { year month day }
  endDate { year month day }
  genres
  averageScore
  isAdult
  episodes
  duration
  chapters
  volumes
  studios(isMain: true) { nodes { name } }
  staff(perPage: 10) { edges { role node { name { full } } } }
`;

function searchQuery(allowAdult: boolean): string {
  const adultFilter = allowAdult ? "" : ", isAdult: false";

  return `
    query ($search: String, $type: MediaType, $perPage: Int) {
      Page(perPage: $perPage) {
        media(search: $search, type: $type, sort: SEARCH_MATCH${adultFilter}) { ${MEDIA_FIELDS} }
      }
    }
  `;
}

function listQuery(allowAdult: boolean): string {
  const adultFilter = allowAdult ? "" : ", isAdult: false";

  return `
    query (
      $type: MediaType
      $perPage: Int
      $sort: [MediaSort]
      $season: MediaSeason
      $seasonYear: Int
      $status: MediaStatus
      $startDate: FuzzyDateInt
      $endDate: FuzzyDateInt
    ) {
      Page(perPage: $perPage) {
        media(
          type: $type
          sort: $sort
          season: $season
          seasonYear: $seasonYear
          status: $status
          startDate_greater: $startDate
          startDate_lesser: $endDate${adultFilter}
        ) { ${MEDIA_FIELDS} }
      }
    }
  `;
}

const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;
const NEW_SERIES_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function fuzzyDate(date: Date): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function fuzzyMonth(date: Date): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100;
}

function listVariables(list: ListName, type: AnimeMangaType, now: Date): Record<string, unknown> {
  switch (list) {
    case "trending":
      return { sort: ["TRENDING_DESC", "POPULARITY_DESC"] };
    case "top":
      return { sort: ["SCORE_DESC", "POPULARITY_DESC"] };
    case "upcoming":
      return { status: "NOT_YET_RELEASED", sort: ["POPULARITY_DESC"] };
    case "season":
      return type === "ANIME"
        ? {
            season: SEASONS[Math.floor(now.getUTCMonth() / 3)],
            seasonYear: now.getUTCFullYear(),
            sort: ["POPULARITY_DESC"],
          }
        : {
            status: "RELEASING",
            startDate: fuzzyDate(new Date(now.getTime() - NEW_SERIES_DAYS * 24 * 60 * 60 * 1000)),
            sort: ["POPULARITY_DESC"],
          };
  }
}

const MEDIA_QUERY = `
  query ($id: Int, $type: MediaType) {
    Media(idMal: $id, type: $type) { ${MEDIA_FIELDS} }
  }
`;

interface ProviderDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface ProviderMedia {
  idMal: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  synonyms: string[];
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
  description: string | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: ProviderDate;
  endDate: ProviderDate;
  genres: string[];
  averageScore: number | null;
  isAdult: boolean;
  episodes: number | null;
  duration: number | null;
  chapters: number | null;
  volumes: number | null;
  studios: { nodes: { name: string }[] } | null;
  staff: { edges: { role: string; node: { name: { full: string } } }[] } | null;
}

function apiUrl(): string {
  const url = process.env.ANIME_MANGA_API_URL;

  if (!url) {
    throw new Error("ANIME_MANGA_API_URL must be set");
  }

  return url;
}

async function queryApi<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetchJson<{ data: T | null }>(apiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.data) {
    throw new Error("The anime and manga API returned no data");
  }

  return response.data;
}

function toIsoDate(date: ProviderDate): string | null {
  if (!date.year) {
    return null;
  }

  return new Date(Date.UTC(date.year, (date.month ?? 1) - 1, date.day ?? 1)).toISOString();
}

function datePrecision(date: ProviderDate): DatePrecision | null {
  if (!date.year) {
    return null;
  }

  return date.day ? "day" : date.month ? "month" : "year";
}

function normalize(media: ProviderMedia, malId: number, type: AnimeMangaType): Media {
  const title = media.title.romaji ?? media.title.english ?? media.title.native ?? "";
  const altTitles = [media.title.english, media.title.native, ...media.synonyms].filter(
    (alt): alt is string => Boolean(alt) && alt !== title,
  );

  const base = {
    id: mediaId(type, malId),
    type,
    sourceId: String(malId),
    title,
    altTitles: [...new Set(altTitles)],
    synopsis: media.description?.replace(/<[^>]+>/g, "").trim() || null,
    coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    bannerImage: media.bannerImage,
    year: media.seasonYear ?? media.startDate.year,
    status: media.status,
    genres: media.genres,
    score: media.averageScore !== null ? media.averageScore / 10 : null,
    isAdult: media.isAdult,
    source: malSource(type, malId),
  };

  if (type === "ANIME") {
    return {
      ...base,
      details: {
        format: media.format,
        episodes: media.episodes,
        duration: media.duration !== null ? `${media.duration} min per ep` : null,
        season: media.season?.toLowerCase() ?? null,
        studios: (media.studios?.nodes ?? []).map((studio) => studio.name),
        airedFrom: toIsoDate(media.startDate),
        airedFromPrecision: datePrecision(media.startDate),
        airedTo: toIsoDate(media.endDate),
      },
    };
  }

  return {
    ...base,
    details: {
      format: media.format,
      chapters: media.chapters,
      volumes: media.volumes,
      authors: [
        ...new Set(
          (media.staff?.edges ?? [])
            .filter((edge) => /story|art/i.test(edge.role))
            .map((edge) => edge.node.name.full),
        ),
      ],
      publishedFrom: toIsoDate(media.startDate),
      publishedFromPrecision: datePrecision(media.startDate),
      publishedTo: toIsoDate(media.endDate),
    },
  };
}

function withMalIds(media: ProviderMedia[], type: AnimeMangaType, limit: number): Media[] {
  return media
    .flatMap((item) => (item.idMal === null ? [] : [normalize(item, item.idMal, type)]))
    .slice(0, limit);
}

export async function searchAnimeManga(
  query: string,
  type: AnimeMangaType,
  limit: number,
  allowAdult: boolean,
): Promise<Media[]> {
  const data = await queryApi<{ Page: { media: ProviderMedia[] } }>(searchQuery(allowAdult), {
    search: query,
    type,
    perPage: PAGE_SIZE,
  });

  return withMalIds(data.Page.media, type, limit);
}

export async function listAnimeManga(
  type: AnimeMangaType,
  list: ListName,
  limit: number,
  allowAdult: boolean,
  status?: "RELEASING",
): Promise<Media[]> {
  const data = await queryApi<{ Page: { media: ProviderMedia[] } }>(listQuery(allowAdult), {
    type,
    perPage: PAGE_SIZE,
    ...listVariables(list, type, new Date()),
    ...(status ? { status } : {}),
  });

  return withMalIds(data.Page.media, type, limit);
}

export async function seasonAnimeManga(
  type: AnimeMangaType,
  period: SeasonPeriod,
  limit: number,
  allowAdult: boolean,
): Promise<Media[]> {
  const variables =
    type === "ANIME"
      ? { season: period.season.toUpperCase(), seasonYear: period.year }
      : {
          startDate: fuzzyDate(new Date(period.startsAt.getTime() - DAY_MS)),
          endDate: fuzzyMonth(period.endsAt),
        };
  const data = await queryApi<{ Page: { media: ProviderMedia[] } }>(listQuery(allowAdult), {
    type,
    perPage: PAGE_SIZE,
    sort: ["POPULARITY_DESC"],
    ...variables,
  });

  return withMalIds(data.Page.media, type, limit);
}

export async function getAnimeManga(id: string, type: AnimeMangaType): Promise<Media> {
  const data = await queryApi<{ Media: ProviderMedia | null }>(MEDIA_QUERY, {
    id: Number(id),
    type,
  });

  if (!data.Media?.idMal) {
    throw new NotFoundError(`${type} with MyAnimeList id ${id} not found`);
  }

  return normalize(data.Media, data.Media.idMal, type);
}
