import { inFlight } from "@/lib/in-flight";
import { scheduleAnime, type AiringEpisode } from "@/lib/providers/anime-manga";
import { getCached, setCached } from "@/lib/redis";

export const SCHEDULE_TTL_SECONDS = 60 * 60 * 12;
export const MAX_SCHEDULE_IDS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface ScheduleMonth {
  month: string;
  startsAt: Date;
  endsAt: Date;
}

export interface Schedule {
  month: string;
  startsAt: string;
  endsAt: string;
  episodes: AiringEpisode[];
}

function monthNumber(year: number, month: number): number {
  return year * 12 + month;
}

export function toScheduleMonth(value: string, now: Date): ScheduleMonth | null {
  const match = MONTH_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const offset = monthNumber(year, month) - monthNumber(now.getUTCFullYear(), now.getUTCMonth());

  if (offset < -1 || offset > 2) {
    return null;
  }

  return {
    month: value,
    startsAt: new Date(Date.UTC(year, month, 1) - DAY_MS),
    endsAt: new Date(Date.UTC(year, month + 1, 1) + DAY_MS),
  };
}

export function toScheduleIds(value: string | null): string[] | null {
  if (!value) {
    return null;
  }

  const ids = [...new Set(value.split(","))];

  if (ids.length > MAX_SCHEDULE_IDS || ids.some((id) => !/^[1-9]\d{0,9}$/.test(id))) {
    return null;
  }

  return ids;
}

function cacheKey(id: string, month: string, allowAdult: boolean): string {
  return `schedule:${id}:${month}${allowAdult ? ":adult" : ""}`;
}

export async function getSchedule(
  ids: string[],
  period: ScheduleMonth,
  allowAdult: boolean,
): Promise<Schedule> {
  const cached = await getCached<AiringEpisode[]>(
    ids.map((id) => cacheKey(id, period.month, allowAdult)),
  );
  const missing = ids.filter((_, index) => cached[index] === undefined);
  const episodes = cached.flatMap((found) => found ?? []);

  if (missing.length > 0) {
    const fetched = await inFlight(
      `schedule:${period.month}:${allowAdult}:${missing.join(",")}`,
      () => scheduleAnime(missing, period.startsAt, period.endsAt, allowAdult),
    );

    await setCached(
      missing.map((id) => [
        cacheKey(id, period.month, allowAdult),
        fetched.filter((episode) => episode.id === id),
      ]),
      SCHEDULE_TTL_SECONDS,
    );
    episodes.push(...fetched);
  }

  return {
    month: period.month,
    startsAt: period.startsAt.toISOString(),
    endsAt: period.endsAt.toISOString(),
    episodes: episodes.sort((a, b) => a.airsAt.localeCompare(b.airsAt)),
  };
}
