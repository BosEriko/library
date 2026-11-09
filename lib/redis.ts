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

export async function increment(key: string, ttlSeconds: number): Promise<number | null> {
  const redis = await getRedis();

  if (!redis) {
    return null;
  }

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, ttlSeconds);
    }

    return count;
  } catch (error) {
    console.warn(`Redis increment failed: ${errorMessage(error)}`);

    return null;
  }
}

export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = await getRedis();

  if (!redis) {
    return true;
  }

  try {
    return (await redis.set(key, "1", "EX", ttlSeconds, "NX")) === "OK";
  } catch (error) {
    console.warn(`Redis lock failed: ${errorMessage(error)}`);

    return true;
  }
}

export async function releaseLock(key: string): Promise<void> {
  const redis = await getRedis();

  if (!redis) {
    return;
  }

  try {
    await redis.del(key);
  } catch (error) {
    console.warn(`Redis unlock failed: ${errorMessage(error)}`);
  }
}
