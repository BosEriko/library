import Redis from "ioredis";
import { errorMessage } from "@/lib/http";

const CONNECT_TIMEOUT_MS = 2000;

let ready: Promise<Redis | null> | undefined;

async function connect(): Promise<Redis | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }

  const redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  redis.on("error", (error) => console.warn(`Redis error: ${errorMessage(error)}`));

  try {
    await redis.connect();
  } catch (error) {
    console.warn(`Redis connection failed: ${errorMessage(error)}`);
  }

  return redis;
}

function getRedis(): Promise<Redis | null> {
  ready ??= connect();

  return ready;
}

export async function getCached<T>(keys: string[]): Promise<(T | undefined)[]> {
  const redis = await getRedis();

  if (!redis || keys.length === 0) {
    return keys.map(() => undefined);
  }

  try {
    const values = await redis.mget(keys);

    return values.map((value) => (value === null ? undefined : (JSON.parse(value) as T)));
  } catch (error) {
    console.warn(`Redis read failed: ${errorMessage(error)}`);

    return keys.map(() => undefined);
  }
}

export async function setCached(entries: [string, unknown][], ttlSeconds: number): Promise<void> {
  const redis = await getRedis();

  if (!redis || entries.length === 0) {
    return;
  }

  try {
    const pipeline = redis.pipeline();

    for (const [key, value] of entries) {
      pipeline.set(key, JSON.stringify(value), "EX", ttlSeconds);
    }

    await pipeline.exec();
  } catch (error) {
    console.warn(`Redis write failed: ${errorMessage(error)}`);
  }
}
