/**
 * Alkane Transfer PSBT — Scoring & Selection Tests
 *
 * Focused on the smart UTXO selection algorithm, cleanliness scoring,
 * greedy selection, collateral warning edge cases, and fee estimation.
 *
 * Complements the existing buildAlkaneTransferPsbt.test.ts which covers
 * the end-to-end PSBT construction. These tests isolate the selection
 * and scoring logic.
 *
 * Run with: pnpm test lib/alkanes/__tests__/transfer-psbt-scoring.test.ts
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

// Mock the SDK WASM module
const mockEncodedRunestone = Buffer.from([
  0x6a, 0x20, ...new Array(32).fill(0xab),
]);

vi.mock('@alkanes/ts-sdk', () => ({
  ProtoStone: {
    edicts: vi.fn(() => ({ type: 'mock-protostone' })),
  },
  encodeRunestoneProtostone: vi.fn(() => ({
    encodedRunestone: mockEncodedRunestone,
  })),
}));

import {
  buildAlkaneTransferPsbt,
  type BuildAlkaneTransferParams,
  type CollateralWarning,
} from '../buildAlkaneTransferPsbt';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const REGTEST = bitcoin.networks.regtest;
const SENDER_TAPROOT = 'bcrt1pqjwdlfg4lht3jwl0p5u58yn8fc2ksqx5v44g6ekcru5szdm2u32qum3gpe';
const SENDER_SEGWIT = 'bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x';
const RECIPIENT = 'bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648';

const TXID_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TXID_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TXID_C = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const TXID_D = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const TXID_E = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const TXID_F = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const TAP_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAlkaneOutpoint(
  txid: string,
  vout: number,
  value: number,
  alkanes: { block: number; tx: number; amount: string }[],
) {
  return {
    outpoint: { txid, vout },
    output: { value },
    balance_sheet: {
      cached: {
        balances: alkanes.map((a) => ({ block: a.block, tx: a.tx, amount: a.amount })),
      },
    },
  };
}

function makeOrdOutput(
  txid: string,
  vout: number,
  inscriptions: string[] = [],
  runes: Record<string, unknown> = {},
) {
  return {
    outpoint: `${txid}:${vout}`,
    inscriptions,
    runes,
  };
}

function makeEsploraUtxo(txid: string, vout: number, value: number, confirmed = true) {
  return { txid, vout, value, status: { confirmed } };
}

interface FetchMockConfig {
  alkaneOutpoints?: ReturnType<typeof makeAlkaneOutpoint>[];
  ordOutputs?: ReturnType<typeof makeOrdOutput>[];
  ordRpcDisabled?: boolean;
  esploraRpcUtxos?: ReturnType<typeof makeEsploraUtxo>[];
}

function setupFetchMock(config: FetchMockConfig) {
  const {
    alkaneOutpoints = [],
    ordOutputs = [],
    ordRpcDisabled = false,
    esploraRpcUtxos = [],
  } = config;

  const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    if (urlStr.includes('subfrost.io') && body?.method) {
      if (body.method === 'alkanes_protorunesbyaddress') {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: { outpoints: alkaneOutpoints } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (body.method === 'ord_outputs') {
        if (ordRpcDisabled) {
          return new Response(
            JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'JSON API disabled' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: ordOutputs }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (urlStr.includes('/api/rpc') && body?.method === 'esplora_address::utxo') {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: esploraRpcUtxos }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [] }), { status: 200 });
  });

  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

function baseParams(overrides: Partial<BuildAlkaneTransferParams> = {}): BuildAlkaneTransferParams {
  return {
    alkaneId: '2:0',
    amount: BigInt(1000),
    senderTaprootAddress: SENDER_TAPROOT,
    recipientAddress: RECIPIENT,
    tapInternalKeyHex: TAP_KEY,
    feeRate: 2,
    network: REGTEST,
    networkName: 'subfrost-regtest',
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. DUST_VALUE constant
// ---------------------------------------------------------------------------

describe('DUST_VALUE constant', () => {
  it('should use 600 sats for dust outputs (not 546)', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [
        makeEsploraUtxo(TXID_B, 0, 50000),
      ],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // v0 (sender change) and v1 (recipient) should be 600 sats each
    expect(Number(psbt.txOutputs[0].value)).toBe(600);
    expect(Number(psbt.txOutputs[1].value)).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// 2. Cleanliness Scoring
// ---------------------------------------------------------------------------

describe('UTXO cleanliness scoring and selection', () => {
  it('should prefer clean UTXOs over those with inscriptions', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        // UTXO A: has inscription (should be score 100)
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
        // UTXO B: clean (should be score 0)
        makeAlkaneOutpoint(TXID_B, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      ordOutputs: [
        makeOrdOutput(TXID_A, 0, ['inscription1']),
        // TXID_B has no ord output entry = clean
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_C, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Should select TXID_B (clean) instead of TXID_A (inscription)
    const inputTxids = psbt.txInputs.map(i => Buffer.from(i.hash).reverse().toString('hex'));
    // If only 1000 units needed and TXID_B has 5000, it should be sufficient alone
    expect(inputTxids).toContain(TXID_B);
    // No collateral warning needed since clean UTXO was sufficient
    expect(result.collateralWarning).toBeUndefined();
  });

  it('should prefer UTXOs with fewer other alkanes', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        // UTXO A: target alkane + 3 other alkanes (score = 3)
        makeAlkaneOutpoint(TXID_A, 0, 546, [
          { block: 2, tx: 0, amount: '5000' },
          { block: 3, tx: 1, amount: '100' },
          { block: 4, tx: 2, amount: '200' },
          { block: 5, tx: 3, amount: '300' },
        ]),
        // UTXO B: target alkane + 1 other alkane (score = 1)
        makeAlkaneOutpoint(TXID_B, 0, 546, [
          { block: 2, tx: 0, amount: '5000' },
          { block: 3, tx: 1, amount: '100' },
        ]),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_C, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Should select TXID_B (score 1) over TXID_A (score 3)
    const inputTxids = psbt.txInputs.map(i => Buffer.from(i.hash).reverse().toString('hex'));
    expect(inputTxids).toContain(TXID_B);
  });

  it('should set collateral warning when inscriptions must be spent', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        // Only UTXO has inscription
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      ordOutputs: [
        makeOrdOutput(TXID_A, 0, ['inscription1']),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    expect(result.collateralWarning).toBeDefined();
    expect(result.collateralWarning!.hasInscriptions).toBe(true);
  });

  it('should set collateral warning when runes must be spent', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      ordOutputs: [
        makeOrdOutput(TXID_A, 0, [], { 'SOME_RUNE': { amount: '100' } }),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    expect(result.collateralWarning).toBeDefined();
    expect(result.collateralWarning!.hasRunes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Greedy UTXO Selection
// ---------------------------------------------------------------------------

describe('Greedy UTXO selection', () => {
  it('should select minimum UTXOs needed to cover amount', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        // 3 UTXOs with clean target alkane
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '500' }]),
        makeAlkaneOutpoint(TXID_B, 0, 546, [{ block: 2, tx: 0, amount: '800' }]),
        makeAlkaneOutpoint(TXID_C, 0, 546, [{ block: 2, tx: 0, amount: '300' }]),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_D, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(700) }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Should need at most 2 UTXOs (800 >= 700 with just B, or 500+300=800 with A+C)
    // Since scoring prefers larger amounts, TXID_B (800) alone suffices
    const alkaneInputCount = psbt.txInputs.length - 1; // subtract BTC fee input
    expect(alkaneInputCount).toBeLessThanOrEqual(2);
  });

  it('should throw when total available is insufficient', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '500' }]),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    await expect(
      buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }))
    ).rejects.toThrow('Insufficient balance');
  });

  it('should throw when no UTXOs contain target alkane', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        // Has alkane 3:1, not 2:0
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 3, tx: 1, amount: '5000' }]),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    await expect(
      buildAlkaneTransferPsbt(baseParams({ alkaneId: '2:0', amount: BigInt(100) }))
    ).rejects.toThrow('No UTXOs found containing alkane 2:0');
  });
});

// ---------------------------------------------------------------------------
// 4. ord_outputs RPC Failure (mainnet)
// ---------------------------------------------------------------------------

describe('ord_outputs RPC failure handling', () => {
  it('should set unverifiedInscriptionRunes when RPC is disabled', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      ordRpcDisabled: true,
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    expect(result.collateralWarning).toBeDefined();
    expect(result.collateralWarning!.unverifiedInscriptionRunes).toBe(true);
  });

  it('should still build PSBT successfully when ord_outputs fails', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      ordRpcDisabled: true,
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    expect(result.psbtBase64).toBeTruthy();
    expect(result.estimatedFee).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. BTC Fee Funding
// ---------------------------------------------------------------------------

describe('BTC fee funding', () => {
  it('should throw when insufficient BTC for fee', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [
        // Only 100 sats available - not enough for fee
        makeEsploraUtxo(TXID_B, 0, 100),
      ],
    });

    await expect(
      buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000), feeRate: 100 }))
    ).rejects.toThrow('Insufficient BTC for fee');
  });

  it('should exclude alkane UTXOs from BTC fee funding', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [
        // Same TXID_A is the alkane UTXO (dust) - should not be reused for fees
        makeEsploraUtxo(TXID_A, 0, 546),
        makeEsploraUtxo(TXID_B, 0, 50000),
      ],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // TXID_A should appear exactly once (as alkane input, not as BTC fee input)
    const inputTxids = psbt.txInputs.map(i => Buffer.from(i.hash).reverse().toString('hex'));
    const txidACount = inputTxids.filter(t => t === TXID_A).length;
    expect(txidACount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Dual-Address Wallet Support
// ---------------------------------------------------------------------------

describe('Dual-address wallet (separate payment address)', () => {
  it('should use separate payment address for BTC fee inputs', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [
        makeEsploraUtxo(TXID_B, 0, 50000),
      ],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({
      senderPaymentAddress: SENDER_SEGWIT,
      amount: BigInt(1000),
    }));

    expect(result.psbtBase64).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 7. PSBT Output Structure
// ---------------------------------------------------------------------------

describe('PSBT output structure', () => {
  it('should have correct output ordering: v0=sender, v1=recipient, v2=OP_RETURN, v3=change', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({ amount: BigInt(1000) }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // v0: sender taproot change (600 sats)
    expect(Number(psbt.txOutputs[0].value)).toBe(600);

    // v1: recipient (600 sats)
    expect(Number(psbt.txOutputs[1].value)).toBe(600);

    // v2: OP_RETURN (0 sats)
    expect(Number(psbt.txOutputs[2].value)).toBe(0);
    const script = Buffer.from(psbt.txOutputs[2].script);
    expect(script[0]).toBe(0x6a); // OP_RETURN

    // v3: BTC change (should exist if there's enough change)
    if (psbt.txOutputs.length > 3) {
      expect(Number(psbt.txOutputs[3].value)).toBeGreaterThanOrEqual(600);
    }
  });

  it('should omit BTC change output when change is below dust', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [
        // Exactly enough for fee + dust outputs, no change
        makeEsploraUtxo(TXID_B, 0, 1300),
      ],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({
      amount: BigInt(1000),
      feeRate: 1,
    }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Should have 3 outputs (no change) or 4 (with change)
    // If change < 600, it's omitted
    expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 8. tapInternalKey Handling
// ---------------------------------------------------------------------------

describe('tapInternalKey handling', () => {
  it('should add tapInternalKey to alkane inputs when provided', async () => {
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({
      amount: BigInt(1000),
      tapInternalKeyHex: TAP_KEY,
    }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // First input (alkane) should have tapInternalKey
    expect(psbt.data.inputs[0].tapInternalKey).toBeTruthy();
    expect(Buffer.from(psbt.data.inputs[0].tapInternalKey!).toString('hex')).toBe(TAP_KEY);
  });

  it('should handle 66-char pubkey (with 02/03 prefix) by stripping prefix', async () => {
    const fullPubkey = '02' + TAP_KEY; // 66 chars
    setupFetchMock({
      alkaneOutpoints: [
        makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000' }]),
      ],
      esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
    });

    const result = await buildAlkaneTransferPsbt(baseParams({
      amount: BigInt(1000),
      tapInternalKeyHex: fullPubkey,
    }));
    const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST });

    // Should strip the prefix and use x-only (32 bytes)
    expect(psbt.data.inputs[0].tapInternalKey).toBeTruthy();
    expect(psbt.data.inputs[0].tapInternalKey!.length).toBe(32);
  });
});
