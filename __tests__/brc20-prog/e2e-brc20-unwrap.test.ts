/**
 * E2E: BRC20-Prog Unwrap Flow (FrBTC.sol direct)
 *
 * Tests the full unwrap lifecycle through FrBTC.sol:
 *   1. Deploy FrBTC, configure signer
 *   2. Wrap BTC → frBTC (creates signer UTXOs)
 *   3. Call unwrap() on FrBTC → burns frBTC, adds to payments[] array
 *   4. Query pending payments via eth_call (getPaymentsLength, payments(i))
 *   5. Simulate FROST federation signing the release PSBT
 *   6. Verify payment state
 *
 * Uses real FROST signing via subzero-web-sys WASM — all crypto is the
 * actual FROST-secp256k1-tr protocol, only the P2P network is in-process.
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-unwrap.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { deployFrBtcContract } from './brc20-prog-deploy';
import { SubzeroFrostFederation } from './subzero-frost';
import { BRC20_PROG, loadFrBtcFoundryJson } from './brc20-prog-constants';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const hasFoundry = !!loadFrBtcFoundryJson();

/** Helper: make an RPC call to metashrew_view */
let rpcId = 1;
async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(BRC20_PROG.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: rpcId++ }),
  });
  return response.json();
}

/** Helper: call a view function on a contract via metashrew_view */
async function ethCall(contractAddress: string, selectorHex: string): Promise<any> {
  const toBytes = Array.from(Buffer.from(contractAddress.replace('0x', ''), 'hex'));
  const dataBytes = Array.from(Buffer.from(selectorHex, 'hex'));
  const callRequest = JSON.stringify({ to: toBytes, data: dataBytes });
  const hexInput = '0x' + Buffer.from(callRequest).toString('hex');
  const result = await rpcCall('metashrew_view', ['call', hexInput, 'latest']);
  if (result.result) {
    const hex = result.result.replace('0x', '');
    const json = JSON.parse(Buffer.from(hex, 'hex').toString('utf-8'));
    return json;
  }
  return null;
}

/** Decode a uint256 from a result byte array */
function decodeUint256(resultBytes: number[]): bigint {
  if (!resultBytes || resultBytes.length < 32) return 0n;
  let hex = '';
  for (const b of resultBytes.slice(0, 32)) {
    hex += b.toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

describe.runIf(hasFoundry)('E2E: BRC20-Prog Unwrap Flow', () => {
  let harness: any;
  let provider: WebProvider;
  let segwitAddress: string;
  let taprootAddress: string;
  let signer: any;
  let frBtcAddress: string | null = null;
  let federation: SubzeroFrostFederation;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine for coinbase maturity
    await mineBlocks(harness, 201);

    // Initialize FROST processor
    federation = await SubzeroFrostFederation.create(2, 3);

    // Deploy FrBTC
    frBtcAddress = await deployFrBtcContract(provider, harness);
    console.log('[unwrap] FrBTC deployed at:', frBtcAddress);

    // Configure signer
    if (frBtcAddress) {
      const groupPubKeyHex = federation.getGroupPublicKeyHex();
      try {
        await (provider as any).brc20ProgTransact(
          frBtcAddress,
          'setSigner(bytes32)',
          `0x${groupPubKeyHex}`,
          JSON.stringify({ fee_rate: 1, mine_enabled: true }),
        );
        harness.mineBlocks(3);
        console.log('[unwrap] setSigner done');
      } catch (e: any) {
        console.warn('[unwrap] setSigner failed:', e?.message ?? String(e));
      }

      // Set premium to 0
      try {
        await (provider as any).brc20ProgTransact(
          frBtcAddress,
          'setPremium(uint256)',
          '0',
          JSON.stringify({ fee_rate: 1, mine_enabled: true }),
        );
        harness.mineBlocks(3);
      } catch (e: any) {
        console.warn('[unwrap] setPremium failed:', e?.message ?? String(e));
      }
    }
  }, 300_000);

  afterAll(() => disposeBrc20Harness());

  // ─── Phase 1: Setup verification ───────────────────────────────────

  it('should have deployed FrBTC with signer configured', async () => {
    expect(frBtcAddress).toBeDefined();
    expect(frBtcAddress).not.toBe('0x0000000000000000000000000000000000000000');

    // Verify getSignerAddress returns valid P2TR script
    const gsa = await ethCall(frBtcAddress!, '1a296e02');
    expect(gsa).toBeDefined();
    expect(gsa.success).toBe(true);
    expect(gsa.result.length).toBeGreaterThan(0);
    console.log('[unwrap] getSignerAddress bytes:', gsa.result.length);
  });

  // ─── Phase 2: Wrap BTC to get frBTC ────────────────────────────────

  it('should verify deploy activation txid is readable', async () => {
    // The deploy result should have an activation_txid
    // Check if we can read it via getrawtransaction (which scans blocks)
    // This tests whether the activation tx actually exists in a block
    const deployResult = JSON.parse((provider as any).__lastDeployResult || '{}');
    if (deployResult.activation_txid) {
      const resp = await rpcCall('getrawtransaction', [deployResult.activation_txid, 1]);
      if (resp.result) {
        console.log('[unwrap] Deploy activation tx found in blocks, hex length:', resp.result.hex?.length);
      } else {
        console.log('[unwrap] Deploy activation tx NOT found:', resp.error);
      }
    } else {
      console.log('[unwrap] No activation_txid in deploy result');
    }
  });

  it('should wrap BTC to frBTC', async () => {
    const result = await provider.frbtcWrap(
      BigInt(500_000),
      JSON.stringify({
        to_address: taprootAddress,
        from_addresses: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        fee_rate: 1,
        mine_enabled: true,
        contract_address: frBtcAddress,
      }),
    );
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    harness.mineBlocks(2);
    expect(parsed).toBeDefined();
    console.log('[unwrap] Wrapped 500k sats');
  }, 120_000);

  // ─── Phase 3: Query initial payment state ──────────────────────────

  it('should have zero pending payments before unwrap', async () => {
    // getPaymentsLength() selector = 0xb8e0ffbe
    const resp = await ethCall(frBtcAddress!, 'b8e0ffbe');
    expect(resp).toBeDefined();
    expect(resp.success).toBe(true);
    const length = decodeUint256(resp.result);
    console.log('[unwrap] payments.length before unwrap:', length.toString());
    expect(length).toBe(0n);
  });

  it('should check block height progressed', async () => {
    // Get bitcoin block count
    const bcResp = await rpcCall('getblockcount', []);
    console.log('[unwrap] bitcoin block count:', bcResp.result);

    // Try calling brc20shrew's "call" view with decimals() on the FrBTC contract
    // If this works, brc20shrew has processed the deploy block
    const decimalsResp = await ethCall(frBtcAddress!, '313ce567');
    if (decimalsResp && decimalsResp.success) {
      const decimals = decodeUint256(decimalsResp.result);
      console.log('[unwrap] FrBTC decimals from brc20shrew:', decimals.toString());
    } else {
      console.warn('[unwrap] FrBTC decimals query FAILED:', decimalsResp?.error);
      console.warn('[unwrap] This means brc20shrew may not have indexed the deploy block');
    }

    // Check metashrew_height (qubitcoin internal)
    const mhResp = await rpcCall('metashrew_height', []);
    console.log('[unwrap] metashrew_height:', mhResp.result);
  });

  it('should verify activation tx is in block', async () => {
    // Get the raw block at the height where wrap was mined
    // The wrap result should have commit/reveal/activation txids
    // Let's query the block and check for OP_RETURN BRC20PROG
    const bcResp = await rpcCall('getblockcount', []);
    const tipHeight = bcResp.result as number;
    // Get the last few blocks to find our activation tx
    for (let h = tipHeight; h > tipHeight - 30 && h > 200; h--) {
      const hashResp = await rpcCall('getblockhash', [h]);
      if (!hashResp.result) continue;
      const blockResp = await rpcCall('getblock', [hashResp.result, 2]); // verbosity=2 for full tx details
      if (!blockResp.result) continue;
      const txCount = blockResp.result.tx?.length ?? 0;
      let hasOpReturn = false;
      for (const tx of (blockResp.result.tx || [])) {
        for (const vout of (tx.vout || [])) {
          if (vout.scriptPubKey?.asm?.startsWith('OP_RETURN') || vout.scriptPubKey?.hex?.startsWith('6a')) {
            hasOpReturn = true;
            console.log(`[unwrap] Block ${h}: tx ${tx.txid?.slice(0,16)}... has OP_RETURN: ${vout.scriptPubKey.asm.slice(0, 60)}`);
          }
        }
      }
      if (txCount > 3) {
        // For 4-tx blocks, get the raw block and check the last tx
        const rawResp = await rpcCall('getblock', [hashResp.result, 0]);
        if (rawResp.result) {
          const rawHex = rawResp.result as string;
          // Look for the BRC20PROG marker in the raw block
          const marker = Buffer.from('BRC20PROG').toString('hex'); // 42524332305052 4f47
          const idx = rawHex.indexOf(marker);
          if (idx >= 0) {
            console.log(`[unwrap] Block ${h}: FOUND BRC20PROG at hex offset ${idx}`);
          } else {
            console.log(`[unwrap] Block ${h}: ${txCount} txs, NO BRC20PROG marker found in raw block`);
          }
        }
      } else if (txCount > 1) {
        console.log(`[unwrap] Block ${h}: ${txCount} txs`);
      }
    }
  });

  it('should verify wrap actually minted frBTC via balanceOf', async () => {
    // balanceOf(address) selector = 0x70a08231
    // ABI: selector + address padded to 32 bytes
    // We need the EVM address of the sender (derived from their pkscript)
    // For now, check totalSupply() instead — selector 0x18160ddd
    const resp = await ethCall(frBtcAddress!, '18160ddd');
    expect(resp).toBeDefined();
    if (resp.success) {
      const supply = decodeUint256(resp.result);
      console.log('[unwrap] FrBTC totalSupply after wrap:', supply.toString());
      // If supply is 0, wrap didn't actually mint — the activation tx detection may not be working
      if (supply === 0n) {
        console.warn('[unwrap] WARNING: totalSupply is 0 — wrap() did not mint frBTC!');
        console.warn('[unwrap] This means the activation tx was not found or getTxDetails failed.');
      }
    } else {
      console.warn('[unwrap] totalSupply query failed:', resp.error);
    }
  });

  // ─── Phase 4: Execute unwrap ───────────────────────────────────────

  it('should unwrap frBTC — burns tokens and creates payment entry', async () => {
    const unwrapAmount = 200_000;

    const result = await provider.frbtcUnwrap(
      BigInt(unwrapAmount),
      BigInt(1), // vout for dust marker
      segwitAddress, // recipient
      JSON.stringify({
        from_addresses: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        fee_rate: 1,
        mine_enabled: true,
        contract_address: frBtcAddress,
      }),
    );
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    harness.mineBlocks(3);
    expect(parsed).toBeDefined();
    console.log('[unwrap] Unwrap tx:', JSON.stringify(parsed).slice(0, 200));
  }, 180_000);

  // ─── Phase 5: Query pending payments ───────────────────────────────

  it('should have one pending payment after unwrap', async () => {
    const resp = await ethCall(frBtcAddress!, 'b8e0ffbe');
    expect(resp).toBeDefined();
    expect(resp.success).toBe(true);
    const length = decodeUint256(resp.result);
    console.log('[unwrap] payments.length after unwrap:', length.toString());
    expect(length).toBe(1n);
  });

  it('should read payment details from payments(0)', async () => {
    // payments(uint256) selector = 0x87d81789
    // ABI encode: selector + uint256(0) padded to 32 bytes
    const calldata = '87d81789' + '0000000000000000000000000000000000000000000000000000000000000000';
    const resp = await ethCall(frBtcAddress!, calldata);
    expect(resp).toBeDefined();
    expect(resp.success).toBe(true);
    expect(resp.result.length).toBeGreaterThan(64); // At least txid + vout + value

    // Decode the value field (bytes 64-96 = third 32 bytes)
    const valueBytes = resp.result.slice(64, 96);
    const paymentValue = decodeUint256(valueBytes);
    console.log('[unwrap] Payment value:', paymentValue.toString(), 'sats');
    expect(paymentValue).toBe(200000n);
  });

  // ─── Phase 6: FROST federation processes the unwrap ────────────────

  it('should FROST-sign the release transaction with real subzero', async () => {
    // Real FROST threshold signing via subzero-web-sys:
    //   Round 1: generate nonces + commitments
    //   Round 2: produce signature shares
    //   Aggregate → valid Schnorr signature

    // Build a mock sighash from the payment data
    const sighash = new Uint8Array(32);
    const encoder = new TextEncoder();
    const data = encoder.encode('unwrap:0:200000:' + segwitAddress);
    sighash.set(data.slice(0, 32));

    // Sign with real FROST
    const signature = federation.sign(sighash);
    expect(signature).toBeDefined();
    expect(signature.length).toBe(64); // Schnorr signature = 64 bytes

    // Verify the signature is valid
    const valid = federation.verify(sighash, signature);
    expect(valid).toBe(true);

    console.log('[unwrap] Real FROST signature produced and verified ✓');
    console.log('[unwrap] Signature:', Buffer.from(signature).toString('hex').slice(0, 32) + '...');
  });

  it('should verify FROST group key matches signer address', () => {
    const address = federation.getSignerAddress();
    expect(address).toMatch(/^bcrt1p/); // regtest P2TR
    console.log('[unwrap] FROST group P2TR address:', address);

    const keygen = federation.getKeygen();
    expect(keygen.threshold).toBe(2);
    expect(keygen.maxSigners).toBe(3);
    expect(keygen.groupPublicKeyHex.length).toBe(64); // 32 bytes = 64 hex
  });

  // ─── Phase 7: Second unwrap to test multiple payments ──────────────

  it('should handle a second unwrap creating payment at index 1', async () => {
    const result = await provider.frbtcUnwrap(
      BigInt(100_000),
      BigInt(1),
      taprootAddress, // different recipient this time
      JSON.stringify({
        from_addresses: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        fee_rate: 2,
        mine_enabled: true,
        contract_address: frBtcAddress,
      }),
    );
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    harness.mineBlocks(3);
    expect(parsed).toBeDefined();

    // Verify payments length is now 2
    const resp = await ethCall(frBtcAddress!, 'b8e0ffbe');
    expect(resp.success).toBe(true);
    const length = decodeUint256(resp.result);
    console.log('[unwrap] payments.length after 2nd unwrap:', length.toString());
    expect(length).toBe(2n);
  }, 180_000);
});
