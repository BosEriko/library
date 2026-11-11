import type { NextRequest } from "next/server";
import { cacheFor, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { errorMessage } from "@/lib/http";
import { LIST_MAX_AGE_MS } from "@/lib/lists";
import { getOrFetchSeason, toSeasonPeriod } from "@/lib/seasons";
import { toMediaType } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/seasons/[type]/[season]">) {
  const limited = await rateLimit(request);

  if (limited) {
    return limited;
  }

  const { type: segment, season: name } = await ctx.params;
  const type = toMediaType(segment);
  const period = toSeasonPeriod(name, new Date());

  if (!type || !period) {
    return json({ error: "Not found" }, CACHE_SHORT, 404);
  }

  try {
    const allowAdult = request.nextUrl.searchParams.get("adult") === "true";
    const result = await getOrFetchSeason(type, period, allowAdult);
    const age = Date.now() - Date.parse(result.season.updatedAt);

    return json(
      result.season,
      result.stale ? CACHE_SHORT : cacheFor((LIST_MAX_AGE_MS - age) / 1000),
    );
  } catch (error) {
    console.error(`Failed to load ${type} ${name}: ${errorMessage(error)}`);

    return json({ error: "Failed to load season" }, CACHE_NONE, 502);
  }
}
