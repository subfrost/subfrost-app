/**
 * Redis client for caching pool data
 *
 * Uses the 'redis' package for Node.js Redis client.
 * Gracefully handles missing REDIS_URL by disabling caching.
 */
import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType | null> | null = null;

/**
 * Get or create Redis client (singleton)
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    // Caching disabled - return null silently in production
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Redis] REDIS_URL not configured, caching disabled');
    }
    return null;
  }

  if (client?.isOpen) {
    return client;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      client = createClient({ url: redisUrl });

      client.on('error', (err) => {
        console.error('[Redis] Client error:', err);
      });

      await client.connect();
      console.log('[Redis] Connected successfully');
      return client;
    } catch (error) {
      console.error('[Redis] Failed to connect:', error);
      client = null;
      connectionPromise = null;
      return null;
    }
  })();

  return connectionPromise;
}

/**
 * Get cached value with automatic JSON deserialization
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const value = await redis.get(key);
    if (!value) return null;

    return JSON.parse(value) as T;
  } catch (error) {
    console.error('[Redis] Cache get error:', error);
    return null;
  }
}

/**
 * Set cached value with automatic JSON serialization
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 60
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.error('[Redis] Cache set error:', error);
  }
}

/**
 * Delete cached value
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    await redis.del(key);
  } catch (error) {
    console.error('[Redis] Cache delete error:', error);
  }
}

/**
 * Delete multiple cached values by pattern
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error('[Redis] Cache delete pattern error:', error);
  }
}
