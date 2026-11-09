import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase";
import { fetchList } from "@/lib/lists";
import { saveMediaItems } from "@/lib/media";
import { acquireLock } from "@/lib/redis";
import type { Chart, ChartEntry, ChartMovement, Media, MediaType } from "@/lib/types";

const COLLECTION = "charts";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;
const BUILD_LOCK_SECONDS = 60;

interface ChartDocument {
  type: MediaType;
  week: string;
  adult: boolean;
  previousWeek: string | null;
  entries: ChartEntry[];
  updatedAt: Timestamp;
}

export interface ChartResult {
  chart: Chart;
  saved: boolean;
  currentWeekEndsAt: number;
}

function mondayOf(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
    ),
  );
}

function isoWeek(date: Date): string {
  const thursday = new Date(mondayOf(date).getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;

  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weekStart(week: string): Date | null {
  const match = WEEK_PATTERN.exec(week);

  if (!match) {
    return null;
  }

  const firstMonday = mondayOf(new Date(Date.UTC(Number(match[1]), 0, 4)));
  const start = new Date(firstMonday.getTime() + (Number(match[2]) - 1) * WEEK_MS);

  return isoWeek(start) === week ? start : null;
}

function chartsCollection() {
  return getDb().collection(COLLECTION);
}

function savedCharts(type: MediaType, allowAdult: boolean) {
  return chartsCollection().where("type", "==", type).where("adult", "==", allowAdult);
}

async function findNextWeek(doc: ChartDocument): Promise<string | null> {
  const snapshot = await savedCharts(doc.type, doc.adult)
    .where("previousWeek", "==", doc.week)
    .select("week")
    .get();
  const weeks: string[] = snapshot.docs.map((saved) => saved.data().week).sort();

  return weeks[0] ?? null;
}

async function toChart(doc: ChartDocument, startsAt: Date): Promise<Chart> {
  return {
    type: doc.type,
    week: doc.week,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + WEEK_MS).toISOString(),
    previousWeek: doc.previousWeek,
    nextWeek: await findNextWeek(doc),
    entries: doc.entries,
    updatedAt: doc.updatedAt.toDate().toISOString(),
  };
}

function movement(rank: number, previousRank: number | null): ChartMovement {
  if (previousRank === null) {
    return "new";
  }

  if (rank === previousRank) {
    return "same";
  }

  return rank < previousRank ? "up" : "down";
}

function rankEntries(items: Media[], earlier: ChartDocument[]): ChartEntry[] {
  const previous = new Map(earlier.at(-1)?.entries.map((entry) => [entry.media.id, entry]));
  const peaks = new Map<string, number>();

  for (const chart of earlier) {
    for (const entry of chart.entries) {
      peaks.set(entry.media.id, Math.min(entry.rank, peaks.get(entry.media.id) ?? entry.rank));
    }
  }

  return items.map((media, index) => {
    const rank = index + 1;
    const last = previous.get(media.id);
    const previousRank = last?.rank ?? null;

    return {
      rank,
      previousRank,
      movement: movement(rank, previousRank),
      weeksOnChart: (last?.weeksOnChart ?? 0) + 1,
      peak: Math.min(rank, peaks.get(media.id) ?? rank),
      media,
    };
  });
}

async function buildChart(
  type: MediaType,
  week: string,
  allowAdult: boolean,
): Promise<ChartDocument> {
  const [history, items] = await Promise.all([
    savedCharts(type, allowAdult).get(),
    fetchList(type, "trending", allowAdult, "RELEASING"),
  ]);

  if (items.length === 0) {
    throw new Error(`No ${type} titles to chart for ${week}`);
  }

  const earlier = history.docs
    .map((saved) => saved.data() as ChartDocument)
    .filter((chart) => chart.week < week)
    .sort((a, b) => a.week.localeCompare(b.week));

  return {
    type,
    week,
    adult: allowAdult,
    previousWeek: earlier.at(-1)?.week ?? null,
    entries: rankEntries(await saveMediaItems(items), earlier),
    updatedAt: Timestamp.now(),
  };
}

export async function getChart(
  type: MediaType,
  week: string | null,
  allowAdult: boolean,
): Promise<ChartResult | null> {
  const now = new Date();
  const currentWeek = isoWeek(now);
  const currentWeekEndsAt = mondayOf(now).getTime() + WEEK_MS;
  const requested = week || currentWeek;
  const startsAt = weekStart(requested);

  if (!startsAt || requested > currentWeek) {
    return null;
  }

  const id = `${type}_${requested}${allowAdult ? "_adult" : ""}`;
  const ref = chartsCollection().doc(id);
  const toResult = async (doc: ChartDocument, saved: boolean): Promise<ChartResult> => ({
    chart: await toChart(doc, startsAt),
    saved,
    currentWeekEndsAt,
  });
  const readSaved = async (error: unknown): Promise<ChartResult> => {
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      throw error;
    }

    return toResult(snapshot.data() as ChartDocument, true);
  };
  const snapshot = await ref.get();

  if (snapshot.exists) {
    return toResult(snapshot.data() as ChartDocument, true);
  }

  if (requested !== currentWeek) {
    return null;
  }

  if (!(await acquireLock(`chart:${id}`, BUILD_LOCK_SECONDS))) {
    return readSaved(new Error(`The ${type} chart for ${requested} is still being built`));
  }

  const document = await buildChart(type, requested, allowAdult);

  if (Date.now() >= currentWeekEndsAt) {
    return toResult(document, false);
  }

  try {
    await ref.create(document);
  } catch (error) {
    return readSaved(error);
  }

  return toResult(document, true);
}
