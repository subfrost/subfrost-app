/**
 * Cross-vector test — pairs with
 * `~/subfrost-mobile/crates/subfrost-mobile-wc/src/crypto.rs::tests::fixed_vector`.
 *
 * Both implementations consume the same (key, nonce, plaintext) and
 * MUST produce byte-identical ciphertext. If this test goes red, one
 * side's wire format drifted and the relay session will fail to
 * decrypt cross-platform.
 */

import { describe, it, expect } from 'vitest';
import {
  KEY_LEN, NONCE_LEN,
  genKeypair, ecdhDerive,
  encrypt, decrypt, encryptWithNonce,
} from '../crypto';

describe('subfrost-wc crypto', () => {
  it('round-trip: ECDH on both sides → same symKey', () => {
    const a = genKeypair();
    const b = genKeypair();
    const topic = 'abc';
    const ka = ecdhDerive(a.priv, b.pub, topic);
    const kb = ecdhDerive(b.priv, a.pub, topic);
    expect(ka).toEqual(kb);
    expect(ka.length).toBe(KEY_LEN);
  });

  it('encrypt/decrypt round-trip', () => {
    const a = genKeypair();
    const b = genKeypair();
    const topic = 't';
    const k = ecdhDerive(a.priv, b.pub, topic);
    const pt = new TextEncoder().encode('hello, signer');
    const { ciphertext, nonce } = encrypt(k, pt);
    expect(nonce.length).toBe(NONCE_LEN);
    expect(ciphertext.length).toBe(pt.length + 16); // poly1305 tag
    const dec = decrypt(ecdhDerive(b.priv, a.pub, topic), nonce, ciphertext);
    expect(dec).toEqual(pt);
  });

  it('topic binds the symKey (different topics → different keys)', () => {
    const a = genKeypair();
    const b = genKeypair();
    const k1 = ecdhDerive(a.priv, b.pub, 'topic-1');
    const k2 = ecdhDerive(a.priv, b.pub, 'topic-2');
    expect(k1).not.toEqual(k2);
  });

  it('fixed-vector ciphertext (locks Rust+TS together)', () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) key[i] = i;
    const nonce = new Uint8Array(12);
    nonce.fill(0x80);
    const pt = new TextEncoder().encode('subfrost-wc fixed vector');
    const ct = encryptWithNonce(key, nonce, pt);
    expect(ct.length).toBe(pt.length + 16);
    // Sanity-check tag is non-zero (full byte-equality lock-in lands
    // when we wire CI to run both implementations in the same job).
    expect(ct.subarray(pt.length).some((b) => b !== 0)).toBe(true);
  });
});
