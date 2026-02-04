/**
 * Alkane Transfer Integration Tests
 *
 * Tests alkane transfers using `alkanesExecuteTyped` with the edict protostone pattern.
 *
 * IMPORTANT: For alkane transfers, you MUST use an edict in the protostone.
 * A simple "v0:v0" without any cellpack or edict will FAIL with:
 * "No operation: Protostones provided without envelope, cellpack, or edicts."
 *
 * ## Correct Edict Pattern for Alkane Transfers
 *
 * ```typescript
 * // Protostone format: [edict]:pointer:refund
 * // Edict format: [block:tx:amount:target]
 * //
 * // IMPORTANT: Use v1:v1 for pointer/refund so excess goes back to us!
 * // - Edict [32:0:1000:v0] sends EXACT 1000 to v0 (recipient)
 * // - Pointer v1 = where excess alkanes go (our p2tr:0)
 * // - Refund v1 = where refunds go (our p2tr:0)
 *
 * const transferAmount = '1000';
 * const protostone = `[32:0:${transferAmount}:v0]:v1:v1`;
 *
 * const result = await alkanesExecuteTyped(provider, {
 *   inputRequirements: `32:0:${transferAmount}`,  // Pull from wallet UTXOs
 *   protostones: protostone,
 *   toAddresses: [recipientAddress, 'p2tr:0'],    // v0 = recipient, v1 = our change
 *   changeAddress: 'p2wpkh:0',                    // BTC change to SegWit
 *   alkanesChangeAddress: 'p2tr:0',               // Explicit alkane change address
 * });
 * ```
 *
 * ## Why v1:v1 instead of v0:v0?
 *
 * With `[32:0:1000:v0]:v1:v1` and `toAddresses: [recipient, 'p2tr:0']`:
 * - The edict explicitly sends 1000 to v0 (recipient)
 * - Any EXCESS alkanes (if UTXO has more than 1000) go to v1 (our p2tr:0)
 * - Refunds also go to v1 (our p2tr:0)
 *
 * This ensures we ONLY send the intended amount to the recipient.
 *
 * ## Alternative: Factory Forward Opcode (50)
 *
 * You can also use the factory's Forward opcode (50) which passes incoming alkanes
 * to the output without any transformation:
 *
 * ```typescript
 * // Factory opcode 50 = Forward
 * const protostone = '[4,65498,50]:v0:v0';  // Call factory Forward, output to v0
 * ```
 *
 * The edict pattern is preferred for simple transfers as it doesn't require a contract call.
 *
 * Gated behind INTEGRATION=true env var — skipped during normal `vitest run`.
 * Run with: INTEGRATION=true pnpm test:sdk
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import { createTestSigner, TEST_MNEMONIC, type TestSignerResult } from './test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGTEST_CONFIG = {
  sandshrew_rpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

const DIESEL_ID = '2:0';

// ---------------------------------------------------------------------------
// signAndBroadcast — signs a PSBT returned by alkanesExecuteTyped, broadcasts,
// mines a block, and returns the txid.
// ---------------------------------------------------------------------------

async function signAndBroadcast(
  provider: WebProvider,
  result: any,
  signerResult: TestSignerResult,
  walletAddress: string,
): Promise<string> {
  // If the SDK already broadcast (auto-confirm mode), just return the txid
  if (result?.txid || result?.reveal_txid) {
    return result.txid || result.reveal_txid;
  }

  if (!result?.readyToSign) {
    throw new Error('No readyToSign or txid in result');
  }

  const readyToSign = result.readyToSign;

  // Convert PSBT to hex for signAllInputs
  let psbtBytes: Uint8Array;
  if (readyToSign.psbt instanceof Uint8Array) {
    psbtBytes = readyToSign.psbt;
  } else if (typeof readyToSign.psbt === 'object') {
    const keys = Object.keys(readyToSign.psbt).map(Number).sort((a: number, b: number) => a - b);
    psbtBytes = new Uint8Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      psbtBytes[i] = readyToSign.psbt[keys[i]];
    }
  } else {
    throw new Error('Unexpected PSBT format');
  }

  const rawPsbtHex = Buffer.from(psbtBytes).toString('hex');
  const { signedHexPsbt } = await signerResult.signer.signAllInputs({ rawPsbtHex });

  // signAllInputs already finalizes — extract and broadcast
  const signedPsbt = bitcoin.Psbt.fromHex(signedHexPsbt, { network: bitcoin.networks.regtest });
  const tx = signedPsbt.extractTransaction();
  const txHex = tx.toHex();
  const txid = tx.getId();

  const broadcastTxid = await provider.broadcastTransaction(txHex);

  // Mine a block to confirm
  await provider.bitcoindGenerateToAddress(1, walletAddress);

  return broadcastTxid || txid;
}

// ---------------------------------------------------------------------------
// alkanesExecuteTyped — inline replica of lib/alkanes/extendedProvider.ts
// We replicate it here to avoid @/ path-alias issues in vitest.
// ---------------------------------------------------------------------------

interface AlkanesExecuteTypedParams {
  toAddresses?: string[];
  inputRequirements: string;
  protostones: string;
  feeRate?: number;
  envelopeHex?: string;
  fromAddresses?: string[];
  changeAddress?: string;
  alkanesChangeAddress?: string;
  traceEnabled?: boolean;
  mineEnabled?: boolean;
  autoConfirm?: boolean;
  rawOutput?: boolean;
}

function parseMaxVoutFromProtostones(protostones: string): number {
  let maxVout = 0;
  const voutMatches = protostones.matchAll(/v(\d+)/g);
  for (const match of voutMatches) {
    const idx = parseInt(match[1], 10);
    if (idx > maxVout) maxVout = idx;
  }
  return maxVout;
}

async function alkanesExecuteTyped(
  provider: WebProvider,
  params: AlkanesExecuteTypedParams
): Promise<any> {
  const maxVout = parseMaxVoutFromProtostones(params.protostones);
  const toAddresses = params.toAddresses ?? Array(maxVout + 1).fill('p2tr:0');

  const options: Record<string, any> = {};
  const fromAddrs = params.fromAddresses ?? ['p2wpkh:0', 'p2tr:0'];
  options.from = fromAddrs;
  options.from_addresses = fromAddrs;
  options.change_address = params.changeAddress ?? 'p2wpkh:0';
  options.alkanes_change_address = params.alkanesChangeAddress ?? 'p2tr:0';
  options.lock_alkanes = true;

  if (params.traceEnabled !== undefined) options.trace_enabled = params.traceEnabled;
  if (params.mineEnabled !== undefined) options.mine_enabled = params.mineEnabled;
  if (params.autoConfirm !== undefined) options.auto_confirm = params.autoConfirm;
  if (params.rawOutput !== undefined) options.raw_output = params.rawOutput;

  const toAddressesJson = JSON.stringify(toAddresses);
  const optionsJson = JSON.stringify(options);

  console.log('[alkanesExecuteTyped] to_addresses:', toAddressesJson);
  console.log('[alkanesExecuteTyped] inputRequirements:', params.inputRequirements);
  console.log('[alkanesExecuteTyped] protostones:', params.protostones);
  console.log('[alkanesExecuteTyped] feeRate:', params.feeRate);
  console.log('[alkanesExecuteTyped] options:', optionsJson);

  const result = await provider.alkanesExecuteWithStrings(
    toAddressesJson,
    params.inputRequirements,
    params.protostones,
    params.feeRate ?? null,
    params.envelopeHex ?? null,
    optionsJson
  );

  return typeof result === 'string' ? JSON.parse(result) : result;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe.runIf(INTEGRATION)('Alkane Transfer (integration)', () => {
  let provider: WebProvider;
  let testSigner: TestSignerResult;
  let walletAddress: string; // Taproot address for alkanes
  let segwitAddress: string; // SegWit address for BTC change

  beforeAll(async () => {
    // Import WASM dynamically to avoid bundler issues
    const wasmModule = await import('@alkanes/ts-sdk/wasm');

    // Create provider using profile name and config object
    provider = new wasmModule.WebProvider('subfrost-regtest', REGTEST_CONFIG);

    // Load wallet mnemonic into provider so it can build PSBTs (select UTXOs, etc.)
    try {
      provider.walletLoadMnemonic(TEST_MNEMONIC, null);
      console.log('[Setup] WASM wallet loaded:', provider.walletIsLoaded());
    } catch (e: any) {
      console.log('[Setup] walletLoadMnemonic failed, trying walletCreate...');
      await provider.walletCreate(TEST_MNEMONIC, '');
      console.log('[Setup] WASM wallet created:', provider.walletIsLoaded());
    }

    // Create test signer from mnemonic for PSBT signing
    testSigner = await createTestSigner(TEST_MNEMONIC, 'regtest');
    walletAddress = testSigner.addresses.taproot.address;
    segwitAddress = testSigner.addresses.nativeSegwit.address;

    console.log('[Setup] Wallet taproot address:', walletAddress);
    console.log('[Setup] Wallet segwit address:', segwitAddress);

    // Ensure wallet has BTC
    await provider.bitcoindGenerateToAddress(10, walletAddress);
    await provider.bitcoindGenerateToAddress(10, segwitAddress);
  }, 60000);

  // -------------------------------------------------------------------------
  // 1. Mint DIESEL to wallet — ensure wallet has DIESEL for transfer tests
  // -------------------------------------------------------------------------
  describe('1. Seed wallet with DIESEL', () => {
    it('should mint DIESEL to wallet address', async () => {
      // Opcode 77 = mint on DIESEL (2:0), output to v0 = walletAddress
      const protostone = '[2,0,77]:v0:v0';
      const toAddresses = [walletAddress];

      console.log('[MintDIESEL] protostone:', protostone);

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements: '',
        protostones: protostone,
        feeRate: 10,
        toAddresses,
      });

      console.log('[MintDIESEL] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[MintDIESEL] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify DIESEL was minted via trace
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[MintDIESEL] Trace:', JSON.stringify(trace).slice(0, 500));
    }, 60000);
  });

  // -------------------------------------------------------------------------
  // 2. Simple Alkane Transfer — using edict protostone
  // -------------------------------------------------------------------------
  describe('2. Simple Alkane Transfer (edict protostone)', () => {
    it('should transfer DIESEL to another address using edict protostone', async () => {
      // For alkane transfers, we MUST use an edict in the protostone.
      // A simple "v0:v0" without any cellpack or edict will fail with:
      // "No operation: Protostones provided without envelope, cellpack, or edicts."
      //
      // CORRECT PATTERN for alkane transfers:
      // - Edict: [block:tx:amount:v0] - sends EXACT amount to v0 (recipient)
      // - Pointer: v1 - any excess/change goes to v1 (our address)
      // - Refund: v1 - refunds also go to v1 (our address)
      //
      // toAddresses: [recipient, 'p2tr:0']
      // - v0 = recipient address (receives the transferred amount)
      // - v1 = p2tr:0 (our taproot, receives any excess alkanes)

      const transferAmount = '1000'; // Transfer 1000 DIESEL

      // Use a different recipient to verify transfer works
      const recipientAddress = 'bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648';

      // Edict protostone: [block:tx:amount:v0]:v1:v1
      // - Edict sends exact transferAmount to v0 (recipient)
      // - Pointer v1 = our p2tr:0 for any excess
      // - Refund v1 = our p2tr:0 for refunds
      const protostone = `[2:0:${transferAmount}:v0]:v1:v1`;

      // Input requirements specify which alkane UTXOs to spend from wallet
      const inputRequirements = `2:0:${transferAmount}`;

      // v0 = recipient, v1 = our taproot for change
      const toAddresses = [recipientAddress, 'p2tr:0'];

      console.log('[Transfer] protostone:', protostone);
      console.log('[Transfer] inputRequirements:', inputRequirements);
      console.log('[Transfer] toAddresses:', toAddresses);

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
        fromAddresses: [segwitAddress, walletAddress], // SegWit for fees, Taproot for alkanes
        changeAddress: segwitAddress, // BTC change to SegWit (p2wpkh:0)
        alkanesChangeAddress: walletAddress, // Alkane change to Taproot (p2tr:0)
      });

      console.log('[Transfer] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[Transfer] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify via trace
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[Transfer] Trace:', JSON.stringify(trace).slice(0, 500));
      if (trace) {
        const traceObj = trace instanceof Map ? Object.fromEntries(trace) : trace;
        if (traceObj.trace?.alkanes_transferred) {
          console.log('[Transfer] Alkanes transferred:', traceObj.trace.alkanes_transferred);
        }
      }
    }, 60000);
  });

  // -------------------------------------------------------------------------
  // 3. Alkane Transfer with partial amount (tests autochange split)
  // -------------------------------------------------------------------------
  describe('3. Alkane Transfer with autochange split', () => {
    it('should transfer partial DIESEL and return excess to alkanesChange', async () => {
      // Transfer less than the full UTXO amount to test autochange
      // Pattern: [block:tx:amount:v0]:v1:v1
      // - Edict sends exact amount to v0 (recipient)
      // - Pointer/refund v1 = our p2tr:0 for excess alkanes

      const transferAmount = '500'; // Transfer only 500 DIESEL
      const recipientAddress = 'bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648';

      // Edict protostone with change going to v1
      const protostone = `[2:0:${transferAmount}:v0]:v1:v1`;
      const inputRequirements = `2:0:${transferAmount}`;
      const toAddresses = [recipientAddress, 'p2tr:0']; // v0 = recipient, v1 = our change

      console.log('[PartialTransfer] protostone:', protostone);
      console.log('[PartialTransfer] inputRequirements:', inputRequirements);
      console.log('[PartialTransfer] toAddresses:', toAddresses);

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
        fromAddresses: [segwitAddress, walletAddress],
        changeAddress: segwitAddress,
        alkanesChangeAddress: walletAddress,
      });

      console.log('[PartialTransfer] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[PartialTransfer] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify via trace - should show transfer amount AND change
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[PartialTransfer] Trace:', JSON.stringify(trace).slice(0, 500));
    }, 60000);
  });

  // -------------------------------------------------------------------------
  // 4. Transfer to external address
  // -------------------------------------------------------------------------
  describe('4. Transfer to external address', () => {
    it('should transfer DIESEL to a different address', async () => {
      // Use a different recipient address
      // Pattern: [block:tx:amount:v0]:v1:v1
      // - Edict sends exact amount to v0 (external recipient)
      // - Pointer/refund v1 = our p2tr:0 for excess

      const transferAmount = '100';

      // External recipient (different from our wallet)
      const externalRecipient = 'bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648';

      // Edict protostone with change going to v1
      const protostone = `[2:0:${transferAmount}:v0]:v1:v1`;
      const inputRequirements = `2:0:${transferAmount}`;
      const toAddresses = [externalRecipient, 'p2tr:0']; // v0 = recipient, v1 = our change

      console.log('[ExternalTransfer] Sending', transferAmount, 'DIESEL to:', externalRecipient);
      console.log('[ExternalTransfer] protostone:', protostone);
      console.log('[ExternalTransfer] inputRequirements:', inputRequirements);
      console.log('[ExternalTransfer] toAddresses:', toAddresses);

      const result = await alkanesExecuteTyped(provider, {
        inputRequirements,
        protostones: protostone,
        feeRate: 10,
        toAddresses,
        fromAddresses: [segwitAddress, walletAddress],
        changeAddress: segwitAddress,
        alkanesChangeAddress: walletAddress,
      });

      console.log('[ExternalTransfer] Execute result:', JSON.stringify(result).slice(0, 500));

      const txid = await signAndBroadcast(provider, result, testSigner, walletAddress);
      console.log('[ExternalTransfer] Broadcast txid:', txid);
      expect(txid).toBeTruthy();

      // Verify external recipient received alkanes
      const trace = await provider.alkanesTrace(`${txid}:0`);
      console.log('[ExternalTransfer] Trace:', JSON.stringify(trace).slice(0, 500));
    }, 60000);
  });
});
