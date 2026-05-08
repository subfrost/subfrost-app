/**
 * push.subfrost.io — config. Mirrors wc-relay's config.ts shape so
 * both services share env-handling intuition.
 */

const optional = (name: string, fallback: string): string =>
  process.env[name] ?? fallback;

export const config = {
  port: Number(optional('PORT', '8080')),

  /** Cloud SQL Postgres for the device-token table. */
  pgUrl: process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/subfrost',

  /** Firebase service-account JSON path. Cloud Run mounts via Secret
   *  Manager; local dev points at a file in ~/.config. */
  fcmKeyPath: optional('FCM_KEY_PATH', '/secrets/subfrost-fcm/service-account.json'),

  /** Bearer token wc-relay uses to call /v1/push/wake/{topic}. Same
   *  value baked into the Cloud Run secret manager + the wc-relay env. */
  pushAuthToken: process.env.PUSH_AUTH_TOKEN ?? null,

  /** When true, log every send + register call. */
  verbose: process.env.VERBOSE === '1',
};

export type Config = typeof config;
