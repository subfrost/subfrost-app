/**
 * Wire types for the wc-relay protocol. The relay handles three
 * message families:
 *
 * 1. **WSS frames** (browser ↔ relay) — typed by `event` field.
 * 2. **HTTP routes** (mobile ↔ relay) — JSON request bodies.
 * 3. **Internal push** (relay → push-relay) — JSON wake payload.
 *
 * Everything that crosses an actual network is described here so a
 * single TS source-of-truth covers both sides of any wire we
 * introduce. The relay never inspects the encrypted payload — it
 * routes on `topic` and ferries `ciphertext + nonce` blobs.
 */

// ── 1. WSS frames ─────────────────────────────────────────────────

export type WsClientFrame =
  | { event: 'init';        topic: string; webapp_pub: string }
  | { event: 'subscribe';   topic: string };

export type WsServerFrame =
  | { event: 'init_ack';    topic: string }
  | { event: 'accepted';    topic: string; mobile_pub: string }
  | { event: 'response';    topic: string; request_id: string; ciphertext: string; nonce: string }
  | { event: 'error';       topic?: string; reason: string }
  | { event: 'pairing_revoked'; topic: string };

// ── 2. HTTP request/response shapes ───────────────────────────────

export interface AcceptBody {
  /** Mobile's X25519 public key, base64url-encoded. */
  mobile_pub: string;
  /** FCM token for the device. May be empty if mobile is dev-mode. */
  fcm_token?: string;
  /** Origin the user authorized this pairing for. */
  origin: string;
  /** Coarse permissions the user granted: "psbt", "msg", "accts". */
  permissions: string[];
}

export interface ReqBody {
  ciphertext: string;
  nonce:      string;
  origin:     string;       // unencrypted for rate-limit; checked again inside the encrypted payload
  request_id: string;       // chosen by webapp, echoed in response
}

export interface RespBody {
  ciphertext: string;
  nonce:      string;
}

// ── 3. Internal: relay → push-relay ───────────────────────────────

export interface WakePushBody {
  topic:      string;
  request_id: string;
}

// ── 4. Persistent / Redis records ─────────────────────────────────

/** What we remember for a pairing that has been accepted. Stored both
 *  in Redis (TTL) and in Cloud SQL (permanent) once the pairing
 *  completes. */
export interface PairingRecord {
  topic:        string;
  webapp_pub:   string;
  mobile_pub:   string;
  origin:       string;
  permissions:  string[];
  fcm_token:    string | null;
  created_at:   number;       // unix ms
  last_used_at: number;
}

/** A pending request waiting on the mobile to fetch + respond. */
export interface PendingRequest {
  topic:      string;
  request_id: string;
  ciphertext: string;
  nonce:      string;
  origin:     string;
  created_at: number;
}
