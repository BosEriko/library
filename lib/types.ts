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

export const LIST_NAMES = ["trending", "season", "top", "upcoming"] as const;

export type ListName = (typeof LIST_NAMES)[number];

export function toListName(value: string): ListName | null {
  return LIST_NAMES.find((name) => name === value) ?? null;
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
  isAdult: boolean;
  source: { provider: "anilist" | "igdb"; url: string };
  details: Record<string, unknown>;
}

export interface StoredMedia extends Media {
  createdAt: string;
  updatedAt: string;
}

export interface MediaList {
  type: MediaType;
  list: ListName;
  items: Media[];
  updatedAt: string;
}

export interface SteamMatch {
  id: string;
  type: "GAME";
  sourceId: string;
  title: string;
  coverImage: string | null;
  year: number | null;
  isAdult: boolean;
}

export function mediaId(type: MediaType, sourceId: string | number): string {
  return `${type}_${sourceId}`;
}
