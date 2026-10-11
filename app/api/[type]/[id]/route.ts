import type { NextRequest } from "next/server";
import { CACHE_LONG, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { NotFoundError } from "@/lib/http";
import { getOrFetchMedia } from "@/lib/media";
import { toMediaType } from "@/lib/types";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/[type]/[id]">) {
  const { type: segment, id } = await ctx.params;
  const type = toMediaType(segment);

  if (!type || !/^\d+$/.test(id)) {
    return json({ error: "Not found" }, CACHE_SHORT, 404);
  }

  try {
    return json(await getOrFetchMedia(type, id), CACHE_LONG);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return json({ error: "Not found" }, CACHE_SHORT, 404);
    }

    console.error(`Failed to load ${type} ${id}`, error);

    return json({ error: "Failed to load media" }, CACHE_NONE, 502);
  }
}
