/**
 * FROST threshold signing helpers for devnet tests.
 *
 * Loads the frost-web-sys WASM module and provides:
 *   - FROST key generation (dealer-based, for local testing)
 *   - Group public key extraction (for P2TR address derivation)
 *   - Schnorr signature generation (full round1→round2→aggregate ceremony)
 *
 * Usage:
 *   const frost = await loadFrost();
 *   const keys = frost.generateKeys(3, 2);  // 3 signers, threshold 2
 *   const address = frost.deriveP2trAddress(keys);
 *   const sig = frost.signSighash(keys, sighash);
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as bitcoin from 'bitcoinjs-lib';

// Type for the frost-web-sys WASM module
interface FrostModule {
  generate_frost_keys(signers: number, threshold: number): string;
  get_group_public_key(bundleJson: string): Uint8Array;
  sign_sighash(bundleJson: string, sighash: Uint8Array): Uint8Array;
  initSync(wasmBytes: BufferSource): void;
}

let _frostModule: FrostModule | null = null;

/**
 * Load and initialize the frost-web-sys WASM module.
 * Returns a helper object with high-level FROST operations.
 */
export async function loadFrost(): Promise<FrostHelpers> {
  if (!_frostModule) {
    // Dynamic import of the ESM module
    const frostJs = await import('./fixtures/frost/frost_web_sys.js');

    // Load WASM bytes and initialize synchronously
    const wasmPath = resolve(__dirname, 'fixtures/frost/frost_web_sys_bg.wasm');
    const wasmBytes = readFileSync(wasmPath);
    frostJs.initSync(wasmBytes);

    _frostModule = frostJs as unknown as FrostModule;
  }

  return new FrostHelpers(_frostModule);
}

export class FrostHelpers {
  private mod: FrostModule;

  constructor(mod: FrostModule) {
    this.mod = mod;
  }

  /**
   * Generate FROST key shares for `signers` participants with `threshold` required.
   * Returns the serialized key bundle (JSON string containing all key packages).
   */
  generateKeys(signers: number, threshold: number): string {
    return this.mod.generate_frost_keys(signers, threshold);
  }

  /**
   * Extract the 32-byte x-only group public key from a key bundle.
   */
  getGroupPublicKey(bundleJson: string): Buffer {
    const bytes = this.mod.get_group_public_key(bundleJson);
    return Buffer.from(bytes);
  }

  /**
   * Derive the P2TR (taproot) address controlled by the FROST group.
   */
  deriveP2trAddress(bundleJson: string, network = bitcoin.networks.regtest): string {
    const xOnlyPubkey = this.getGroupPublicKey(bundleJson);
    const payment = bitcoin.payments.p2tr({
      internalPubkey: xOnlyPubkey,
      network,
    });
    return payment.address!;
  }

  /**
   * Sign a 32-byte sighash using FROST threshold signing.
   * Returns the 64-byte Schnorr signature.
   */
  signSighash(bundleJson: string, sighash: Buffer | Uint8Array): Buffer {
    const sigBytes = this.mod.sign_sighash(bundleJson, new Uint8Array(sighash));
    return Buffer.from(sigBytes);
  }
}
