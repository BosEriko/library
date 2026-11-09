# Library

Search anime, manga and games from one place and open any title as a full profile. The home page documents the public JSON API.

## Getting Started

This project uses [pnpm](https://pnpm.io). Installing with npm or yarn is blocked.

Copy `example.env` to `.env.local` and replace each `XXXX` with a real value. The storage and Redis lines are optional locally: delete them to skip image uploads and the Redis cache.

Install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
pnpm test
```

## Deploying

The app runs on [Fly.io](https://fly.io) as `library-boseriko` (see `fly.toml` and `Dockerfile`). Images are stored in a public [Tigris](https://www.tigrisdata.com) bucket, and search and Steam results are cached in [Upstash Redis](https://fly.io/docs/upstash/redis/).

### First deploy

1. Create the app:

   ```bash
   fly apps create library-boseriko
   ```

2. Create a public image bucket. This also sets the `AWS_*` and `BUCKET_NAME` secrets on the app:

   ```bash
   fly storage create --public --name library-boseriko-media -a library-boseriko
   ```

3. Create a Redis database in the same region as the app, and copy the private URL it prints (`redis://default:...@fly-library-boseriko-redis.upstash.io:6379`):

   ```bash
   fly redis create --name library-boseriko-redis --region sin --no-replicas --enable-eviction
   ```

4. Set the remaining secrets. `STORAGE_PUBLIC_URL` is the bucket's public address, with no trailing slash:

   ```bash
   fly secrets set -a library-boseriko \
     STORAGE_PUBLIC_URL=https://library-boseriko-media.t3.tigrisfiles.io \
     REDIS_URL="redis://default:...@fly-library-boseriko-redis.upstash.io:6379" \
     FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY="..." \
     IGDB_API_URL=https://api.igdb.com/v4 IGDB_CLIENT_ID=... IGDB_CLIENT_SECRET=... \
     ANIME_MANGA_API_URL=...
   ```

5. Deploy:

   ```bash
   fly deploy
   ```

### Domain

Add a certificate for the domain, then point `library.boseriko.com` at the A and AAAA records Fly prints:

```bash
fly certs add library.boseriko.com -a library-boseriko
```

### Later deploys

```bash
fly deploy
```

### Cleaning up images

Images that no profile, list or chart uses anymore stay in the bucket, for example after a title's cover changes or after deleting Firestore entries. List them with:

```bash
pnpm storage:clean
```

Then delete them with `pnpm storage:clean --delete`. Files uploaded in the last 10 minutes are skipped, so a profile, list or chart that is being saved isn't affected. This uses the storage and Firebase values in `.env.local`, which point at production.
