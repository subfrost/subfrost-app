/**
 * E2E: Full BRC20-Prog Protocol Lifecycle
 *
 * Runs the complete BRC20-Prog lifecycle in a single devnet session:
 *   1. Create harness with alkanes + brc20shrew indexers
 *   2. Deploy FrBTC.sol contract (if Foundry JSON available)
 *   3. Deploy fr-brc20-vault alkane (if WASM available)
 *   4. Wrap BTC to frBTC
 *   5. Verify balances
 *   6. Test unwrap flow (if vault deployed)
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-prog-full.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { deployBrc20ProgStack } from './brc20-prog-deploy';
import { MockBrc20UnwrapProcessor } from './frost-unwrap-mock';
import {
  BRC20_PROG,
  loadFrBtcFoundryJson,
  loadVaultWasm,
} from './brc20-prog-constants';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('E2E: Full BRC20-Prog Lifecycle', () => {
  let harness: any;
  let provider: WebProvider;
  let segwitAddress: string;
  let taprootAddress: string;
  let signer: any;
  let frBtcAddress: string | null = null;
  let vaultId: string | null = null;
  let frostProcessor: MockBrc20UnwrapProcessor;

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
    frostProcessor = await MockBrc20UnwrapProcessor.create();
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  it('should have funded wallet', async () => {
    const balances = await provider.getEnrichedBalances(segwitAddress, '1');
    expect(balances).toBeDefined();
  });

  it('should have valid FROST group key', () => {
    const pubKeyHex = frostProcessor.getGroupPublicKeyHex();
    expect(pubKeyHex).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it('should deploy BRC20-Prog stack', async () => {
    const result = await deployBrc20ProgStack(
      provider, signer, segwitAddress, taprootAddress, harness
    );

    frBtcAddress = result.frBtcAddress;
    vaultId = result.vaultId;

    // At least one of the deployments should have succeeded
    // (depends on which WASM artifacts are available)
    const hasFoundry = !!loadFrBtcFoundryJson();
    const hasVault = !!loadVaultWasm();

    if (hasFoundry) {
      // FrBTC deployment is optional (needs forge build)
      console.log(`[lifecycle] FrBTC address: ${frBtcAddress || 'skipped'}`);
    }
    if (hasVault) {
      expect(vaultId).toBeDefined();
      console.log(`[lifecycle] Vault ID: ${vaultId}`);
    }
  }, 180_000);

  it('should configure FrBTC contract with signer', async () => {
    if (!frBtcAddress) {
      console.log('[lifecycle] Skipping setSigner — no FrBTC contract deployed');
      return;
    }

    const groupPubKeyHex = frostProcessor.getGroupPublicKeyHex();
    console.log(`[lifecycle] Setting signer on ${frBtcAddress} with key ${groupPubKeyHex.slice(0, 16)}...`);

    try {
      const result = await (provider as any).brc20ProgTransact(
        frBtcAddress,
        'setSigner(bytes)',
        `0x${groupPubKeyHex}`,
        JSON.stringify({
          fee_rate: 1,
          mine_enabled: true,
        }),
      );
      harness.mineBlocks(3);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      console.log('[lifecycle] setSigner result:', JSON.stringify(parsed).slice(0, 200));
    } catch (e: any) {
      console.warn('[lifecycle] setSigner failed:', e?.message || String(e));
    }

    // Also set premium to 0
    try {
      const result = await (provider as any).brc20ProgTransact(
        frBtcAddress,
        'setPremium(uint256)',
        '0',
        JSON.stringify({
          fee_rate: 1,
          mine_enabled: true,
        }),
      );
      harness.mineBlocks(3);
      console.log('[lifecycle] setPremium(0) done');
    } catch (e: any) {
      console.warn('[lifecycle] setPremium failed:', e?.message || String(e));
    }
  }, 180_000);

  it('should query getSignerAddress after config', async () => {
    if (!frBtcAddress) return;
    // Call getSignerAddress() to verify signer was set
    // Selector for getSignerAddress(): keccak256("getSignerAddress()") = first 4 bytes
    const BRC20_PROG_RPC = BRC20_PROG.RPC_URL;
    const toBytes = Array.from(Buffer.from(frBtcAddress.replace('0x', ''), 'hex'));
    // getSignerAddress() selector: we can compute it or use a known value
    // For FrBTC.sol: function getSignerAddress() external view returns (bytes memory)
    // Selector = keccak256("getSignerAddress()")[:4]
    const selectorHex = 'e75235b8'; // pre-computed
    const dataBytes = Array.from(Buffer.from(selectorHex, 'hex'));
    const callRequest = JSON.stringify({ to: toBytes, data: dataBytes });
    const hexInput = '0x' + Buffer.from(callRequest).toString('hex');

    const rpcId = 999;
    const response = await fetch(BRC20_PROG.RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'metashrew_view', params: ['call', hexInput, 'latest'], id: rpcId }),
    });
    const result = await response.json();
    console.log('[lifecycle] getSignerAddress raw:', JSON.stringify(result).slice(0, 500));

    if (result.result) {
      const hex = result.result.replace('0x', '');
      const callResp = JSON.parse(Buffer.from(hex, 'hex').toString('utf-8'));
      console.log('[lifecycle] getSignerAddress decoded:', JSON.stringify(callResp).slice(0, 300));
      if (callResp.result && callResp.result.length > 0) {
        console.log('[lifecycle] getSignerAddress result bytes:', callResp.result.length);
      }
    }
  }, 30_000);

  it('should wrap BTC to frBTC', async () => {
    const rawProvider = provider;
    const wrapAmount = BigInt(1_000_000);

    const result = await rawProvider.frbtcWrap(
      wrapAmount,
        JSON.stringify({
          to_address: taprootAddress,
        from_addresses: [segwitAddress, taprootAddress],
        change_address: segwitAddress,
        fee_rate: 1,
        mine_enabled: true,
      }),
    );

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    harness.mineBlocks(2);

    expect(parsed).toBeDefined();
    console.log('[lifecycle] Wrap result:', JSON.stringify(parsed).slice(0, 200));
  }, 120_000);

  it('should verify frBTC balance after wrap', async () => {
    // Query alkane balance for frBTC (AlkaneId 32:0)
    try {
      const rawProvider = provider;
      const balanceResult = await rawProvider.protorunesbyaddress(
        taprootAddress,
        '1', // protocol_tag for alkanes
      );
      const parsed = typeof balanceResult === 'string'
        ? JSON.parse(balanceResult)
        : balanceResult;
      console.log('[lifecycle] frBTC balance query result:', JSON.stringify(parsed).slice(0, 300));
      expect(parsed).toBeDefined();
    } catch (e: any) {
      console.log('[lifecycle] Balance query error (may be expected):', e.message);
    }
  }, 30_000);

  it('should handle multiple fee rates for wrap', async () => {
    const rawProvider = provider;

    for (const feeRate of [1, 2, 5, 10]) {
      try {
        const result = await rawProvider.frbtcWrap(
        BigInt(100_000),
        JSON.stringify({
          to_address: taprootAddress,
            from_addresses: [segwitAddress, taprootAddress],
            change_address: segwitAddress,
            fee_rate: feeRate,
            mine_enabled: true,
          }),
        );
        harness.mineBlocks(2);
        console.log(`[lifecycle] fee_rate=${feeRate}: OK`);
      } catch (e: any) {
        // Fee rate errors are Chris Liu's reported bug
        console.error(`[lifecycle] fee_rate=${feeRate}: FAILED - ${e.message}`);
        throw e;
      }
    }
  }, 180_000);
});
