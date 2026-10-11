import { fetchJson } from "@/lib/http";

const ANILIST_URL = "https://graphql.anilist.co";

const IMAGES_QUERY = `
  query ($ids: [Int], $type: MediaType) {
    Page(perPage: 50) {
      media(idMal_in: $ids, type: $type) {
        idMal
        coverImage { extraLarge large }
        bannerImage
      }
    }
  }
`;

interface AniListMedia {
  idMal: number | null;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
}

interface AniListResponse {
  data: { Page: { media: AniListMedia[] } } | null;
}

export interface AniListImages {
  coverImage: string | null;
  bannerImage: string | null;
}

export async function getAniListImages(
  malIds: number[],
  type: "ANIME" | "MANGA",
): Promise<Map<number, AniListImages>> {
  const images = new Map<number, AniListImages>();

  if (malIds.length === 0) {
    return images;
  }

  const response = await fetchJson<AniListResponse>(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: IMAGES_QUERY, variables: { ids: malIds, type } }),
  });

  for (const media of response.data?.Page.media ?? []) {
    if (media.idMal === null) {
      continue;
    }

    images.set(media.idMal, {
      coverImage: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
      bannerImage: media.bannerImage,
    });
  }

  return images;
}
