/**
 * Real FROST threshold signing via subzero-web-sys WASM.
 *
 * Replaces the mock FROST processor with the actual subzero implementation:
 *   - frost_keygen_dealer: generates real key packages + group public key
 *   - frost_sign: performs full FROST round1 → round2 → aggregate ceremony
 *   - frost_verify: verifies Schnorr signatures against group public key
 *   - frost_derive_taproot_address: derives the P2TR address for the group
 *
 * The network layer is the only thing mocked — all crypto is real FROST-secp256k1-tr.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

interface SubzeroModule {
  init(): void;
  version(): string;
  frost_keygen_dealer(threshold: number, max_signers: number): any;
  frost_sign(key_packages_json: string, pub_key_package_json: string, message: Uint8Array): Uint8Array;
  frost_verify(pub_key_package_json: string, message: Uint8Array, signature: Uint8Array): boolean;
  frost_derive_taproot_address(pub_key_package_json: string, network: string): string;
  frost_dkg_part1(identifier_index: number, max_signers: number, min_signers: number): any;
  signal_parse_manifest(manifest_toml: string): any;
  WasmHealthTracker: new (threshold: number, max_signers: number) => any;
  // Consensus programs
  frbtc_unwrap_process(unwrap_requests_json: string, utxos_json: string): any;
  frbtc_aggregate_unwrap_process(unwrap_requests_json: string, utxos_json: string, premium_bps: bigint, max_batch_size: number): any;
  initSync(wasmBytes: BufferSource): void;
}

let _module: SubzeroModule | null = null;

/**
 * Load and initialize the subzero-web-sys WASM module.
 */
async function loadSubzero(): Promise<SubzeroModule> {
  if (!_module) {
    const subzeroJs = await import('./fixtures/subzero/subzero_web_sys.js');
    const wasmPath = resolve(__dirname, 'fixtures/subzero/subzero_web_sys_bg.wasm');
    const wasmBytes = readFileSync(wasmPath);
    subzeroJs.initSync(wasmBytes);
    subzeroJs.init();
    _module = subzeroJs as unknown as SubzeroModule;
  }
  return _module;
}

export interface FrostKeygen {
  /** Pre-serialized JSON array of all key packages (for frost_sign). */
  allKeyPackagesJson: string;
  /** Pre-serialized JSON of the public key package (for frost_sign/verify). */
  publicKeyPackageJson: string;
  /** The x-only group public key (32 bytes hex). */
  groupPublicKeyHex: string;
  /** The P2TR address controlled by the group (regtest). */
  signerAddress: string;
  /** Threshold required. */
  threshold: number;
  /** Total signers. */
  maxSigners: number;
}

/**
 * Real FROST federation using subzero-web-sys.
 *
 * All cryptographic operations use the actual FROST-secp256k1-tr protocol.
 * Only the P2P network is simulated (all signers run in-process).
 */
export class SubzeroFrostFederation {
  private mod: SubzeroModule;
  private keygen: FrostKeygen;
  private processedPayments: Set<number> = new Set();

  private constructor(mod: SubzeroModule, keygen: FrostKeygen) {
    this.mod = mod;
    this.keygen = keygen;
  }

  /**
   * Create a new FROST federation with dealer-based keygen.
   * All crypto is real — only the network is in-process.
   */
  static async create(threshold: number = 2, maxSigners: number = 3): Promise<SubzeroFrostFederation> {
    const mod = await loadSubzero();

    console.log(`[subzero] Initializing ${threshold}-of-${maxSigners} FROST federation (v${mod.version()})`);

    // Real FROST keygen via subzero
    const result = mod.frost_keygen_dealer(threshold, maxSigners);

    // Derive the group's P2TR address
    const signerAddress = mod.frost_derive_taproot_address(
      result.public_key_package_json,
      'regtest',
    );

    // Extract the x-only group public key (32 bytes) from the P2TR address
    // The address is bech32m-encoded; we derive the key from it
    // Alternatively, extract from the public_key_package JSON
    const pkpObj = JSON.parse(result.public_key_package_json);
    // frost-secp256k1-tr serializes verifying_key as { "value": "02<hex>" } or similar
    // Try multiple possible formats
    let groupPublicKeyHex = '';
    const vk = pkpObj.verifying_key;
    if (typeof vk === 'string') {
      groupPublicKeyHex = vk.length === 66 ? vk.slice(2) : vk;
    } else if (vk?.value) {
      const val = typeof vk.value === 'string' ? vk.value : '';
      groupPublicKeyHex = val.length === 66 ? val.slice(2) : val;
    } else if (vk?.serialization) {
      // Some versions use serialization array
      const bytes = vk.serialization as number[];
      groupPublicKeyHex = bytes.slice(1).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback: derive from the address using the JSON structure
    if (!groupPublicKeyHex && pkpObj.verifying_share?.value) {
      const val = pkpObj.verifying_share.value;
      groupPublicKeyHex = typeof val === 'string' && val.length === 66 ? val.slice(2) : val;
    }

    const keygen: FrostKeygen = {
      allKeyPackagesJson: result.all_key_packages_json,
      publicKeyPackageJson: result.public_key_package_json,
      groupPublicKeyHex,
      signerAddress,
      threshold,
      maxSigners,
    };

    if (groupPublicKeyHex) {
      console.log(`[subzero] Federation ready: ${signerAddress} (group key: ${groupPublicKeyHex.slice(0, 16)}...)`);
    } else {
      // Log the raw structure for debugging
      console.log(`[subzero] Federation ready: ${signerAddress} (key extraction pending)`);
      console.log(`[subzero] pkp keys: ${Object.keys(pkpObj).join(', ')}`);
      if (pkpObj.verifying_key) {
        console.log(`[subzero] verifying_key type: ${typeof pkpObj.verifying_key}, keys: ${typeof pkpObj.verifying_key === 'object' ? Object.keys(pkpObj.verifying_key).join(', ') : 'N/A'}`);
      }
    }

    return new SubzeroFrostFederation(mod, keygen);
  }

  /** Get the federation's group public key as 32-byte hex. */
  getGroupPublicKeyHex(): string {
    return this.keygen.groupPublicKeyHex;
  }

  /** Get the federation's P2TR signer address. */
  getSignerAddress(): string {
    return this.keygen.signerAddress;
  }

  /** Get keygen info. */
  getKeygen(): FrostKeygen {
    return this.keygen;
  }

  /**
   * Sign a 32-byte sighash using real FROST threshold signing.
   *
   * Performs the full ceremony in-process:
   *   1. Round 1: generate nonces + commitments for each signer
   *   2. Round 2: each signer produces signature share
   *   3. Aggregate shares → valid Schnorr signature
   *
   * Returns the 64-byte Schnorr signature.
   */
  sign(message: Uint8Array): Uint8Array {
    return this.mod.frost_sign(
      this.keygen.allKeyPackagesJson,
      this.keygen.publicKeyPackageJson,
      message,
    );
  }

  /**
   * Verify a signature against the group public key.
   */
  verify(message: Uint8Array, signature: Uint8Array): boolean {
    return this.mod.frost_verify(
      this.keygen.publicKeyPackageJson,
      message,
      signature,
    );
  }

  /**
   * Process pending unwrap payments — real FROST signing.
   *
   * For each payment, signs a release message and returns the signature.
   * In production, this would build a PSBT, extract sighashes, and sign each.
   */
  processUnwrapPayments(payments: Array<{ id: number; amountSats: number; destination: string }>): Array<{ txid: string; signature: Uint8Array }> {
    const results: Array<{ txid: string; signature: Uint8Array }> = [];

    for (const payment of payments) {
      if (this.processedPayments.has(payment.id)) continue;

      // Build a deterministic message from the payment data
      const message = new Uint8Array(32);
      const encoder = new TextEncoder();
      const paymentData = encoder.encode(`unwrap:${payment.id}:${payment.amountSats}:${payment.destination}`);
      // SHA256-like hash (simplified — real impl would use actual PSBT sighash)
      for (let i = 0; i < paymentData.length && i < 32; i++) {
        message[i] = paymentData[i];
      }

      // Real FROST signing
      const signature = this.sign(message);

      // Verify the signature we just created
      const valid = this.verify(message, signature);
      if (!valid) {
        throw new Error(`[subzero] FROST signature verification failed for payment #${payment.id}`);
      }

      const sigHex = Buffer.from(signature).toString('hex');
      results.push({
        txid: sigHex.slice(0, 64), // Use first 32 bytes of sig as mock txid
        signature,
      });

      this.processedPayments.add(payment.id);
      console.log(`[subzero] FROST signed unwrap #${payment.id}: ${payment.amountSats} sats → ${payment.destination} (verified ✓)`);
    }

    return results;
  }

  /** Check if a payment has been processed. */
  isProcessed(paymentId: number): boolean {
    return this.processedPayments.has(paymentId);
  }

  /**
   * Run the frbtc-unwrap consensus program: build PSBT, extract sighash, FROST sign.
   *
   * This is the full pipeline that would run on the subzero federation nodes:
   *   1. frbtc_unwrap_process: builds PSBT from pending payments + UTXOs
   *   2. Extract sighash from PSBT
   *   3. FROST sign the sighash
   *   4. Verify signature
   *
   * @param payments - Pending unwrap payment entries from FrBTC contract
   * @param utxos - Available UTXOs at the signer address
   * @returns The signed unwrap result with PSBT, sighash, and signature
   */
  processUnwrapsWithProgram(
    payments: Array<{ id: string; amount_sats: number; destination: string }>,
    utxos: Array<{ txid: string; vout: number; value_sats: number; script_pubkey: number[] }>,
  ): { psbt: Uint8Array; sighash: Uint8Array; signature: Uint8Array; requestIds: string[]; verified: boolean } {
    const requestsJson = JSON.stringify(payments);
    const utxosJson = JSON.stringify(utxos);

    // Step 1: Run the frbtc-unwrap consensus program
    const result = this.mod.frbtc_unwrap_process(requestsJson, utxosJson);

    const sighash = new Uint8Array(result.sighash);
    const psbt = new Uint8Array(result.psbt);
    const requestIds = result.request_ids as string[];

    console.log(`[subzero] frbtc-unwrap: built PSBT (${psbt.length} bytes), sighash: ${result.sighash_hex}`);

    // Step 2: FROST sign the sighash
    const signature = this.sign(sighash);

    // Step 3: Verify
    const verified = this.verify(sighash, signature);

    console.log(`[subzero] FROST signed unwrap batch (${requestIds.length} payments), verified: ${verified}`);

    return { psbt, sighash, signature, requestIds, verified };
  }
}
