import { fetchJson, NotFoundError } from "@/lib/http";
import { mediaId, type Media } from "@/lib/types";

const ANILIST_URL = "https://graphql.anilist.co";

type AniListType = "ANIME" | "MANGA";

const MEDIA_FIELDS = `
  id
  idMal
  siteUrl
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
  episodes
  duration
  chapters
  volumes
  studios(isMain: true) { nodes { name } }
  staff(perPage: 10) { edges { role node { name { full } } } }
`;

const SEARCH_QUERY = `
  query ($search: String, $type: MediaType, $perPage: Int) {
    Page(perPage: $perPage) {
      media(search: $search, type: $type, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
    }
  }
`;

const MEDIA_QUERY = `
  query ($id: Int, $type: MediaType) {
    Media(id: $id, type: $type) { ${MEDIA_FIELDS} }
  }
`;

interface AniListDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface AniListMedia {
  id: number;
  idMal: number | null;
  siteUrl: string;
  title: { romaji: string | null; english: string | null; native: string | null };
  synonyms: string[];
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
  description: string | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: AniListDate;
  endDate: AniListDate;
  genres: string[];
  averageScore: number | null;
  episodes: number | null;
  duration: number | null;
  chapters: number | null;
  volumes: number | null;
  studios: { nodes: { name: string }[] } | null;
  staff: { edges: { role: string; node: { name: { full: string } } }[] } | null;
}

async function queryAniList<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetchJson<{ data: T | null }>(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.data) {
    throw new Error("AniList returned no data");
  }

  return response.data;
}

function toIsoDate(date: AniListDate): string | null {
  if (!date.year) {
    return null;
  }

  return new Date(Date.UTC(date.year, (date.month ?? 1) - 1, date.day ?? 1)).toISOString();
}

function normalize(media: AniListMedia, type: AniListType): Media {
  const title = media.title.romaji ?? media.title.english ?? media.title.native ?? "";
  const altTitles = [media.title.english, media.title.native, ...media.synonyms].filter(
    (alt): alt is string => Boolean(alt) && alt !== title,
  );

  const base = {
    id: mediaId(type, media.id),
    type,
    sourceId: String(media.id),
    title,
    altTitles: [...new Set(altTitles)],
    synopsis: media.description?.replace(/<[^>]+>/g, "").trim() || null,
    coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    bannerImage: media.bannerImage,
    year: media.seasonYear ?? media.startDate.year,
    status: media.status,
    genres: media.genres,
    score: media.averageScore !== null ? media.averageScore / 10 : null,
    source: { provider: "anilist" as const, url: media.siteUrl },
  };

  if (type === "ANIME") {
    return {
      ...base,
      details: {
        malId: media.idMal,
        format: media.format,
        episodes: media.episodes,
        duration: media.duration !== null ? `${media.duration} min per ep` : null,
        season: media.season?.toLowerCase() ?? null,
        studios: (media.studios?.nodes ?? []).map((studio) => studio.name),
        airedFrom: toIsoDate(media.startDate),
        airedTo: toIsoDate(media.endDate),
      },
    };
  }

  return {
    ...base,
    details: {
      malId: media.idMal,
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
      publishedTo: toIsoDate(media.endDate),
    },
  };
}

export async function searchAniList(
  query: string,
  type: AniListType,
  limit: number,
): Promise<Media[]> {
  const data = await queryAniList<{ Page: { media: AniListMedia[] } }>(SEARCH_QUERY, {
    search: query,
    type,
    perPage: limit,
  });

  return data.Page.media.map((media) => normalize(media, type));
}

export async function getAniList(id: string, type: AniListType): Promise<Media> {
  const data = await queryAniList<{ Media: AniListMedia | null }>(MEDIA_QUERY, {
    id: Number(id),
    type,
  });

  if (!data.Media) {
    throw new NotFoundError(`AniList ${type} ${id} not found`);
  }

  return normalize(data.Media, type);
}
