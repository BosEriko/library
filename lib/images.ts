import { del, put } from "@vercel/blob";
import { errorMessage } from "@/lib/http";

const TIMEOUT_MS = 8000;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

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

export async function storeImage(
  path: string,
  source: string | null,
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

    const blob = await put(`${path}.${EXTENSIONS[contentType] ?? "img"}`, await response.blob(), {
      access: "public",
      addRandomSuffix: true,
      contentType,
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
