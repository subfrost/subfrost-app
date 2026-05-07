/**
 * Isolated test: Universal Router initialization through upgradeable proxy.
 *
 * PURPOSE: Debug why initThroughProxy hangs the browser devnet boot at 99%.
 * This test deploys ONLY the router contracts and measures timing.
 *
 * HYPOTHESIS: alkanesExecuteFull hangs when wallet has 300+ UTXOs (browser boot
 * accumulates UTXOs from all prior deploys). This test runs with a fresh wallet
 * (~100 UTXOs) to confirm the init TX succeeds.
 *
 * Run: npx vitest run __tests__/devnet/router-init-isolated.test.ts --testTimeout=120000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
} from './devnet-helpers';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

function loadProdWasm(name: string): string {
  const path = resolve(__dirname, '../../prod_wasms', name);
  return readFileSync(path).toString('hex');
}

let harness: any;
let provider: WebProvider;
let segwitAddress: string;
let taprootAddress: string;

async function deployReserved(wasmFile: string, slot: number, args: number[], label: string) {
  const wasmHex = loadProdWasm(wasmFile);
  const argsStr = args.length > 0 ? `,${args.join(',')}` : '';
  const t0 = Date.now();
  await (provider as any).alkanesExecuteFull(
    JSON.stringify([taprootAddress]),
    'B:100000:v0',
    `[3,${slot}${argsStr}]:v0:v0`,
    '1',
    wasmHex,
    JSON.stringify({
      from_addresses: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      mine_enabled: true,
    }),
  );
  mineBlocks(harness, 1);
  await new Promise(r => setTimeout(r, 200));
  console.log(`[router-iso] ${label} → [4:${slot}] (${Date.now() - t0}ms)`);
}

async function executeCall(protostone: string, inputRequirements: string) {
  const t0 = Date.now();
  console.log(`[router-iso] executeCall START: ${protostone}`);
  await (provider as any).alkanesExecuteFull(
    JSON.stringify([taprootAddress]),
    inputRequirements,
    protostone,
    '1',
    null,
    JSON.stringify({
      from_addresses: [segwitAddress, taprootAddress],
      change_address: segwitAddress,
      alkanes_change_address: taprootAddress,
      mine_enabled: true,
    }),
  );
  console.log(`[router-iso] executeCall DONE in ${Date.now() - t0}ms`);
  mineBlocks(harness, 1);
  await new Promise(r => setTimeout(r, 200));
}

async function simulateAlkane(target: string, inputs: string[]): Promise<any> {
  const [block, tx] = target.split(':');
  return rpcCall('alkanes_simulate', [{
    target: { block, tx },
    inputs,
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '500',
    txindex: 0,
    vout: 0,
  }]);
}

describe('Universal Router Init — Isolated', () => {
  beforeAll(async () => {
    disposeHarness();
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    mineBlocks(harness, 201);
    console.log('[router-iso] Chain ready, deploying router contracts...');

    // Deploy ONLY router impl + proxy (minimal — no controller, no AMM)
    await deployReserved('universal_router.wasm', 80002, [0], 'Router Impl');
    await deployReserved('alkanes_std_upgradeable.wasm', 70002, [0x7fff, 4, 80002, 1], 'Router Proxy');

    console.log('[router-iso] Router deployed. Setup complete.');
  }, 120_000);

  afterAll(() => {
    disposeHarness();
  });

  it('should simulate router GetController (opcode 11) through proxy', async () => {
    // Before init — should fail because /controller storage is empty
    // opcode 11 = get-controller per alkanes.toml
    const result = await simulateAlkane('4:70002', ['11']);
    const err = result?.result?.execution?.error;
    console.log('[router-iso] GetController pre-init:', err || 'OK data=' + result?.result?.execution?.data);
    // Either an error (proxy delegatecall fails) or empty data — both are fine pre-init
  }, 30_000);

  it('should simulate router Initialize (opcode 0) through proxy', async () => {
    // Simulate the init call — does NOT write state, just checks if it would succeed
    const result = await simulateAlkane('4:70002', ['0', '4', '70000', '4', '65522']);
    const err = result?.result?.execution?.error;
    console.log('[router-iso] Init simulation:', err ? `ERROR: ${err.slice(0, 150)}` : 'OK');
    // Log full result for debugging
    console.log('[router-iso] Init sim data:', result?.result?.execution?.data);
  }, 30_000);

  it('should execute router init through proxy and measure timing', async () => {
    // This is the actual init call — writes controller + factory pointers
    // Measures timing to see if it's the WASM PSBT construction that's slow
    const t0 = Date.now();
    try {
      await executeCall(
        '[4,70002,0,4,70000,4,65522]:v0:v0',
        'B:10000:v0',
      );
      console.log(`[router-iso] Router init TX completed in ${Date.now() - t0}ms`);
    } catch (e: any) {
      console.error(`[router-iso] Router init TX FAILED after ${Date.now() - t0}ms:`, e?.message?.slice(0, 200));
      throw e;
    }
  }, 60_000);

  it('should verify router GetController returns data after init', async () => {
    // opcode 11 = get-controller per alkanes.toml
    const result = await simulateAlkane('4:70002', ['11']);
    const err = result?.result?.execution?.error;
    console.log('[router-iso] GetController post-init:', err || 'OK data=' + result?.result?.execution?.data);

    // Also try querying impl directly (bypassing proxy)
    const implResult = await simulateAlkane('4:80002', ['11']);
    const implErr = implResult?.result?.execution?.error;
    console.log('[router-iso] GetController on impl:', implErr || 'OK data=' + implResult?.result?.execution?.data);
  }, 30_000);

  it('should count UTXOs to measure wallet bloat', async () => {
    // Count how many UTXOs the wallet has at this point
    const segwitUtxos = await rpcCall('esplora_address::utxo', [segwitAddress]);
    const taprootUtxos = await rpcCall('esplora_address::utxo', [taprootAddress]);

    const segCount = segwitUtxos?.result?.length || 0;
    const tapCount = taprootUtxos?.result?.length || 0;
    console.log(`[router-iso] UTXOs: segwit=${segCount}, taproot=${tapCount}, total=${segCount + tapCount}`);

    // The browser boot has 300+ UTXOs by the time router init runs
    // This isolated test should have far fewer
    expect(segCount + tapCount).toBeLessThan(200);
  }, 30_000);
});
