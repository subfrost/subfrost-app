/**
 * Runtime config — env-derived. The relay never logs secrets so we can
 * keep most of these as plain `process.env` reads, but we centralize
 * them here so missing-required values fail loudly at boot.
 */

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env: ${name}`);
  return v;
};

const optional = (name: string, fallback: string): string =>
  process.env[name] ?? fallback;

export const config = {
  /** HTTP/WS port — Cloud Run injects PORT=8080. */
  port: Number(optional('PORT', '8080')),

  /** Redis connection URL. Defaults to local for dev. */
  redisUrl: optional('REDIS_URL', 'redis://127.0.0.1:6379'),

  /** Cloud SQL Postgres for permanent pairings. Optional in dev — when
   *  unset the relay stays Redis-only and pairings expire with the TTL. */
  pgUrl: process.env.DATABASE_URL ?? null,

  /** Internal endpoint of the push-relay (sibling Cloud Run service).
   *  When unset the relay simply doesn't fire wake-pushes; the mobile
   *  long-polls instead. Useful for local dev. */
  pushUrl: process.env.PUSH_RELAY_URL ?? null,

  /** Shared secret between wc-relay and push-relay (Bearer header). */
  pushAuthToken: process.env.PUSH_AUTH_TOKEN ?? null,

  /** TTL on pending requests in Redis. 30s matches the FCM ttl on the
   *  data push — beyond this the request is stale and the user needs
   *  to resubmit from the webapp. */
  reqTtlSeconds: Number(optional('REQ_TTL_SECONDS', '30')),

  /** TTL on the session→ws topic key. The webapp's WSS connection
   *  refreshes this on every read, so the only thing this protects
   *  against is leaked-and-abandoned sessions. */
  sessionTtlSeconds: Number(optional('SESSION_TTL_SECONDS', '3600')),

  /** Per-origin rate-limit (requests/minute) on POST /sessions/{topic}/req.
   *  Blocks a malicious dApp from spamming sign requests after pairing. */
  reqRateLimitPerMinute: Number(optional('REQ_RATE_LIMIT_PER_MINUTE', '10')),

  /** When true, log every websocket message + http request (without
   *  payloads). Useful in dev; off in prod. */
  verbose: process.env.VERBOSE === '1',
};

export type Config = typeof config;
