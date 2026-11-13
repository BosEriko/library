import type { NextRequest } from "next/server";
import { cacheFor, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { errorMessage } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getSchedule, SCHEDULE_TTL_SECONDS, toScheduleIds, toScheduleMonth } from "@/lib/schedule";

export async function GET(request: NextRequest) {
  const limited = await rateLimit(request);

  if (limited) {
    return limited;
  }

  const params = request.nextUrl.searchParams;
  const period = toScheduleMonth(params.get("month") ?? "", new Date());
  const ids = toScheduleIds(params.get("ids"));

  if (!period || !ids) {
    return json({ error: "Expected a nearby month and 1 to 50 anime ids" }, CACHE_SHORT, 400);
  }

  try {
    const schedule = await getSchedule(ids, period, params.get("adult") === "true");

    return json(schedule, cacheFor(SCHEDULE_TTL_SECONDS));
  } catch (error) {
    console.error(`Failed to load the ${period.month} schedule: ${errorMessage(error)}`);

    return json({ error: "Failed to load schedule" }, CACHE_NONE, 502);
  }
}
