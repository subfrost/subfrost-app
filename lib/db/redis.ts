/**
 * Redis client singleton using ioredis
 *
 * Provides a reusable Redis connection for caching and pub/sub.
 * Configured for Google Cloud Memorystore via private VPC.
 *
 * Environment variables:
 * - REDIS_HOST: Redis instance IP (e.g., 10.x.x.x)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Optional auth password
 */
import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD;

  if (!host) {
    console.warn('[Redis] REDIS_HOST not configured, using mock client');
    // Return a mock client for development without Redis
    return new Redis({
      host: 'localhost',
      port: 6379,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    });
  }

  const client = new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('[Redis] Max retry attempts reached');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('connect', () => {
    console.log('[Redis] Connected to', host);
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

/**
 * Cache helper with automatic JSON serialization
 */
export const cache = {
  /**
   * Get a cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.error('[Cache] Get error:', err);
      return null;
    }
  },

  /**
   * Set a cached value with optional TTL (in seconds)
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }
    } catch (err) {
      console.error('[Cache] Set error:', err);
    }
  },

  /**
   * Delete a cached value
   */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (err) {
      console.error('[Cache] Del error:', err);
    }
  },

  /**
   * Get or set pattern - fetch from cache or compute and store
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  },
};

export default redis;
