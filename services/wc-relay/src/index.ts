/**
 * wc.subfrost.io — relay-server entry point.
 *
 * Routes encrypted messages between subfrost-app (browser, WSS) and
 * subfrost-mobile (Android, HTTP polled / FCM-woken). Never sees
 * plaintext — every wire payload is `{ciphertext, nonce}` after Pass
 * 3. This Pass-1 skeleton just gets the routing topology + smoke
 * test in place; encryption + auth are layered in subsequent passes.
 */

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config';
import { Store } from './store';
import {
  WsClientFrame, WsServerFrame,
  AcceptBody, ReqBody, RespBody, WakePushBody,
  PairingRecord, PendingRequest,
} from './types';
import { v4 as uuid } from 'uuid';

const store = new Store();

// Per-replica in-memory map of topic → live websocket. Used to push
// `accepted` / `response` events to the webapp without polling. On a
// multi-replica rollout we'll add Redis pub/sub fan-out (Pass 6) but
// in the single-replica Cloud Run default this is sufficient.
const wsByTopic = new Map<string, WebSocket>();

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '64kb' }));

// ── HTTP routes ───────────────────────────────────────────────────

app.get('/v1/health', async (_req, res) => {
  try {
    const pong = await store.ping();
    res.json({ ok: pong === 'PONG' });
  } catch (e: any) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

/** Mobile accepts a pairing the user just scanned. Stores the pairing
 *  record (mobile_pub + fcm_token + permissions) keyed by topic, then
 *  notifies the still-connected webapp via WSS that the pairing
 *  completed. */
app.post('/v1/sessions/:topic/accept', async (req, res) => {
  const topic = String(req.params.topic);
  const body = req.body as AcceptBody;
  if (!body?.mobile_pub || !body?.origin || !Array.isArray(body?.permissions)) {
    return res.status(400).json({ error: 'malformed accept body' });
  }
  // Pull the partial session the webapp opened with `init`. If the
  // webapp disconnected between QR-render and mobile-scan, we still
  // accept and remember; the next webapp WSS reconnect with the same
  // topic resumes the pair (within sessionTtlSeconds).
  const existing = await store.getSession(topic);
  if (!existing) {
    return res.status(410).json({ error: 'pairing window expired' });
  }
  const now = Date.now();
  const rec: PairingRecord = {
    topic,
    webapp_pub:   existing.webapp_pub,
    mobile_pub:   body.mobile_pub,
    origin:       body.origin,
    permissions:  body.permissions.slice(0, 8),
    fcm_token:    body.fcm_token ?? null,
    created_at:   existing.created_at || now,
    last_used_at: now,
  };
  await store.putSession(rec);

  // Notify webapp WSS if still connected.
  const webappWs = wsByTopic.get(topic);
  if (webappWs && webappWs.readyState === WebSocket.OPEN) {
    const frame: WsServerFrame = { event: 'accepted', topic, mobile_pub: rec.mobile_pub };
    webappWs.send(JSON.stringify(frame));
  }
  res.json({ ok: true });
});

/** Webapp posts an encrypted sign request. Relay queues the
 *  ciphertext in Redis with a short TTL and pings the push-relay so
 *  the mobile gets an FCM wake-up. */
app.post('/v1/sessions/:topic/req', async (req, res) => {
  const topic = String(req.params.topic);
  const body = req.body as ReqBody;
  if (!body?.ciphertext || !body?.nonce || !body?.origin || !body?.request_id) {
    return res.status(400).json({ error: 'malformed req body' });
  }
  const session = await store.getSession(topic);
  if (!session) {
    return res.status(404).json({ error: 'unknown session' });
  }
  if (session.origin !== body.origin) {
    return res.status(403).json({ error: 'origin mismatch with pairing' });
  }
  const rate = await store.incrRate(body.origin);
  if (rate > config.reqRateLimitPerMinute) {
    return res.status(429).json({ error: 'rate limit' });
  }

  const pending: PendingRequest = {
    topic,
    request_id: body.request_id,
    ciphertext: body.ciphertext,
    nonce:      body.nonce,
    origin:     body.origin,
    created_at: Date.now(),
  };
  await store.putRequest(pending);

  // Best-effort wake-push. Failure here doesn't fail the request —
  // mobile can also poll. But on a real pair the FCM wake is what
  // makes the UX feel snappy.
  if (config.pushUrl && config.pushAuthToken && session.fcm_token) {
    fireWakePush(topic, body.request_id).catch((e) =>
      console.error('[wc] wake push failed:', e.message),
    );
  }
  res.json({ ok: true });
});

/** Non-destructive list of every pending request for `topic`. Used by
 *  the mobile foreground-service polling loop on devices without FCM
 *  to discover request_ids without consuming them — caller then hits
 *  `/v1/sessions/:topic/req/:rid` per row to take them.
 *
 *  Single-tenant per-topic auth is implicit: the topic UUID itself is
 *  random + only known to the paired mobile + webapp, so a third
 *  party can't enumerate by guessing topics.
 */
app.get('/v1/sessions/:topic/pending', async (req, res) => {
  const topic = String(req.params.topic);
  const session = await store.getSession(topic);
  if (!session) return res.status(404).json({ error: 'unknown session' });
  const items = await store.listPending(topic);
  res.json({
    pending: items.map((p) => ({
      request_id: p.request_id,
      ciphertext: p.ciphertext,
      nonce:      p.nonce,
      origin:     p.origin,
      created_at: p.created_at,
    })),
  });
});

/** Mobile fetches the pending request once it has been woken. Server
 *  deletes the request after read — single-shot semantics so a
 *  malicious mobile can't replay. */
app.get('/v1/sessions/:topic/req/:rid', async (req, res) => {
  const topic = String(req.params.topic);
  const rid   = String(req.params.rid);
  const pending = await store.takeRequest(topic, rid);
  if (!pending) {
    return res.status(404).json({ error: 'no pending request' });
  }
  res.json({
    ciphertext: pending.ciphertext,
    nonce:      pending.nonce,
    origin:     pending.origin,
    created_at: pending.created_at,
  });
});

/** Mobile posts the encrypted response. Relay forwards it to the
 *  webapp WSS; the webapp's local promise (in SubfrostMobileAdapter)
 *  resolves on `event:'response'`. */
app.post('/v1/sessions/:topic/resp/:rid', async (req, res) => {
  const topic = String(req.params.topic);
  const rid   = String(req.params.rid);
  const body  = req.body as RespBody;
  if (!body?.ciphertext || !body?.nonce) {
    return res.status(400).json({ error: 'malformed resp body' });
  }
  const ws = wsByTopic.get(topic);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(410).json({ error: 'webapp not connected; response dropped' });
  }
  const frame: WsServerFrame = {
    event:      'response',
    topic,
    request_id: rid,
    ciphertext: body.ciphertext,
    nonce:      body.nonce,
  };
  ws.send(JSON.stringify(frame));
  res.json({ ok: true });
});

/** Mobile revokes a pairing. Drops the Redis session + signals the
 *  webapp WSS so it knows to disconnect. */
app.delete('/v1/sessions/:topic', async (req, res) => {
  const topic = String(req.params.topic);
  await store.deleteSession(topic);
  const ws = wsByTopic.get(topic);
  if (ws && ws.readyState === WebSocket.OPEN) {
    const frame: WsServerFrame = { event: 'pairing_revoked', topic };
    ws.send(JSON.stringify(frame));
  }
  res.json({ ok: true });
});

// ── WebSocket — webapp side ───────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/' });

wss.on('connection', (ws) => {
  let topic: string | null = null;

  ws.on('message', async (data) => {
    let frame: WsClientFrame;
    try {
      frame = JSON.parse(data.toString()) as WsClientFrame;
    } catch {
      return ws.send(JSON.stringify({ event: 'error', reason: 'invalid json' }));
    }

    if (frame.event === 'init') {
      // First-time pair — webapp generates topic + ephemeral pub.
      // We stash a partial session record so that when the mobile
      // POSTs `accept` we have the webapp_pub to round-trip back to
      // the connected ws.
      topic = frame.topic;
      const partial: PairingRecord = {
        topic,
        webapp_pub:   frame.webapp_pub,
        mobile_pub:   '',     // filled in on `accept`
        origin:       '',     // filled in on `accept`
        permissions:  [],
        fcm_token:    null,
        created_at:   Date.now(),
        last_used_at: Date.now(),
      };
      await store.putSession(partial);
      wsByTopic.set(topic, ws);
      const ack: WsServerFrame = { event: 'init_ack', topic };
      ws.send(JSON.stringify(ack));
      if (config.verbose) console.log(`[ws] init topic=${topic}`);
    } else if (frame.event === 'subscribe') {
      // Webapp reconnect — bind the existing topic to this ws.
      topic = frame.topic;
      wsByTopic.set(topic, ws);
      if (config.verbose) console.log(`[ws] subscribe topic=${topic}`);
    } else {
      ws.send(JSON.stringify({ event: 'error', reason: 'unknown event' }));
    }
  });

  ws.on('close', () => {
    if (topic && wsByTopic.get(topic) === ws) {
      wsByTopic.delete(topic);
      if (config.verbose) console.log(`[ws] close topic=${topic}`);
    }
  });
});

// ── push-relay client ─────────────────────────────────────────────

async function fireWakePush(topic: string, request_id: string): Promise<void> {
  const body: WakePushBody = { topic, request_id };
  const r = await fetch(`${config.pushUrl}/v1/push/wake/${encodeURIComponent(topic)}`, {
    method:  'POST',
    headers: {
      'content-type':  'application/json',
      'authorization': `Bearer ${config.pushAuthToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`push-relay ${r.status}`);
}

// ── boot ──────────────────────────────────────────────────────────

server.listen(config.port, () => {
  console.log(`[wc-relay] listening on :${config.port}`);
});

process.on('SIGTERM', async () => {
  console.log('[wc-relay] SIGTERM — closing');
  server.close(() => {
    store.close().then(() => process.exit(0));
  });
});
