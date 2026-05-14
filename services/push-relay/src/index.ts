/**
 * push.subfrost.io — entry point. Two responsibilities:
 *
 *   1. Mobile clients register their FCM token under a pairing topic
 *      via POST /v1/devices/fcm-token. The pairing topic is shared
 *      out-of-band by the QR scan in wc-relay's flow; the push-relay
 *      doesn't authenticate the token registration beyond knowing
 *      the topic, because the topic is itself a 128-bit secret known
 *      only to the paired webapp + mobile.
 *
 *   2. wc-relay calls POST /v1/push/wake/{topic} (Bearer-auth via the
 *      shared PUSH_AUTH_TOKEN secret) when a webapp posts a sign
 *      request. We look up the token(s) for the topic and fire a
 *      data-only HIGH-priority push.
 */

import express from 'express';
import cors from 'cors';
import { config } from './config';
import { Store } from './store';
import { sendWakePush, isUnregisteredError } from './fcm';

const store = new Store();

async function boot(): Promise<void> {
  await store.init();
  const app = express();
  app.use(cors({ origin: true, credentials: false }));
  app.use(express.json({ limit: '8kb' }));

  app.get('/healthz', async (_req, res) => {
    try {
      await store['pool'].query('SELECT 1');
      res.json({ ok: true });
    } catch (e: any) {
      res.status(503).json({ ok: false, error: e.message });
    }
  });

  app.post('/v1/devices/fcm-token', async (req, res) => {
    const { topic, fcm_token, device_label, platform } = req.body ?? {};
    if (typeof topic !== 'string' || typeof fcm_token !== 'string') {
      return res.status(400).json({ error: 'topic + fcm_token required' });
    }
    try {
      await store.putToken(topic, fcm_token, device_label ?? null, platform ?? 'android');
      if (config.verbose) console.log('[reg] topic=', topic, 'token=', fcm_token.slice(0, 12), '…');
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[reg] failed', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/v1/push/wake/:topic', async (req, res) => {
    if (!config.pushAuthToken) {
      return res.status(503).json({ error: 'PUSH_AUTH_TOKEN not configured on server' });
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${config.pushAuthToken}`) {
      return res.status(403).json({ error: 'bad auth' });
    }
    const topic = String(req.params.topic);
    const { request_id } = req.body ?? {};
    if (typeof request_id !== 'string') {
      return res.status(400).json({ error: 'request_id required' });
    }
    const tokens = await store.getTokens(topic);
    if (tokens.length === 0) {
      return res.status(410).json({ error: 'no device tokens for topic' });
    }
    let sent = 0;
    for (const token of tokens) {
      try {
        await sendWakePush(token, { topic, request_id });
        sent++;
      } catch (e: any) {
        if (isUnregisteredError(e)) {
          console.warn('[wake] dropping dead token for', topic);
          await store.dropToken(topic, token);
        } else {
          console.error('[wake] send failed', e?.message);
        }
      }
    }
    res.json({ ok: sent > 0, sent });
  });

  app.listen(config.port, () => {
    console.log(`[push-relay] listening on :${config.port}`);
  });

  process.on('SIGTERM', async () => {
    console.log('[push-relay] SIGTERM');
    await store.close();
    process.exit(0);
  });
}

boot().catch((e) => {
  console.error('[push-relay] boot failed:', e);
  process.exit(1);
});
