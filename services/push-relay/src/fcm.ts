/**
 * Firebase Admin v1 push sender. Direct port of
 * `~/project-ghost/services/ghost-api/src.ts/asterisk/fcm.ts` — the
 * same JWT-assertion → access-token → POST messages:send flow,
 * adapted for the wc-request wake payload shape.
 *
 * Why no Firebase Admin SDK? The SDK pulls in 50MB of unrelated junk
 * (auth, firestore, storage). All we need is OAuth via service-account
 * + one POST. Everything fits in ~80 lines.
 */

import * as fs from 'fs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { config } from './config';

interface ServiceAccountKey {
  client_email: string;
  private_key:  string;
  project_id:   string;
  token_uri:    string;
}

let cachedKey:   ServiceAccountKey | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function loadKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const path = config.fcmKeyPath;
  if (!path || !fs.existsSync(path)) {
    throw new Error(`FCM service-account key not found at ${path}`);
  }
  cachedKey = JSON.parse(fs.readFileSync(path, 'utf-8'));
  return cachedKey!;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const key = loadKey();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss:   key.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud:   key.token_uri,
      iat:   now,
      exp:   now + 3600,
    },
    key.private_key,
    { algorithm: 'RS256' },
  );
  const resp = await axios.post(
    key.token_uri,
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  cachedToken = {
    value:     resp.data.access_token,
    expiresAt: Date.now() + resp.data.expires_in * 1000,
  };
  return cachedToken.value;
}

export interface WakePayload {
  topic:      string;
  request_id: string;
}

/** Send a HIGH-priority data-only push that wakes the device for a
 *  pending wc-request. Data-only (no notification block) so the
 *  device's FirebaseMessagingService runs even in Doze; the mobile
 *  service builds the user-facing notification once it has fetched +
 *  decrypted the request. ttl 30s matches the wc-relay's queue TTL —
 *  if the device misses the window the user resubmits from the
 *  webapp. */
export async function sendWakePush(token: string, payload: WakePayload): Promise<void> {
  const accessToken = await getAccessToken();
  const key = loadKey();

  const body = {
    message: {
      token,
      data: {
        type:       'wc_request',
        topic:      payload.topic,
        request_id: payload.request_id,
        ts:         String(Date.now()),
      },
      android: {
        priority: 'HIGH' as const,
        ttl:      '30s',
      },
    },
  };

  await axios.post(
    `https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,
    body,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
    },
  );
  if (config.verbose) {
    console.log('[fcm] sent', { topic: payload.topic, rid: payload.request_id });
  }
}

/** Token validity check — strips invalid/expired tokens so we don't
 *  keep firing pushes at dead devices. The push-relay returns a 410
 *  on the wake call when this fires so wc-relay can lazily prune. */
export function isUnregisteredError(err: any): boolean {
  const code = err?.response?.data?.error?.status;
  return code === 'NOT_FOUND' || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT';
}
