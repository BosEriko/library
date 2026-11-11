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

export const SEASON_NAMES = ["winter", "spring", "summer", "fall"] as const;

export type SeasonName = (typeof SEASON_NAMES)[number];

export type DatePrecision = "day" | "month" | "quarter" | "year";

export interface SeasonPeriod {
  season: SeasonName;
  year: number;
  startsAt: Date;
  endsAt: Date;
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
  source: { provider: "myanimelist" | "igdb"; url: string };
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

export interface Season {
  type: MediaType;
  season: SeasonName;
  year: number;
  startsAt: string;
  endsAt: string;
  items: Media[];
  updatedAt: string;
}

export type ChartMovement = "up" | "down" | "same" | "new";

export interface ChartEntry {
  rank: number;
  previousRank: number | null;
  movement: ChartMovement;
  weeksOnChart: number;
  peak: number;
  media: Media;
}

export interface Chart {
  type: MediaType;
  week: string;
  startsAt: string;
  endsAt: string;
  previousWeek: string | null;
  nextWeek: string | null;
  entries: ChartEntry[];
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

export function hasCurrentSource(media: Media): boolean {
  return media.type === "GAME" || media.source?.provider === "myanimelist";
}

export function malSource(type: MediaType, malId: string | number): Media["source"] {
  return {
    provider: "myanimelist",
    url: `https://myanimelist.net/${type.toLowerCase()}/${malId}`,
  };
}

export function mediaId(type: MediaType, sourceId: string | number): string {
  return `${type}_${sourceId}`;
}
