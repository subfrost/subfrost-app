/**
 * Postgres-backed device token store. The schema mirrors ghost-api's
 * `device_push_tokens` table but the primary key is `(topic, fcm_token)`
 * because one mobile may pair with N webapps and one webapp may have
 * a wallet on N devices.
 */

import { Pool } from 'pg';
import { config } from './config';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS wc_device_push_tokens (
  topic         TEXT        NOT NULL,
  fcm_token     TEXT        NOT NULL,
  device_label  TEXT,
  platform      VARCHAR(20) NOT NULL DEFAULT 'android',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (topic, fcm_token)
);
CREATE INDEX IF NOT EXISTS wc_dpt_by_topic ON wc_device_push_tokens (topic);
`;

export class Store {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({ connectionString: config.pgUrl, max: 8 });
    this.pool.on('error', (e) => console.error('[pg]', e.message));
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  /** Upsert a device token. Idempotent — repeated registrations
   *  refresh `last_seen_at`. */
  async putToken(
    topic: string,
    fcm_token: string,
    device_label: string | null,
    platform: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO wc_device_push_tokens (topic, fcm_token, device_label, platform)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (topic, fcm_token) DO UPDATE
         SET last_seen_at = NOW(),
             device_label = EXCLUDED.device_label`,
      [topic, fcm_token, device_label, platform],
    );
  }

  /** Look up tokens for a topic. A topic typically has exactly one
   *  token but a re-paired device or token-rotation race may have
   *  >1; we send to all and let dead-token cleanup happen lazily. */
  async getTokens(topic: string): Promise<string[]> {
    const r = await this.pool.query(
      'SELECT fcm_token FROM wc_device_push_tokens WHERE topic = $1',
      [topic],
    );
    return r.rows.map((row) => row.fcm_token);
  }

  /** Drop a dead token after FCM 404'd. */
  async dropToken(topic: string, fcm_token: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM wc_device_push_tokens WHERE topic = $1 AND fcm_token = $2',
      [topic, fcm_token],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
