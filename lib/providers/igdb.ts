import { fetchJson, NotFoundError } from "@/lib/http";
import { mediaId, type Media } from "@/lib/types";

const IGDB_URL = "https://api.igdb.com/v4";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IMAGE_URL = "https://images.igdb.com/igdb/image/upload";

const FIELDS = [
  "name",
  "alternative_names.name",
  "summary",
  "url",
  "cover.image_id",
  "artworks.image_id",
  "screenshots.image_id",
  "first_release_date",
  "genres.name",
  "themes.name",
  "total_rating",
  "game_status.status",
  "platforms.name",
  "involved_companies.company.name",
  "involved_companies.developer",
  "involved_companies.publisher",
].join(",");

interface IgdbImage {
  image_id: string;
}

interface IgdbGame {
  id: number;
  name: string;
  alternative_names?: { name: string }[];
  summary?: string;
  url?: string;
  cover?: IgdbImage;
  artworks?: IgdbImage[];
  screenshots?: IgdbImage[];
  first_release_date?: number;
  genres?: { name: string }[];
  themes?: { name: string }[];
  total_rating?: number;
  game_status?: { status: string };
  platforms?: { name: string }[];
  involved_companies?: { company: { name: string }; developer: boolean; publisher: boolean }[];
}

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) {
    return token.value;
  }

  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET must be set");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const response = await fetchJson<{ access_token: string; expires_in: number }>(
    `${TOKEN_URL}?${params}`,
    { method: "POST" },
  );

  token = {
    value: response.access_token,
    expiresAt: Date.now() + (response.expires_in - 60) * 1000,
  };

  return token.value;
}

async function queryGames(body: string): Promise<IgdbGame[]> {
  return fetchJson<IgdbGame[]>(`${IGDB_URL}/games`, {
    method: "POST",
    headers: {
      "Client-ID": process.env.IGDB_CLIENT_ID ?? "",
      Authorization: `Bearer ${await getToken()}`,
      Accept: "application/json",
    },
    body,
  });
}

function imageUrl(image: IgdbImage | undefined, size: string): string | null {
  return image ? `${IMAGE_URL}/${size}/${image.image_id}.jpg` : null;
}

function normalize(game: IgdbGame): Media {
  const companies = game.involved_companies ?? [];

  return {
    id: mediaId("GAME", game.id),
    type: "GAME",
    sourceId: String(game.id),
    title: game.name,
    altTitles: (game.alternative_names ?? []).map((alt) => alt.name),
    synopsis: game.summary ?? null,
    coverImage: imageUrl(game.cover, "t_cover_big"),
    bannerImage: imageUrl(game.artworks?.[0] ?? game.screenshots?.[0], "t_1080p"),
    year: game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear()
      : null,
    status: game.game_status?.status ?? null,
    genres: [...(game.genres ?? []), ...(game.themes ?? [])].map((genre) => genre.name),
    score: game.total_rating !== undefined ? Math.round(game.total_rating) / 10 : null,
    source: { provider: "igdb", url: game.url ?? `https://www.igdb.com/games/${game.id}` },
    details: {
      platforms: (game.platforms ?? []).map((platform) => platform.name),
      developers: companies.filter((c) => c.developer).map((c) => c.company.name),
      publishers: companies.filter((c) => c.publisher).map((c) => c.company.name),
      releaseDate: game.first_release_date
        ? new Date(game.first_release_date * 1000).toISOString()
        : null,
    },
  };
}

export async function searchIgdb(query: string, limit: number): Promise<Media[]> {
  const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const games = await queryGames(`search "${escaped}"; fields ${FIELDS}; limit ${limit};`);

  return games.map(normalize);
}

export async function getIgdb(id: string): Promise<Media> {
  const [game] = await queryGames(`fields ${FIELDS}; where id = ${id};`);

  if (!game) {
    throw new NotFoundError(`IGDB game ${id} not found`);
  }

  return normalize(game);
}
