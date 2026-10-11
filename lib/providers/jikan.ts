import { fetchJson } from "@/lib/http";
import { getAniListImages } from "@/lib/providers/anilist";
import { mediaId, type Media } from "@/lib/types";

const JIKAN_URL = "https://api.jikan.moe/v4";

type JikanType = "ANIME" | "MANGA";

interface JikanNamed {
  name: string;
}

interface JikanItem {
  mal_id: number;
  url: string;
  images: { jpg: { large_image_url: string | null; image_url: string | null } };
  title: string;
  titles: { type: string; title: string }[];
  synopsis: string | null;
  status: string | null;
  score: number | null;
  genres: JikanNamed[];
  themes: JikanNamed[];
  demographics: JikanNamed[];
  type: string | null;
  year?: number | null;
  aired?: { from: string | null; to: string | null };
  episodes?: number | null;
  duration?: string | null;
  rating?: string | null;
  season?: string | null;
  studios?: JikanNamed[];
  published?: { from: string | null; to: string | null };
  chapters?: number | null;
  volumes?: number | null;
  authors?: JikanNamed[];
  serializations?: JikanNamed[];
}

function names(list: JikanNamed[] | undefined): string[] {
  return (list ?? []).map((item) => item.name);
}

function yearOf(date: string | null | undefined): number | null {
  return date ? new Date(date).getUTCFullYear() : null;
}

function normalize(item: JikanItem, type: JikanType): Media {
  const base = {
    id: mediaId(type, item.mal_id),
    type,
    sourceId: String(item.mal_id),
    title: item.title,
    altTitles: [...new Set(item.titles.map((t) => t.title))].filter((t) => t !== item.title),
    synopsis: item.synopsis,
    coverImage: item.images.jpg.large_image_url ?? item.images.jpg.image_url,
    bannerImage: null,
    status: item.status,
    genres: [...names(item.genres), ...names(item.themes), ...names(item.demographics)],
    score: item.score,
    source: { provider: "jikan" as const, url: item.url },
  };

  if (type === "ANIME") {
    return {
      ...base,
      year: item.year ?? yearOf(item.aired?.from),
      details: {
        format: item.type,
        episodes: item.episodes ?? null,
        duration: item.duration ?? null,
        rating: item.rating ?? null,
        season: item.season ?? null,
        studios: names(item.studios),
        airedFrom: item.aired?.from ?? null,
        airedTo: item.aired?.to ?? null,
      },
    };
  }

  return {
    ...base,
    year: yearOf(item.published?.from),
    details: {
      format: item.type,
      chapters: item.chapters ?? null,
      volumes: item.volumes ?? null,
      authors: names(item.authors),
      serializations: names(item.serializations),
      publishedFrom: item.published?.from ?? null,
      publishedTo: item.published?.to ?? null,
    },
  };
}

async function withAniListImages(media: Media[], type: JikanType): Promise<Media[]> {
  const ids = media.map((item) => Number(item.sourceId));

  try {
    const images = await getAniListImages(ids, type);

    return media.map((item) => {
      const match = images.get(Number(item.sourceId));

      return {
        ...item,
        coverImage: match?.coverImage ?? item.coverImage,
        bannerImage: match?.bannerImage ?? item.bannerImage,
      };
    });
  } catch {
    return media;
  }
}

export async function searchJikan(query: string, type: JikanType, limit: number): Promise<Media[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetchJson<{ data: JikanItem[] }>(
    `${JIKAN_URL}/${type.toLowerCase()}?${params}`,
  );
  const media = response.data.map((item) => normalize(item, type));

  return withAniListImages(media, type);
}

export async function getJikan(id: string, type: JikanType): Promise<Media> {
  const response = await fetchJson<{ data: JikanItem }>(
    `${JIKAN_URL}/${type.toLowerCase()}/${encodeURIComponent(id)}/full`,
  );
  const [media] = await withAniListImages([normalize(response.data, type)], type);

  return media;
}
