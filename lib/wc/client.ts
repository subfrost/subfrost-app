/**
 * subfrost-wc client — webapp side. Owns the WSS to wc.subfrost.io,
 * the X25519 ephemeral keypair, and the per-pairing symmetric key.
 *
 * Surface:
 *   - `connect(opts)` returns `{ pairingUri, accepted }` where
 *     `accepted` is a Promise that resolves to a `WcSession` once
 *     the mobile scans + approves.
 *   - `WcSession.signPsbt(hex)` / `signMessage(msg, addr)` /
 *     `getAccounts()` send encrypted requests + await responses.
 *   - `WcSession.disconnect()` DELETEs the relay row.
 */

import {
  KEY_LEN, NONCE_LEN,
  genKeypair, ecdhDerive,
  encrypt, decrypt,
  pubToB64Url, pubFromB64Url,
  bytesFromB64Url, bytesToB64Url,
} from './crypto';
import { Plaintext } from './types';

export interface ConnectOptions {
  /** Defaults to `wss://wc.subfrost.io/`. Override for devnet/local. */
  relayUrl?: string;
  /** Origin we're advertising to the mobile during pairing. Defaults
   *  to `window.location.origin`. */
  origin?: string;
}

export interface PairingResult {
  /** The QR-encoded pairing URI. Render this in a QR for the mobile
   *  to scan. */
  pairingUri: string;
  /** Resolves to a connected `WcSession` once the mobile approves.
   *  Rejects on relay error / timeout / mobile-reject. */
  accepted:   Promise<WcSession>;
  /** Manually abort the pair-in-progress. */
  cancel:     () => void;
}

export class WcSession {
  readonly topic:     string;
  readonly origin:    string;
  readonly addresses: string[];     // populated on first getAccounts()
  private  symKey:    Uint8Array;
  private  ws:        WebSocket;
  private  inflight:  Map<string, { resolve: (p: Plaintext) => void; reject: (e: Error) => void }>;

  constructor(opts: {
    topic:    string;
    origin:   string;
    symKey:   Uint8Array;
    ws:       WebSocket;
  }) {
    this.topic     = opts.topic;
    this.origin    = opts.origin;
    this.symKey    = opts.symKey;
    this.ws        = opts.ws;
    this.addresses = [];
    this.inflight  = new Map();
    this.ws.addEventListener('message', (e) => this.onWsMessage(e));
  }

  private onWsMessage(e: MessageEvent): void {
    let frame: any;
    try { frame = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    if (frame.event === 'response') {
      const ent = this.inflight.get(frame.request_id);
      if (!ent) return;
      this.inflight.delete(frame.request_id);
      try {
        const ct = bytesFromB64Url(frame.ciphertext);
        const nn = bytesFromB64Url(frame.nonce);
        const pt = decrypt(this.symKey, nn, ct);
        const obj: Plaintext = JSON.parse(new TextDecoder().decode(pt));
        ent.resolve(obj);
      } catch (err) {
        ent.reject(err as Error);
      }
    } else if (frame.event === 'pairing_revoked') {
      // Reject everything in flight.
      for (const ent of this.inflight.values()) ent.reject(new Error('pairing_revoked'));
      this.inflight.clear();
    }
  }

  private async sendRequest(plaintext: Plaintext): Promise<Plaintext> {
    const requestId = (plaintext as any).request_id;
    const ptBytes = new TextEncoder().encode(JSON.stringify(plaintext));
    const { ciphertext, nonce } = encrypt(this.symKey, ptBytes);
    const url = new URL(this.ws.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'));
    const base = `${url.origin}/v1/sessions/${encodeURIComponent(this.topic)}/req`;
    const r = await fetch(base, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ciphertext: bytesToB64Url(ciphertext),
        nonce:      bytesToB64Url(nonce),
        origin:     this.origin,
        request_id: requestId,
      }),
    });
    if (!r.ok) throw new Error(`wc relay req ${r.status}`);
    return new Promise((resolve, reject) => {
      this.inflight.set(requestId, { resolve, reject });
      // 5-minute timeout — user has to approve on phone.
      setTimeout(() => {
        const ent = this.inflight.get(requestId);
        if (ent) {
          this.inflight.delete(requestId);
          ent.reject(new Error('sign request timed out'));
        }
      }, 5 * 60_000);
    });
  }

  async signPsbt(psbtHex: string, addresses: string[] = []): Promise<string> {
    const requestId = crypto.randomUUID();
    const resp = await this.sendRequest({
      type: 'sign_psbt', psbt_hex: psbtHex, addresses,
      request_id: requestId, origin: this.origin,
    });
    if (resp.type === 'result') return resp.result;
    if (resp.type === 'error')  throw new Error(`wc:${resp.code} ${resp.message}`);
    throw new Error(`wc unexpected response: ${(resp as any).type}`);
  }

  async signMessage(message: string, address: string): Promise<string> {
    const requestId = crypto.randomUUID();
    const resp = await this.sendRequest({
      type: 'sign_message', message, address,
      request_id: requestId, origin: this.origin,
    });
    if (resp.type === 'result') return resp.result;
    if (resp.type === 'error')  throw new Error(`wc:${resp.code} ${resp.message}`);
    throw new Error(`wc unexpected response: ${(resp as any).type}`);
  }

  async getAccounts(): Promise<string[]> {
    const requestId = crypto.randomUUID();
    const resp = await this.sendRequest({
      type: 'get_accounts', request_id: requestId, origin: this.origin,
    });
    if (resp.type === 'accounts') {
      this.addresses.splice(0, this.addresses.length, ...resp.addresses);
      return resp.addresses;
    }
    if (resp.type === 'error')   throw new Error(`wc:${resp.code} ${resp.message}`);
    throw new Error(`wc unexpected response: ${(resp as any).type}`);
  }

  async disconnect(): Promise<void> {
    this.ws.close();
    const url = this.ws.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    const u = new URL(url);
    await fetch(`${u.origin}/v1/sessions/${encodeURIComponent(this.topic)}`, { method: 'DELETE' });
  }
}

export function connect(opts: ConnectOptions = {}): PairingResult {
  const relayUrl = opts.relayUrl ?? 'wss://wc.subfrost.io/';
  const origin   = opts.origin   ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const topic    = crypto.randomUUID();
  const kp       = genKeypair();
  const ws       = new WebSocket(relayUrl);

  const acceptedPromise = new Promise<WcSession>((resolve, reject) => {
    let cancelled = false;
    ws.addEventListener('open', () => {
      if (cancelled) return;
      ws.send(JSON.stringify({ event: 'init', topic, webapp_pub: pubToB64Url(kp.pub) }));
    });
    ws.addEventListener('error', (e) => {
      if (!cancelled) reject(new Error('wc relay ws error'));
    });
    ws.addEventListener('message', (e) => {
      let frame: any;
      try { frame = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
      if (frame.event === 'accepted') {
        const mobilePub = pubFromB64Url(frame.mobile_pub);
        const symKey    = ecdhDerive(kp.priv, mobilePub, topic);
        resolve(new WcSession({ topic, origin, symKey, ws }));
      }
    });
    // 5-minute pair window
    const t = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      try { ws.close(); } catch {}
      reject(new Error('pairing timed out — user did not scan in time'));
    }, 5 * 60_000);
    return () => clearTimeout(t);
  });

  const pairingUri =
    `subfrost://wc/${topic}` +
    `?key=${encodeURIComponent(pubToB64Url(kp.pub))}` +
    `&relay=${encodeURIComponent(relayUrl)}` +
    `&origin=${encodeURIComponent(origin)}`;

  return {
    pairingUri,
    accepted: acceptedPromise,
    cancel:   () => { try { ws.close(); } catch {} },
  };
}
