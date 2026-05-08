/**
 * Redis-backed session + request store. Multi-replica safe: every
 * relay instance reads/writes the same Redis. The in-process map of
 * topic → ws is purely an optimisation; cross-replica delivery falls
 * back to a Redis Pub/Sub broadcast (added in Pass 6 when we go
 * multi-replica).
 *
 * Keys:
 *   sf:wc:session:<topic>     hash      pairing record
 *   sf:wc:req:<topic>:<rid>   string    JSON PendingRequest
 *   sf:wc:rate:<origin>:<min> int       sliding rate-limit counter
 */

import Redis from 'ioredis';
import { config } from './config';
import { PairingRecord, PendingRequest } from './types';

const KEY_SESSION = (topic: string) => `sf:wc:session:${topic}`;
const KEY_REQ     = (topic: string, rid: string) => `sf:wc:req:${topic}:${rid}`;
const KEY_RATE    = (origin: string, min: number) => `sf:wc:rate:${origin}:${min}`;

export class Store {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(config.redisUrl, {
      // Cloud Run cold-starts mean the first request can race the
      // initial connection; allow auto-reconnect with exponential
      // backoff capped at 2s.
      retryStrategy: (times) => Math.min(times * 100, 2_000),
      maxRetriesPerRequest: 3,
    });
    this.redis.on('error', (e) => console.error('[redis]', e.message));
  }

  /** Save / refresh a pairing. Resets the TTL on each call. */
  async putSession(rec: PairingRecord): Promise<void> {
    await this.redis.set(
      KEY_SESSION(rec.topic),
      JSON.stringify(rec),
      'EX',
      config.sessionTtlSeconds,
    );
  }

  async getSession(topic: string): Promise<PairingRecord | null> {
    const raw = await this.redis.get(KEY_SESSION(topic));
    return raw ? (JSON.parse(raw) as PairingRecord) : null;
  }

  async deleteSession(topic: string): Promise<void> {
    await this.redis.del(KEY_SESSION(topic));
  }

  async putRequest(req: PendingRequest): Promise<void> {
    await this.redis.set(
      KEY_REQ(req.topic, req.request_id),
      JSON.stringify(req),
      'EX',
      config.reqTtlSeconds,
    );
  }

  /** One-shot fetch — deletes after read so a malicious mobile can't
   *  poll the same request multiple times. */
  async takeRequest(topic: string, rid: string): Promise<PendingRequest | null> {
    const key = KEY_REQ(topic, rid);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return JSON.parse(raw) as PendingRequest;
  }

  /** Sliding 1-minute rate limit. Returns the new count; caller
   *  rejects above the per-origin ceiling. */
  async incrRate(origin: string): Promise<number> {
    const minute = Math.floor(Date.now() / 60_000);
    const key = KEY_RATE(origin, minute);
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 90);
    return n;
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
