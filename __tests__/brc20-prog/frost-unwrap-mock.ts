/**
 * Mock FROST-based BRC20 unwrap processor.
 *
 * Simulates the subfrost unwrap flow:
 *   1. Query vault for pending unlocks
 *   2. FROST-sign the release transaction
 *   3. Broadcast and mine
 *
 * Uses the real frost-web-sys WASM for key generation and signing,
 * following the pattern from ~/subfrost-app/__tests__/devnet/frost-helpers.ts.
 */

import { loadFrost, type FrostHelpers } from '../devnet/frost-helpers';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

export interface MockFrostConfig {
  threshold: number;
  signerCount: number;
}

export class MockBrc20UnwrapProcessor {
  private frost: FrostHelpers;
  private keyBundle: string;
  private groupPubKey: Uint8Array;

  private constructor(
    frost: FrostHelpers,
    keyBundle: string,
    groupPubKey: Uint8Array,
  ) {
    this.frost = frost;
    this.keyBundle = keyBundle;
    this.groupPubKey = groupPubKey;
  }

  static async create(
    config: MockFrostConfig = { threshold: 2, signerCount: 3 },
  ): Promise<MockBrc20UnwrapProcessor> {
    const frost = await loadFrost();
    const keyBundle = frost.generateKeys(config.signerCount, config.threshold);
    const groupPubKey = frost.getGroupPublicKey(keyBundle);

    return new MockBrc20UnwrapProcessor(frost, keyBundle, groupPubKey);
  }

  /** Get the group public key (for setting as signer on the FrBTC contract). */
  getGroupPublicKey(): Uint8Array {
    return this.groupPubKey;
  }

  /** Get the group public key as hex string. */
  getGroupPublicKeyHex(): string {
    return Buffer.from(this.groupPubKey).toString('hex');
  }

  /**
   * Sign a sighash using the FROST threshold ceremony.
   * Returns the Schnorr signature bytes.
   */
  signSighash(sighash: Uint8Array): Uint8Array {
    return this.frost.signSighash(this.keyBundle, sighash);
  }

  /**
   * Process a single unwrap payment.
   *
   * In a real deployment, this would:
   *   1. Build a PSBT spending the locked UTXO
   *   2. FROST-sign it with threshold participants
   *   3. Broadcast the signed transaction
   *
   * For testing, we simulate the signing and return success.
   */
  async processUnwrap(
    _provider: WebProvider,
    _harness: any,
    _vaultId: string,
  ): Promise<{ success: boolean; message: string }> {
    // In devnet tests, the FROST signing is simulated
    // The vault contract handles the state transition
    console.log('[frost-mock] Processing BRC20 unwrap...');
    return {
      success: true,
      message: 'Unwrap processed (mock FROST signing)',
    };
  }
}
