import type { NextRequest } from "next/server";
import { cacheFor, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { errorMessage } from "@/lib/http";
import { getOrFetchList, LIST_MAX_AGE_MS } from "@/lib/lists";
import { toListName, toMediaType } from "@/lib/types";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/lists/[type]/[list]">) {
  const { type: segment, list: name } = await ctx.params;
  const type = toMediaType(segment);
  const list = toListName(name);

  if (!type || !list) {
    return json({ error: "Not found" }, CACHE_SHORT, 404);
  }

  try {
    const allowAdult = request.nextUrl.searchParams.get("adult") === "true";
    const result = await getOrFetchList(type, list, allowAdult);
    const age = Date.now() - Date.parse(result.list.updatedAt);

    return json(
      result.list,
      result.stale ? CACHE_SHORT : cacheFor((LIST_MAX_AGE_MS - age) / 1000),
    );
  } catch (error) {
    console.error(`Failed to load ${type} ${list}: ${errorMessage(error)}`);

    return json({ error: "Failed to load list" }, CACHE_NONE, 502);
  }
}
