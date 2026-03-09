/**
 * Tests for buildAlkaneTransferPsbt — alkane transfer PSBT construction.
 *
 * Covers UTXO selection, collateral warnings, PSBT output ordering,
 * dust values, tapInternalKey handling, fee estimation, and error cases.
 *
 * All network calls (fetch) and SDK WASM imports are mocked.
 *
 * Run with: pnpm test lib/alkanes/__tests__/buildAlkaneTransferPsbt.test.ts
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

// Initialize ECC library for bitcoinjs-lib (required for P2TR address operations)
bitcoin.initEccLib(ecc);

// ---------------------------------------------------------------------------
// Mock @alkanes/ts-sdk (requires WASM — must be mocked before import)
// ---------------------------------------------------------------------------
const mockEncodedRunestone = Buffer.from([
  0x6a, // OP_RETURN
  0x20, // push 32 bytes
  ...new Array(32).fill(0xab), // dummy payload
]);

vi.mock('@alkanes/ts-sdk', () => ({
  ProtoStone: {
    edicts: vi.fn(() => ({ type: 'mock-protostone' })),
  },
  encodeRunestoneProtostone: vi.fn(() => ({
    encodedRunestone: mockEncodedRunestone,
  })),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import {
  buildAlkaneTransferPsbt,
  type BuildAlkaneTransferParams,
  type CollateralWarning,
} from '../buildAlkaneTransferPsbt';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const REGTEST_NETWORK = bitcoin.networks.regtest;

const SENDER_TAPROOT = 'bcrt1pqjwdlfg4lht3jwl0p5u58yn8fc2ksqx5v44g6ekcru5szdm2u32qum3gpe';
const SENDER_SEGWIT = 'bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x';
const RECIPIENT_TAPROOT = 'bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648';

const TXID_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TXID_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TXID_C = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const TXID_D = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const TXID_E = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// A valid 32-byte x-only pubkey hex (64 chars)
const TAP_INTERNAL_KEY_HEX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

// ---------------------------------------------------------------------------
// Mock data builders
// ---------------------------------------------------------------------------

/** Build an alkane outpoint RPC response entry */
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

/** Build an ord_outputs RPC response entry */
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

/** Build an esplora UTXO entry (for BTC fee funding) */
function makeEsploraUtxo(txid: string, vout: number, value: number, confirmed = true) {
  return { txid, vout, value, status: { confirmed } };
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

interface FetchMockConfig {
  alkaneOutpoints?: ReturnType<typeof makeAlkaneOutpoint>[];
  ordOutputs?: ReturnType<typeof makeOrdOutput>[];
  ordRpcDisabled?: boolean;
  ordRpcError?: boolean;
  esploraRpcUtxos?: ReturnType<typeof makeEsploraUtxo>[];
  esploraRestUtxos?: ReturnType<typeof makeEsploraUtxo>[];
}

/**
 * Set up global fetch mock.
 *
 * Routes:
 * - POST to RPC endpoints (subfrost.io) → dispatches by JSON-RPC method
 * - POST to /api/rpc → esplora_address::utxo (for BTC UTXOs)
 * - GET  to /api/esplora/... → REST fallback for BTC UTXOs
 */
function setupFetchMock(config: FetchMockConfig) {
  const {
    alkaneOutpoints = [],
    ordOutputs = [],
    ordRpcDisabled = false,
    ordRpcError = false,
    esploraRpcUtxos = [],
    esploraRestUtxos,
  } = config;

  const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    // --- Direct RPC calls (alkanes_protorunesbyaddress, ord_outputs) ---
    if (urlStr.includes('subfrost.io') && body?.method) {
      if (body.method === 'alkanes_protorunesbyaddress') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { outpoints: alkaneOutpoints },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (body.method === 'ord_outputs') {
        if (ordRpcError) {
          return new Response(
            JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'internal error' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
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

    // --- /api/rpc (esplora_address::utxo for BTC UTXOs) ---
    if (urlStr.includes('/api/rpc') && body?.method === 'esplora_address::utxo') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: esploraRpcUtxos,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // --- /api/esplora REST fallback ---
    if (urlStr.includes('/api/esplora/')) {
      const utxos = esploraRestUtxos ?? esploraRpcUtxos;
      return new Response(JSON.stringify(utxos), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fallback — shouldn't be reached in tests
    console.warn('[fetchMock] Unhandled URL:', urlStr);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

// ---------------------------------------------------------------------------
// Default params helper
// ---------------------------------------------------------------------------
function defaultParams(overrides?: Partial<BuildAlkaneTransferParams>): BuildAlkaneTransferParams {
  return {
    alkaneId: '2:0', // DIESEL
    amount: BigInt(1_000_000),
    senderTaprootAddress: SENDER_TAPROOT,
    recipientAddress: RECIPIENT_TAPROOT,
    tapInternalKeyHex: TAP_INTERNAL_KEY_HEX,
    feeRate: 2,
    network: REGTEST_NETWORK,
    networkName: 'subfrost-regtest',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suppress console.log/warn/error in tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ===========================================================================
// TEST SUITES
// ===========================================================================

describe('buildAlkaneTransferPsbt', () => {
  // =========================================================================
  // 1. UTXO Selection
  // =========================================================================
  describe('UTXO selection', () => {
    it('should prefer clean UTXOs (no inscriptions/runes/other alkanes)', async () => {
      // UTXO A: clean, has 2M DIESEL
      // UTXO B: has inscriptions, has 5M DIESEL
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '2000000' }]),
          makeAlkaneOutpoint(TXID_B, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [
          makeOrdOutput(TXID_B, 0, ['inscription123']),
        ],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_C, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams({ amount: BigInt(1_000_000) }));

      // Should NOT have collateral warning — clean UTXO A covers the amount
      expect(result.collateralWarning).toBeUndefined();

      // Decode PSBT to verify inputs
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });
      // First input should be the clean UTXO (TXID_A), not the one with inscriptions
      const firstInputHash = Buffer.from(psbt.txInputs[0].hash).reverse().toString('hex');
      expect(firstInputHash).toBe(TXID_A);
    });

    it('should use greedy algorithm — select minimum UTXOs to cover amount', async () => {
      // 3 clean UTXOs: 500k, 300k, 400k. Need 1M.
      // Greedy sorted by amount desc: 500k, 400k, 300k → picks 500k + 400k (covers 900k? no)
      // Actually sorted by cleanliness (all 0), then by amount desc: 500k, 400k, 300k
      // Greedy: 500k (not enough) → 500k + 400k = 900k (not enough) → all 3 = 1.2M
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '500000' }]),
          makeAlkaneOutpoint(TXID_B, 0, 546, [{ block: 2, tx: 0, amount: '300000' }]),
          makeAlkaneOutpoint(TXID_C, 0, 546, [{ block: 2, tx: 0, amount: '400000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_D, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams({ amount: BigInt(1_000_000) }));
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // Should need all 3 alkane UTXOs + 1 BTC UTXO = 4 inputs
      expect(psbt.txInputs.length).toBe(4);
    });

    it('should select fewest UTXOs when one large UTXO suffices', async () => {
      // One large UTXO covers the whole amount
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '10000000' }]),
          makeAlkaneOutpoint(TXID_B, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_C, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams({ amount: BigInt(1_000_000) }));
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // 1 alkane UTXO + 1 BTC UTXO = 2 inputs
      expect(psbt.txInputs.length).toBe(2);
    });

    it('should sort by cleanliness then by amount descending', async () => {
      // UTXO A: clean, 500k DIESEL
      // UTXO B: has other alkanes (score 1), 2M DIESEL
      // UTXO C: clean, 800k DIESEL
      // Need 1M → should pick C (clean, 800k) then A (clean, 500k) = 1.3M, skipping B
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '500000' }]),
          makeAlkaneOutpoint(TXID_B, 0, 546, [
            { block: 2, tx: 0, amount: '2000000' },
            { block: 32, tx: 0, amount: '100' }, // other alkane (frBTC)
          ]),
          makeAlkaneOutpoint(TXID_C, 0, 546, [{ block: 2, tx: 0, amount: '800000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_D, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams({ amount: BigInt(1_000_000) }));

      // Clean UTXOs (A=500k, C=800k) cover 1.3M >= 1M, so no need for B
      expect(result.collateralWarning).toBeUndefined();

      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });
      // Sorted by cleanliness (0) then amount desc: C (800k), A (500k) → both selected
      // 2 alkane + 1 BTC = 3 inputs
      expect(psbt.txInputs.length).toBe(3);
    });

    it('should fall back to dirty UTXOs when clean ones are insufficient', async () => {
      // Only dirty UTXO has enough
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '100' }]), // clean but tiny
          makeAlkaneOutpoint(TXID_B, 0, 546, [
            { block: 2, tx: 0, amount: '5000000' },
            { block: 32, tx: 0, amount: '999' },
          ]),
        ],
        ordOutputs: [makeOrdOutput(TXID_B, 0, ['inscr1'])],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_C, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams({ amount: BigInt(1_000_000) }));

      // Must use the dirty UTXO B → collateral warning
      expect(result.collateralWarning).toBeDefined();
      expect(result.collateralWarning!.hasInscriptions).toBe(true);
    });
  });

  // =========================================================================
  // 2. Collateral Warnings
  // =========================================================================
  describe('collateral warnings', () => {
    it('should warn when selected UTXOs have inscriptions', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [makeOrdOutput(TXID_A, 0, ['inscr1', 'inscr2'])],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      expect(result.collateralWarning).toBeDefined();
      expect(result.collateralWarning!.hasInscriptions).toBe(true);
      expect(result.collateralWarning!.hasRunes).toBe(false);
    });

    it('should warn when selected UTXOs have runes', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [makeOrdOutput(TXID_A, 0, [], { 'SOME_RUNE': { amount: '1000' } })],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      expect(result.collateralWarning).toBeDefined();
      expect(result.collateralWarning!.hasRunes).toBe(true);
      expect(result.collateralWarning!.hasInscriptions).toBe(false);
    });

    it('should set unverifiedInscriptionRunes when ord_outputs is disabled', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordRpcDisabled: true,
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      expect(result.collateralWarning).toBeDefined();
      expect(result.collateralWarning!.unverifiedInscriptionRunes).toBe(true);
    });

    it('should set unverifiedInscriptionRunes when ord_outputs returns error', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordRpcError: true,
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      expect(result.collateralWarning).toBeDefined();
      expect(result.collateralWarning!.unverifiedInscriptionRunes).toBe(true);
    });

    it('should NOT warn for clean UTXOs when ord_outputs works', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [], // No inscriptions or runes
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      expect(result.collateralWarning).toBeUndefined();
    });

    it('should report otherAlkanesCount correctly', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [
            { block: 2, tx: 0, amount: '5000000' },  // target: DIESEL
            { block: 32, tx: 0, amount: '100' },       // other: frBTC
            { block: 2, tx: 6, amount: '50' },          // other: LP token
          ]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      expect(result.collateralWarning).toBeDefined();
      expect(result.collateralWarning!.otherAlkanesCount).toBe(2);
    });

    it('should include utxoCount in collateral warning', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '500000' }]),
          makeAlkaneOutpoint(TXID_B, 0, 546, [{ block: 2, tx: 0, amount: '600000' }]),
        ],
        ordOutputs: [makeOrdOutput(TXID_A, 0, ['inscr1'])],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_C, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      // B is clean (600k) — picked first. Then A with inscription (500k) — need both for 1M.
      expect(result.collateralWarning).toBeDefined();
      expect(result.collateralWarning!.utxoCount).toBe(2);
    });
  });

  // =========================================================================
  // 3. PSBT Output Ordering
  // =========================================================================
  describe('PSBT output ordering', () => {
    it('should produce outputs: v0=sender change, v1=recipient, v2=OP_RETURN, v3=BTC change', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // v0: sender alkane change (taproot address)
      expect(psbt.txOutputs[0].address).toBe(SENDER_TAPROOT);

      // v1: recipient
      expect(psbt.txOutputs[1].address).toBe(RECIPIENT_TAPROOT);

      // v2: OP_RETURN (no address, script starts with OP_RETURN = 0x6a)
      expect(psbt.txOutputs[2].address).toBeUndefined();
      expect(psbt.txOutputs[2].script[0]).toBe(0x6a); // OP_RETURN
      expect(Number(psbt.txOutputs[2].value)).toBe(0);

      // v3: BTC change (back to sender since no separate payment address)
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(3);
      if (psbt.txOutputs.length === 4) {
        expect(psbt.txOutputs[3].address).toBe(SENDER_TAPROOT);
      }
    });

    it('should send BTC change to payment address when separate payment address provided', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      const result = await buildAlkaneTransferPsbt(
        defaultParams({ senderPaymentAddress: SENDER_SEGWIT }),
      );
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // v3: BTC change should go to the segwit payment address
      if (psbt.txOutputs.length === 4) {
        expect(psbt.txOutputs[3].address).toBe(SENDER_SEGWIT);
      }
    });

    it('should omit v3 BTC change output when change is below dust', async () => {
      // Provide just barely enough BTC to cover fee + dust outputs (no change left)
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        // Very small BTC UTXO — after fee + dust outputs, change < 600
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 1500)],
      });

      const result = await buildAlkaneTransferPsbt(
        defaultParams({ feeRate: 1 }),
      );
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // Should have exactly 3 outputs (no BTC change) or 4 if change >= 600
      // The exact count depends on fee calculation, but we verify no tiny change
      for (const output of psbt.txOutputs) {
        if (output.address) {
          expect(Number(output.value)).toBeGreaterThanOrEqual(600);
        }
      }
    });
  });

  // =========================================================================
  // 4. Dust Value
  // =========================================================================
  describe('dust value', () => {
    it('should use 600 sats for alkane dust outputs (v0 and v1)', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // v0 (sender change) and v1 (recipient) should both be 600 sats
      expect(Number(psbt.txOutputs[0].value)).toBe(600);
      expect(Number(psbt.txOutputs[1].value)).toBe(600);
    });

    it('should set OP_RETURN value to 0', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // v2: OP_RETURN should have 0 value
      expect(Number(psbt.txOutputs[2].value)).toBe(0);
    });
  });

  // =========================================================================
  // 5. tapInternalKey
  // =========================================================================
  describe('tapInternalKey', () => {
    it('should apply tapInternalKey to taproot alkane inputs', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // Alkane input (index 0) should have tapInternalKey
      const alkaneInput = psbt.data.inputs[0];
      expect(alkaneInput.tapInternalKey).toBeDefined();
      expect(Buffer.from(alkaneInput.tapInternalKey!).toString('hex')).toBe(TAP_INTERNAL_KEY_HEX);
    });

    it('should apply tapInternalKey to BTC fee inputs from taproot address', async () => {
      // When no separate payment address, BTC UTXOs come from taproot → should get tapInternalKey
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // BTC fee input (index 1) should also have tapInternalKey since it's from taproot address
      const btcInput = psbt.data.inputs[1];
      expect(btcInput.tapInternalKey).toBeDefined();
    });

    it('should NOT apply tapInternalKey to segwit BTC fee inputs', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(
        defaultParams({ senderPaymentAddress: SENDER_SEGWIT }),
      );
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // BTC fee input from segwit address should NOT have tapInternalKey
      const btcInput = psbt.data.inputs[1];
      expect(btcInput.tapInternalKey).toBeUndefined();
    });

    it('should handle 66-char pubkey hex (with 02/03 prefix) by stripping prefix', async () => {
      const prefixedKey = '02' + TAP_INTERNAL_KEY_HEX;

      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(
        defaultParams({ tapInternalKeyHex: prefixedKey }),
      );
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // Should strip the 02 prefix and use the 32-byte x-only key
      const alkaneInput = psbt.data.inputs[0];
      expect(alkaneInput.tapInternalKey).toBeDefined();
      expect(alkaneInput.tapInternalKey!.length).toBe(32);
      expect(Buffer.from(alkaneInput.tapInternalKey!).toString('hex')).toBe(TAP_INTERNAL_KEY_HEX);
    });

    it('should work without tapInternalKey (optional param)', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      const result = await buildAlkaneTransferPsbt(
        defaultParams({ tapInternalKeyHex: undefined }),
      );
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // Should succeed without tapInternalKey
      expect(psbt.data.inputs[0].tapInternalKey).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. Fee Estimation
  // =========================================================================
  describe('fee estimation', () => {
    it('should return a positive estimated fee', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams({ feeRate: 5 }));
      expect(result.estimatedFee).toBeGreaterThan(0);
    });

    it('should increase fee with higher fee rate', async () => {
      const mkMock = () => ({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [] as ReturnType<typeof makeOrdOutput>[],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 1000000)],
      });

      setupFetchMock(mkMock());
      const lowFee = await buildAlkaneTransferPsbt(defaultParams({ feeRate: 1 }));

      setupFetchMock(mkMock());
      const highFee = await buildAlkaneTransferPsbt(defaultParams({ feeRate: 10 }));

      expect(highFee.estimatedFee).toBeGreaterThan(lowFee.estimatedFee);
    });

    it('should increase fee with more inputs (more UTXOs needed)', async () => {
      // Scenario 1: 1 alkane UTXO
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 1000000)],
      });
      const result1 = await buildAlkaneTransferPsbt(defaultParams({ feeRate: 5 }));

      // Scenario 2: 3 alkane UTXOs needed
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '400000' }]),
          makeAlkaneOutpoint(TXID_B, 0, 546, [{ block: 2, tx: 0, amount: '400000' }]),
          makeAlkaneOutpoint(TXID_C, 0, 546, [{ block: 2, tx: 0, amount: '400000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_D, 0, 1000000)],
      });
      const result2 = await buildAlkaneTransferPsbt(defaultParams({ feeRate: 5 }));

      // More inputs → higher fee
      expect(result2.estimatedFee).toBeGreaterThan(result1.estimatedFee);
    });

    it('should produce different fees for segwit vs taproot payment inputs', async () => {
      // Taproot-only (no separate payment)
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 1000000)],
      });
      const taprootOnly = await buildAlkaneTransferPsbt(defaultParams({ feeRate: 5 }));

      // With separate segwit payment address
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 1000000)],
      });
      const withSegwit = await buildAlkaneTransferPsbt(
        defaultParams({ senderPaymentAddress: SENDER_SEGWIT, feeRate: 5 }),
      );

      // Segwit inputs are 68 vB vs taproot 57.5 vB, but change output differs too
      // (P2WPKH=31 vB vs P2TR=43 vB). The fees should differ due to different vsize.
      expect(taprootOnly.estimatedFee).not.toBe(withSegwit.estimatedFee);
      // Both should be reasonable positive values
      expect(taprootOnly.estimatedFee).toBeGreaterThan(0);
      expect(withSegwit.estimatedFee).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 7. Error Cases
  // =========================================================================
  describe('error cases', () => {
    it('should throw when no UTXOs contain the target alkane', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          // Has frBTC (32:0) but NOT DIESEL (2:0)
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 32, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      await expect(
        buildAlkaneTransferPsbt(defaultParams({ alkaneId: '2:0' })),
      ).rejects.toThrow('No UTXOs found containing alkane 2:0');
    });

    it('should throw when alkane balance is insufficient', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '500' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      await expect(
        buildAlkaneTransferPsbt(defaultParams({ amount: BigInt(1000) })),
      ).rejects.toThrow('Insufficient balance: have 500, need 1000');
    });

    it('should throw when BTC is insufficient for fees', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [], // No BTC UTXOs at all
      });

      await expect(
        buildAlkaneTransferPsbt(defaultParams()),
      ).rejects.toThrow('Insufficient BTC for fee');
    });

    it('should throw when alkane outpoints RPC fails', async () => {
      // Override fetch to return an RPC error for alkanes_protorunesbyaddress
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
          const body = init?.body ? JSON.parse(init.body as string) : undefined;

          if (urlStr.includes('subfrost.io') && body?.method === 'alkanes_protorunesbyaddress') {
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                error: { message: 'internal server error' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
          // ord_outputs — just return empty to avoid blocking
          if (urlStr.includes('subfrost.io') && body?.method === 'ord_outputs') {
            return new Response(
              JSON.stringify({ jsonrpc: '2.0', id: 1, result: [] }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          }
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }),
      );

      await expect(
        buildAlkaneTransferPsbt(defaultParams()),
      ).rejects.toThrow('Failed to fetch alkane outpoints');
    });

    it('should throw when no alkane outpoints returned at all', async () => {
      setupFetchMock({
        alkaneOutpoints: [], // Empty — no alkanes at address
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 50000)],
      });

      await expect(
        buildAlkaneTransferPsbt(defaultParams()),
      ).rejects.toThrow('No UTXOs found containing alkane 2:0');
    });
  });

  // =========================================================================
  // 8. BTC UTXO Fetching Fallback
  // =========================================================================
  describe('BTC UTXO fetching', () => {
    it('should fall back to REST API when JSON-RPC returns empty', async () => {
      const restUtxos = [makeEsploraUtxo(TXID_C, 0, 80000)];

      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [], // JSON-RPC returns empty
        esploraRestUtxos: restUtxos, // REST fallback has UTXOs
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());

      // Should succeed using REST fallback UTXOs
      expect(result.psbtBase64).toBeDefined();
      expect(result.estimatedFee).toBeGreaterThan(0);
    });

    it('should exclude alkane UTXOs from BTC fee funding (single-address mode)', async () => {
      // Same TXID_A is used as alkane UTXO AND appears in esplora results
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [
          makeEsploraUtxo(TXID_A, 0, 546),  // Same as alkane UTXO — should be excluded
          makeEsploraUtxo(TXID_B, 0, 50000), // Real BTC UTXO
        ],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // Should have 2 inputs: 1 alkane (TXID_A) + 1 BTC (TXID_B)
      expect(psbt.txInputs.length).toBe(2);
      const inputTxids = psbt.txInputs.map(
        (inp) => Buffer.from(inp.hash).reverse().toString('hex'),
      );
      expect(inputTxids).toContain(TXID_A);
      expect(inputTxids).toContain(TXID_B);
    });

    it('should only use confirmed BTC UTXOs', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [
          makeEsploraUtxo(TXID_B, 0, 1000000, false), // unconfirmed — should be skipped
          makeEsploraUtxo(TXID_C, 0, 50000, true),     // confirmed — should be used
        ],
      });

      const result = await buildAlkaneTransferPsbt(defaultParams());
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      const btcInputTxid = Buffer.from(psbt.txInputs[1].hash).reverse().toString('hex');
      expect(btcInputTxid).toBe(TXID_C); // Only the confirmed one
    });
  });

  // =========================================================================
  // 9. Recipient address types
  // =========================================================================
  describe('recipient address types', () => {
    it('should handle segwit recipient address', async () => {
      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      const result = await buildAlkaneTransferPsbt(
        defaultParams({ recipientAddress: SENDER_SEGWIT }),
      );
      const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: REGTEST_NETWORK });

      // v1 should be the segwit recipient
      expect(psbt.txOutputs[1].address).toBe(SENDER_SEGWIT);
    });
  });

  // =========================================================================
  // 10. ProtoStone / SDK mock integration
  // =========================================================================
  describe('protostone construction', () => {
    it('should call ProtoStone.edicts with correct alkane ID and amount', async () => {
      const sdk = await import('@alkanes/ts-sdk') as any;

      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 32, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      await buildAlkaneTransferPsbt(defaultParams({ alkaneId: '32:0', amount: BigInt(42) }));

      expect(sdk.ProtoStone.edicts).toHaveBeenCalledWith({
        protocolTag: 1n,
        edicts: [{
          id: { block: 32n, tx: 0n },
          amount: 42n,
          output: 1, // v1 = recipient
        }],
      });
    });

    it('should call encodeRunestoneProtostone with pointer=0 for sender change', async () => {
      const sdk = await import('@alkanes/ts-sdk') as any;

      setupFetchMock({
        alkaneOutpoints: [
          makeAlkaneOutpoint(TXID_A, 0, 546, [{ block: 2, tx: 0, amount: '5000000' }]),
        ],
        ordOutputs: [],
        esploraRpcUtxos: [makeEsploraUtxo(TXID_B, 0, 100000)],
      });

      await buildAlkaneTransferPsbt(defaultParams());

      expect(sdk.encodeRunestoneProtostone).toHaveBeenCalledWith({
        protostones: [expect.anything()],
        pointer: 0, // unedicted remainder → v0 (sender change)
      });
    });
  });
});
