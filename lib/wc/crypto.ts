/**
 * Subfrost-WC encryption — TS mirror of
 * `~/subfrost-mobile/crates/subfrost-mobile-wc/src/crypto.rs`. The
 * fixed-vector test in `__tests__/crypto.test.ts` runs the same
 * input through both sides and asserts byte-identical output, so a
 * bug in either layer breaks CI on both projects.
 *
 * Crypto stack:
 *   - X25519 ECDH:        @noble/curves/ed25519 (x25519 module)
 *   - HKDF-SHA256:        @noble/hashes/hkdf
 *   - ChaCha20-Poly1305:  @noble/ciphers/chacha
 *
 * @noble is what the existing subfrost-app already uses for
 * keystore + signature work, so no new transitive deps.
 */

import { x25519 } from '@noble/curves/ed25519';
// @noble/hashes 2.x and @noble/ciphers 2.x require the `.js` suffix on
// subpath imports because their package.json `exports` maps only the
// `.js` keys (no extensionless aliases). Without the suffix tsc errors
// "Cannot find module" and the Next.js Docker build fails. Don't drop
// the `.js` here unless the deps are bumped to a version that adds
// extensionless aliases.
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { base64urlnopad } from '@scure/base';

export const KEY_LEN = 32;
export const NONCE_LEN = 12;
const HKDF_SALT = new TextEncoder().encode('subfrost-wc-v1');

export interface KeyPair {
  /** 32-byte private scalar. Memory-only — never persisted. */
  priv: Uint8Array;
  /** 32-byte X25519 public point. Goes on the wire. */
  pub:  Uint8Array;
}

/** Generate a fresh ephemeral X25519 keypair. */
export function genKeypair(): KeyPair {
  const priv = randomBytes(32);
  const pub  = x25519.getPublicKey(priv);
  return { priv, pub };
}

/** Derive the per-pairing symmetric key. Mirrors the Rust
 *  `ecdh_derive` exactly: HKDF-SHA256 over the ECDH shared secret
 *  with salt = "subfrost-wc-v1" and info = topic_bytes. */
export function ecdhDerive(myPriv: Uint8Array, theirPub: Uint8Array, topic: string): Uint8Array {
  const shared = x25519.getSharedSecret(myPriv, theirPub);
  const info   = new TextEncoder().encode(topic);
  return hkdf(sha256, shared, HKDF_SALT, info, KEY_LEN);
}

/** Encrypt with a random 12-byte nonce. Returns `{ciphertext, nonce}`
 *  as raw bytes; the wire envelopes encode them as base64url. */
export function encrypt(symKey: Uint8Array, plaintext: Uint8Array): {
  ciphertext: Uint8Array;
  nonce:      Uint8Array;
} {
  if (symKey.length !== KEY_LEN) throw new Error(`key length must be ${KEY_LEN}`);
  const nonce = randomBytes(NONCE_LEN);
  const aead = chacha20poly1305(symKey, nonce);
  const ciphertext = aead.encrypt(plaintext);
  return { ciphertext, nonce };
}

/** Encrypt with a caller-supplied nonce — used by the cross-vector
 *  test. Production callers always use `encrypt`. */
export function encryptWithNonce(
  symKey:    Uint8Array,
  nonce:     Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  if (symKey.length !== KEY_LEN) throw new Error(`key length must be ${KEY_LEN}`);
  if (nonce.length !== NONCE_LEN) throw new Error(`nonce length must be ${NONCE_LEN}`);
  return chacha20poly1305(symKey, nonce).encrypt(plaintext);
}

export function decrypt(symKey: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  if (symKey.length !== KEY_LEN) throw new Error(`key length must be ${KEY_LEN}`);
  if (nonce.length !== NONCE_LEN) throw new Error(`nonce length must be ${NONCE_LEN}`);
  return chacha20poly1305(symKey, nonce).decrypt(ciphertext);
}

// ── base64url helpers ─────────────────────────────────────────────

export function pubToB64Url(pub: Uint8Array): string {
  return base64urlnopad.encode(pub);
}

export function pubFromB64Url(s: string): Uint8Array {
  const bytes = base64urlnopad.decode(s.trim());
  if (bytes.length !== 32) throw new Error(`bad pub len: ${bytes.length}`);
  return bytes;
}

export function bytesToB64Url(b: Uint8Array): string {
  return base64urlnopad.encode(b);
}

export function bytesFromB64Url(s: string): Uint8Array {
  return base64urlnopad.decode(s.trim());
}
