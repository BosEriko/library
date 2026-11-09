import type { NextRequest } from "next/server";
import { cacheFor, CACHE_LONG, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { getChart, type ChartResult } from "@/lib/charts";
import { errorMessage } from "@/lib/http";
import { toMediaType } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";

function cacheControl({ chart, saved, currentWeekEndsAt }: ChartResult): string {
  if (!saved) {
    return CACHE_SHORT;
  }

  return chart.nextWeek ? CACHE_LONG : cacheFor((currentWeekEndsAt - Date.now()) / 1000);
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/charts/[type]">) {
  const limited = await rateLimit(request);

  if (limited) {
    return limited;
  }

  const { type: segment } = await ctx.params;
  const type = toMediaType(segment);

  if (!type) {
    return json({ error: "Not found" }, CACHE_SHORT, 404);
  }

  try {
    const { searchParams } = request.nextUrl;
    const allowAdult = searchParams.get("adult") === "true";
    const result = await getChart(type, searchParams.get("week"), allowAdult);

    if (!result) {
      return json({ error: "Not found" }, CACHE_SHORT, 404);
    }

    return json(result.chart, cacheControl(result));
  } catch (error) {
    console.error(`Failed to load ${type} chart: ${errorMessage(error)}`);

    return json({ error: "Failed to load chart" }, CACHE_NONE, 502);
  }
}
