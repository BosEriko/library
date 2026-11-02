import type { NextRequest } from "next/server";
import { CACHE_LONG, CACHE_NONE, json, REDIS_TTL_SECONDS } from "@/lib/cache";
import { errorMessage } from "@/lib/http";
import { findSteamGames } from "@/lib/providers/igdb";
import { getCached, setCached } from "@/lib/redis";
import type { SteamMatch } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";

const MAX_IDS = 200;

async function findCachedSteamGames(ids: string[]): Promise<Record<string, SteamMatch>> {
  const keys = ids.map((id) => `steam:${id}`);
  const cached = await getCached<SteamMatch | null>(keys);
  const missing = ids.filter((_, index) => cached[index] === undefined);
  const found = missing.length > 0 ? await findSteamGames(missing) : {};

  await setCached(
    missing.map((id) => [`steam:${id}`, found[id] ?? null]),
    REDIS_TTL_SECONDS,
  );

  const results: Record<string, SteamMatch> = {};

  ids.forEach((id, index) => {
    const match = cached[index] ?? found[id];

    if (match) {
      results[id] = match;
    }
  });

  return results;
}

export async function GET(request: NextRequest) {
  const limited = await rateLimit(request);

  if (limited) {
    return limited;
  }

  const ids = [
    ...new Set(
      (request.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => /^\d{1,10}$/.test(id))) {
    return json(
      { error: `ids must be 1 to ${MAX_IDS} comma-separated Steam app ids` },
      CACHE_NONE,
      400,
    );
  }

  try {
    return json({ results: await findCachedSteamGames(ids) }, CACHE_LONG);
  } catch (error) {
    console.error(`Failed to match Steam games: ${errorMessage(error)}`);

    return json({ error: "Failed to match Steam games" }, CACHE_NONE, 502);
  }
}
