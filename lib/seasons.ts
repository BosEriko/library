import { getDb } from "@/lib/firebase";
import { getOrFetchItems } from "@/lib/lists";
import { seasonAnimeManga } from "@/lib/providers/anime-manga";
import { seasonIgdb } from "@/lib/providers/igdb";
import {
  SEASON_NAMES,
  type Media,
  type MediaType,
  type Season,
  type SeasonName,
  type SeasonPeriod,
} from "@/lib/types";
import type { Timestamp } from "firebase-admin/firestore";

const COLLECTION = "seasons";
const SEASON_SIZE = 20;
const SEASON_PATTERN = /^(\d{4})-(winter|spring|summer|fall)$/;

interface SeasonDocument {
  type: MediaType;
  season: SeasonName;
  year: number;
  adult: boolean;
  items: Media[];
  updatedAt: Timestamp;
}

export interface SeasonResult {
  season: Season;
  stale: boolean;
}

function seasonPeriod(year: number, index: number): SeasonPeriod {
  return {
    season: SEASON_NAMES[index],
    year,
    startsAt: new Date(Date.UTC(year, index * 3, 1)),
    endsAt: new Date(Date.UTC(year, index * 3 + 3, 1)),
  };
}

function seasonNumber(year: number, index: number): number {
  return year * SEASON_NAMES.length + index;
}

export function currentSeason(now: Date): SeasonPeriod {
  return seasonPeriod(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3));
}

export function toSeasonPeriod(value: string, now: Date): SeasonPeriod | null {
  const match = SEASON_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const index = SEASON_NAMES.indexOf(match[2] as SeasonName);
  const current = currentSeason(now);
  const offset =
    seasonNumber(year, index) - seasonNumber(current.year, SEASON_NAMES.indexOf(current.season));

  return Math.abs(offset) <= 1 ? seasonPeriod(year, index) : null;
}

function fetchSeason(type: MediaType, period: SeasonPeriod, allowAdult: boolean): Promise<Media[]> {
  return type === "GAME"
    ? seasonIgdb(period, SEASON_SIZE, allowAdult)
    : seasonAnimeManga(type, period, SEASON_SIZE, allowAdult);
}

export async function getOrFetchSeason(
  type: MediaType,
  period: SeasonPeriod,
  allowAdult: boolean,
): Promise<SeasonResult> {
  const ref = getDb()
    .collection(COLLECTION)
    .doc(`${type}_${period.year}-${period.season}${allowAdult ? "_adult" : ""}`);
  const { doc, stale } = await getOrFetchItems<SeasonDocument>(
    ref,
    () => fetchSeason(type, period, allowAdult),
    { type, season: period.season, year: period.year, adult: allowAdult },
  );

  return {
    season: {
      type,
      season: period.season,
      year: period.year,
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
      items: doc.items,
      updatedAt: doc.updatedAt.toDate().toISOString(),
    },
    stale,
  };
}
