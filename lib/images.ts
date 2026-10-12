import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { errorMessage } from "@/lib/http";

const TIMEOUT_MS = 8000;
const QUALITY = 80;

export interface StoredImage {
  url: string;
  source: string;
}

function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function deleteImage(image: StoredImage): Promise<void> {
  try {
    await del(image.url);
  } catch (error) {
    console.warn(`Failed to delete image ${image.url}: ${errorMessage(error)}`);
  }
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
  if (previous && previous.source === source) {
    return previous;
  }

  if (!isBlobConfigured()) {
    return previous;
  }

  if (!source) {
    if (previous) {
      await deleteImage(previous);
    }

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
    const blob = await put(`${path}.webp`, image, {
      access: "public",
      addRandomSuffix: true,
      contentType: "image/webp",
    });

    if (previous) {
      await deleteImage(previous);
    }

    return { url: blob.url, source };
  } catch (error) {
    console.warn(`Failed to store image ${source}: ${errorMessage(error)}`);

    return previous;
  }
}
