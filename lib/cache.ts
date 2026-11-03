const ONE_DAY = 60 * 60 * 24;

export const CACHE_LONG = `public, s-maxage=${ONE_DAY * 7}, stale-while-revalidate=${ONE_DAY}`;
export const CACHE_SHORT = "public, s-maxage=60";
export const CACHE_NONE = "no-store";
export const CACHE_REDIRECT = "public, max-age=3600";
export const REDIS_TTL_SECONDS = ONE_DAY * 7;

export function cacheFor(seconds: number): string {
  return `public, s-maxage=${Math.max(60, Math.floor(seconds))}, stale-while-revalidate=3600`;
}

export function json(body: unknown, cacheControl: string, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}
