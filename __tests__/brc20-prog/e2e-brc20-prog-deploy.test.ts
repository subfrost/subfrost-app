/**
 * E2E: BRC20-Prog Contract Deployment
 *
 * Tests the commit-reveal-activation deployment pattern for BRC20-Prog
 * contracts (FrBTC.sol) and alkane vault deployment.
 *
 * Run: pnpm vitest run __tests__/brc20-prog/e2e-brc20-prog-deploy.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createBrc20DevnetContext,
  disposeBrc20Harness,
  mineBlocks,
} from './brc20-prog-helpers';
import { deployBrc20ProgStack } from './brc20-prog-deploy';
import { loadFrBtcFoundryJson, loadVaultWasm } from './brc20-prog-constants';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('E2E: BRC20-Prog Deployment', () => {
  let harness: any;
  let provider: WebProvider;
  let segwitAddress: string;
  let taprootAddress: string;
  let signer: any;

  const hasFoundryJson = !!loadFrBtcFoundryJson();
  const hasVaultWasm = !!loadVaultWasm();

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    await mineBlocks(harness, 201);
  }, 300_000);

  afterAll(() => {
    disposeBrc20Harness();
  });

  it.runIf(hasFoundryJson)(
    'should deploy FrBTC.sol via commit-reveal-activation',
    async () => {
      const rawProvider = provider;
      const foundryJson = loadFrBtcFoundryJson();

      const result = await rawProvider.brc20_prog_deploy_contract(
        'regtest',
        JSON.stringify(foundryJson),
        JSON.stringify({
          fee_rate: 1,
          mine_enabled: true,
          use_activation: true,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      harness.mineBlocks(3);

      // Should have commit and reveal txids
      expect(
        parsed.commit_txid || parsed.commitTxid
      ).toBeDefined();
      expect(
        parsed.reveal_txid || parsed.revealTxid
      ).toBeDefined();
    },
    120_000,
  );

  it.runIf(hasVaultWasm)(
    'should deploy fr-brc20-vault alkane contract',
    async () => {
      const { vaultId } = await deployBrc20ProgStack(
        provider, signer, segwitAddress, taprootAddress, harness
      );

      expect(vaultId).toBeDefined();
      expect(vaultId).toMatch(/^4:\d+$/);
    },
    120_000,
  );
});
