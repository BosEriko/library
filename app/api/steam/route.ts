import type { NextRequest } from "next/server";
import { CACHE_LONG, CACHE_NONE, json } from "@/lib/cache";
import { errorMessage } from "@/lib/http";
import { findSteamGames } from "@/lib/providers/igdb";

const MAX_IDS = 200;

export async function GET(request: NextRequest) {
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
    return json({ results: await findSteamGames(ids) }, CACHE_LONG);
  } catch (error) {
    console.error(`Failed to match Steam games: ${errorMessage(error)}`);

    return json({ error: "Failed to match Steam games" }, CACHE_NONE, 502);
  }
}
