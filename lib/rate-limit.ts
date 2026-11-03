import type { NextRequest } from "next/server";
import { CACHE_NONE } from "@/lib/cache";
import { increment } from "@/lib/redis";

export const RATE_LIMIT = 60;
export const IMAGE_RATE_LIMIT = 300;
const WINDOW_SECONDS = 60;

const LIMITS = { api: RATE_LIMIT, image: IMAGE_RATE_LIMIT };

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("fly-client-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function rateLimit(
  request: NextRequest,
  scope: keyof typeof LIMITS = "api",
): Promise<Response | null> {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / WINDOW_SECONDS);
  const count = await increment(`ratelimit:${scope}:${clientIp(request)}:${window}`, WINDOW_SECONDS);

  if (count === null || count <= LIMITS[scope]) {
    return null;
  }

  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Cache-Control": CACHE_NONE,
        "Retry-After": String(WINDOW_SECONDS - (now % WINDOW_SECONDS)),
      },
    },
  );
}
