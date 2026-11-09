<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Always cache third-party requests

Every request to a third-party service must be cached. This covers the anime and manga API, IGDB, the Twitch OAuth token endpoint, provider image CDNs and any provider added later. Never add a code path that calls a provider on every incoming request.

- **Cache headers.** Every API route that reaches a provider sets `Cache-Control` with the helpers in `lib/cache.ts`: `CACHE_LONG` for normal responses, or `cacheFor()` when the data has its own expiry. Use `CACHE_SHORT` for partial results and 4xx responses, and `CACHE_NONE` only for errors, so a failure is never cached for long. Query parameters that change the result, such as `adult`, must stay in the URL so each variant is cached separately.
- **Firestore.** Data for a single item or a list is saved with an `updatedAt` timestamp and served from Firestore until it expires. An expired profile is still returned right away and refreshed in the background with `after()`. Follow `getOrFetchMedia` in `lib/media.ts` (`media` collection, 30 days) and `getOrFetchList` in `lib/lists.ts` (`lists` collection, 24 hours). If the provider fails and a saved copy exists, return the saved copy instead of an error.
- **Redis.** Responses that are not worth saving in Firestore, like search and Steam matching, are cached in Redis for 7 days with `getCached` and `setCached` in `lib/redis.ts`. Never cache a result where a provider failed. The app must keep working without Redis, so a Redis error only skips the cache.
- **Pages.** Server-rendered pages are not edge cached. They must go through the cached helpers above and never call a provider directly.
- **Images.** Saved profiles never point at provider image URLs. Copy their images into the Tigris bucket with `storeImage` in `lib/images.ts`, which only uploads again when the source URL changes. Every title a list or chart shows is saved as a profile by its id with `saveMediaItems` in `lib/media.ts`, and the list or chart points at that profile's images. Never copy images again for a list, chart or other feature, so each title's images are stored once. Only search and Steam results keep the provider image URLs. Replaced images aren't deleted right away, because saved lists and charts may still point at them; `pnpm storage:clean` removes the ones nothing uses.
- **Rate limit.** Every API route calls `rateLimit` from `lib/rate-limit.ts` before anything else, so one address can't use up the provider quotas.
- **Tokens.** Reuse access tokens until they expire, like `getToken` in `lib/providers/igdb.ts`.

When adding a provider or endpoint, decide which of these layers applies before writing the fetch call, and document the caching on the docs page (`app/page.tsx`).
