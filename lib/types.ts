export type MediaType = "ANIME" | "MANGA" | "GAME";

export type MediaSegment = "anime" | "manga" | "game";

export const MEDIA_TYPES: Record<MediaSegment, MediaType> = {
  anime: "ANIME",
  manga: "MANGA",
  game: "GAME",
};

export function toMediaType(segment: string): MediaType | null {
  return MEDIA_TYPES[segment as MediaSegment] ?? null;
}

export interface Media {
  id: string;
  type: MediaType;
  sourceId: string;
  title: string;
  altTitles: string[];
  synopsis: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  year: number | null;
  status: string | null;
  genres: string[];
  score: number | null;
  source: { provider: "jikan" | "igdb"; url: string };
  details: Record<string, unknown>;
}

export interface StoredMedia extends Media {
  createdAt: string;
  updatedAt: string;
}

export function mediaId(type: MediaType, sourceId: string | number): string {
  return `${type}_${sourceId}`;
}
