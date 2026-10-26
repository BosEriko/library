import type { NextRequest } from "next/server";
import { CACHE_LONG, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { AdultContentError, errorMessage, NotFoundError } from "@/lib/http";
import { getOrFetchMedia } from "@/lib/media";
import { toMediaType } from "@/lib/types";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/[type]/[id]">) {
  const { type: segment, id } = await ctx.params;
  const type = toMediaType(segment);

  if (!type || !/^\d+$/.test(id)) {
    return json({ error: "Not found" }, CACHE_SHORT, 404);
  }

  try {
    const allowAdult = request.nextUrl.searchParams.get("adult") === "true";

    return json(await getOrFetchMedia(type, id, allowAdult), CACHE_LONG);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return json({ error: "Not found" }, CACHE_SHORT, 404);
    }

    if (error instanceof AdultContentError) {
      return json({ error: "Adult content" }, CACHE_SHORT, 403);
    }

    console.error(`Failed to load ${type} ${id}: ${errorMessage(error)}`);

    return json({ error: "Failed to load media" }, CACHE_NONE, 502);
  }
}
