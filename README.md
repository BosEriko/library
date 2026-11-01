This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

This project uses [pnpm](https://pnpm.io). Installing with npm or yarn is blocked.

Install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The home page documents the API endpoints.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploying

The app runs on [Fly.io](https://fly.io) as `library-boseriko` (see `fly.toml` and `Dockerfile`). Images are stored in a public [Tigris](https://www.tigrisdata.com) bucket, and Cloudflare sits in front of the site to cache API responses.

### First deploy

1. Create the app:

   ```bash
   fly apps create library-boseriko
   ```

2. Create a public image bucket. This also sets the `AWS_*` and `BUCKET_NAME` secrets on the app:

   ```bash
   fly storage create --public --name library-boseriko -a library-boseriko
   ```

3. Set the remaining secrets. `STORAGE_PUBLIC_URL` is the bucket's public address, with no trailing slash:

   ```bash
   fly secrets set -a library-boseriko \
     STORAGE_PUBLIC_URL=https://library-boseriko.fly.storage.tigris.dev \
     FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY="..." \
     IGDB_CLIENT_ID=... IGDB_CLIENT_SECRET=...
   ```

4. Deploy:

   ```bash
   fly deploy
   ```

### Domain and caching

1. Add a certificate for the domain, then create the DNS records Fly prints in Cloudflare:

   ```bash
   fly certs add library.boseriko.com -a library-boseriko
   ```

2. Turn on the Cloudflare proxy for `library.boseriko.com` once the certificate is issued.
3. In Cloudflare, add a **Cache Rule** for `library.boseriko.com/api/*` that makes requests **eligible for cache** and uses the **origin's cache-control headers**. Fly doesn't cache responses, so without this rule every request reaches AniList and IGDB. Cloudflare doesn't cache JSON on its own.
4. Check that a repeated API request returns `cf-cache-status: HIT`.

### Later deploys

```bash
fly deploy
```
