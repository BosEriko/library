import type { NextRequest } from "next/server";
import { CACHE_LONG, CACHE_NONE, CACHE_SHORT, json } from "@/lib/cache";
import { searchAll } from "@/lib/search";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_QUERY_LENGTH = 100;

function parseLimit(value: string | null): number {
  const limit = Number.parseInt(value ?? "", 10);

  if (Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) {
    return json(
      { error: `q is required and must be at most ${MAX_QUERY_LENGTH} characters` },
      CACHE_NONE,
      400,
    );
  }

  const limit = parseLimit(searchParams.get("limit"));

  const allowAdult = searchParams.get("adult") === "true";

  const { results, errors } = await searchAll(query, limit, allowAdult);

  const hasErrors = Object.keys(errors).length > 0;

  return json(
    { query, results, ...(hasErrors && { errors }) },
    hasErrors ? CACHE_SHORT : CACHE_LONG,
  );
}
