<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Always cache third-party requests

Every request to a third-party service must be cached. This covers AniList, IGDB, the Twitch OAuth token endpoint, provider image CDNs and any provider added later. Never add a code path that calls a provider on every incoming request.

- **Edge cache.** Every API route that reaches a provider sets `Cache-Control` with the helpers in `lib/cache.ts`: `CACHE_LONG` for normal responses, or `cacheFor()` when the data has its own expiry. Use `CACHE_SHORT` for partial results and 4xx responses, and `CACHE_NONE` only for errors, so a failure is never cached for long. Query parameters that change the result, such as `adult`, must stay in the URL so each variant is cached separately.
- **Firestore.** Data for a single item or a list is saved with an `updatedAt` timestamp and served from Firestore until it expires. Follow `getOrFetchMedia` in `lib/media.ts` (`media` collection, 30 days) and `getOrFetchList` in `lib/lists.ts` (`lists` collection, 24 hours). If the provider fails and a saved copy exists, return the saved copy instead of an error.
- **Edge cache only.** Responses that are not worth saving per item, like search and Steam matching, may rely on the edge cache alone, but they still need it.
- **Pages.** Server-rendered pages are not edge cached. They must go through the Firestore-backed helpers above and never call a provider directly.
- **Images.** Stored data never points at provider image URLs. Copy images into Vercel Blob with `storeImage` in `lib/images.ts`, which only uploads again when the source URL changes.
- **Tokens.** Reuse access tokens until they expire, like `getToken` in `lib/providers/igdb.ts`.

When adding a provider or endpoint, decide which of these layers applies before writing the fetch call, and document the caching on the docs page (`app/page.tsx`).
