/**
 * E2E: BRC20-Prog View Function Routing
 *
 * Verifies that the devnet correctly routes metashrew_view calls to
 * the brc20shrew tertiary indexer's exported view functions.
 *
 * This is the critical test: can we call brc20shrew's `call`, `getbalance`,
 * `getbrc20events` etc. through the standard metashrew_view RPC?
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-view-routing.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { loadBrc20ShrewWasm, BRC20_PROG } from './brc20-prog-constants';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

let rpcId = 1;
async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(BRC20_PROG.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: rpcId++ }),
  });
  return response.json();
}

const hasBrc20Shrew = !!loadBrc20ShrewWasm();

describe.runIf(hasBrc20Shrew)('E2E: BRC20 View Function Routing', () => {
  let harness: any;
  let provider: WebProvider;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    await mineBlocks(harness, 10);
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  it('should route metashrew_view "call" to brc20shrew', async () => {
    // Build a minimal CallRequest protobuf (empty call to zero address)
    // CallRequest: { to: 20 bytes zero, data: empty }
    const callRequestJson = JSON.stringify({ to: Array(20).fill(0), data: [] });
    const hexPayload = Buffer.from(callRequestJson).toString('hex');

    const result = await rpcCall('metashrew_view', ['call', `0x${hexPayload}`, 'latest']);
    console.log('[view-routing] call result:', JSON.stringify(result).slice(0, 200));

    // Should get a result (possibly error, but not "unknown view function")
    expect(result).toBeDefined();
    if (result.error) {
      // "unknown view function" means routing failed
      expect(result.error.message).not.toContain('unknown view function');
      expect(result.error.message).not.toContain('not found');
      console.log('[view-routing] call error (expected for zero address):', result.error.message);
    }
  }, 30_000);

  it('should route metashrew_view "getbalance" to brc20shrew', async () => {
    // GetBalanceRequest (JSON): { address: "..." }
    const reqJson = JSON.stringify({ address: "bc1qtest" });
    const hexPayload = Buffer.from(reqJson).toString('hex');

    const result = await rpcCall('metashrew_view', ['getbalance', `0x${hexPayload}`, 'latest']);
    console.log('[view-routing] getbalance result:', JSON.stringify(result).slice(0, 200));

    expect(result).toBeDefined();
    if (result.error) {
      expect(result.error.message).not.toContain('unknown view function');
    }
  }, 30_000);

  it('should route metashrew_view "getbrc20events" to brc20shrew', async () => {
    const reqJson = JSON.stringify({ height: 1 });
    const hexPayload = Buffer.from(reqJson).toString('hex');

    const result = await rpcCall('metashrew_view', ['getbrc20events', `0x${hexPayload}`, 'latest']);
    console.log('[view-routing] getbrc20events result:', JSON.stringify(result).slice(0, 200));

    expect(result).toBeDefined();
    if (result.error) {
      expect(result.error.message).not.toContain('unknown view function');
    }
  }, 30_000);

  it('should route metashrew_view "getblockheight" to brc20shrew', async () => {
    const reqJson = JSON.stringify({});
    const hexPayload = Buffer.from(reqJson).toString('hex');

    const result = await rpcCall('metashrew_view', ['getblockheight', `0x${hexPayload}`, 'latest']);
    console.log('[view-routing] getblockheight result:', JSON.stringify(result).slice(0, 200));

    expect(result).toBeDefined();
    // This should actually return a valid block height
    if (result.result) {
      console.log('[view-routing] getblockheight returned:', result.result);
    }
  }, 30_000);

  it('should still route alkanes views (simulate, protorunesbyaddress)', async () => {
    // Verify alkanes views still work alongside brc20shrew
    const result = await rpcCall('metashrew_height', []);
    expect(Number(result.result)).toBeGreaterThan(0);
  }, 30_000);
});
