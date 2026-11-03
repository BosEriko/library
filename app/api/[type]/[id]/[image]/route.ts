import type { NextRequest } from "next/server";
import { CACHE_NONE, CACHE_REDIRECT, CACHE_SHORT, json } from "@/lib/cache";
import { AdultContentError, errorMessage, NotFoundError } from "@/lib/http";
import { getOrFetchMedia } from "@/lib/media";
import { toMediaType } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";

function toField(image: string): "coverImage" | "bannerImage" | null {
  if (image === "cover") {
    return "coverImage";
  }

  if (image === "banner") {
    return "bannerImage";
  }

  return null;
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/[type]/[id]/[image]">,
) {
  const limited = await rateLimit(request, "image");

  if (limited) {
    return limited;
  }

  const { type: segment, id, image } = await ctx.params;
  const type = toMediaType(segment);
  const field = toField(image);

  if (!type || !field || !/^\d+$/.test(id)) {
    return json({ error: "Not found" }, CACHE_SHORT, 404);
  }

  try {
    const allowAdult = request.nextUrl.searchParams.get("adult") === "true";
    const url = (await getOrFetchMedia(type, id, allowAdult))[field];

    if (!url) {
      return json({ error: "Not found" }, CACHE_SHORT, 404);
    }

    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": CACHE_REDIRECT },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return json({ error: "Not found" }, CACHE_SHORT, 404);
    }

    if (error instanceof AdultContentError) {
      return json({ error: "Adult content" }, CACHE_SHORT, 403);
    }

    console.error(`Failed to load ${image} of ${type} ${id}: ${errorMessage(error)}`);

    return json({ error: "Failed to load media" }, CACHE_NONE, 502);
  }
}
