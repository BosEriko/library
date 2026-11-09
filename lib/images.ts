import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { errorMessage } from "@/lib/http";

const TIMEOUT_MS = 8000;
const QUALITY = 80;

export interface StoredImage {
  url: string;
  source: string;
}

let client: S3Client | null = null;

function isStorageConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.BUCKET_NAME &&
      process.env.STORAGE_PUBLIC_URL,
  );
}

function getClient(): S3Client {
  client ??= new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  return client;
}

function keyFor(url: string): string | null {
  const prefix = `${process.env.STORAGE_PUBLIC_URL}/`;

  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

async function minimize(image: ArrayBuffer, maxWidth: number): Promise<Buffer> {
  return sharp(Buffer.from(image))
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
}

export async function storeImage(
  path: string,
  source: string | null,
  maxWidth: number,
  previous: StoredImage | null,
): Promise<StoredImage | null> {
  if (previous && previous.source === source && keyFor(previous.url)) {
    return previous;
  }

  if (!isStorageConfigured()) {
    return previous;
  }

  if (!source) {
    return null;
  }

  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(TIMEOUT_MS) });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";

    if (!contentType.startsWith("image/")) {
      throw new Error(`Unexpected content type ${contentType}`);
    }

    const image = await minimize(await response.arrayBuffer(), maxWidth);
    const key = `${path}-${randomUUID()}.webp`;

    await getClient().send(
      new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: key,
        Body: image,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return { url: `${process.env.STORAGE_PUBLIC_URL}/${key}`, source };
  } catch (error) {
    console.warn(`Failed to store image ${source}: ${errorMessage(error)}`);

    return previous;
  }
}
