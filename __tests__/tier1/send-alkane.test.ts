/**
 * Tier 1: Alkane Token Send Test
 *
 * Verifies sending alkane tokens (DIESEL) from one address to another on regtest.
 * Uses the protostone edict pattern for alkane transfers.
 *
 * Run: INTEGRATION=true pnpm vitest run __tests__/tier1/send-alkane.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { REGTEST } from '../shared/regtest-constants';
import {
  createRegtestTestContext,
  getAlkaneBalance,
  getBtcBalance,
  mineBlocks,
  sleep,
} from '../shared/regtest-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';
import {
  buildTransferProtostone,
  buildTransferInputRequirements,
} from '@/lib/alkanes/builders';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;
const TRANSFER_AMOUNT = '1000000'; // 1M DIESEL

describe.runIf(INTEGRATION)('Tier 1: Send Alkane (DIESEL)', () => {
  let provider: WebProvider;
  let signer: TestSignerResult;
  let taprootAddress: string;
  let segwitAddress: string;
  // Use a known regtest taproot address as recipient
  const recipientTaproot = 'bcrt1pqjwdlfg4lht3jwl0p5u58yn8fc2ksqx5v44g6ekcru5szdm2u32qum3gpe';

  beforeAll(async () => {
    const ctx = await createRegtestTestContext();
    provider = ctx.provider;
    signer = ctx.signer;
    taprootAddress = ctx.taprootAddress;
    segwitAddress = ctx.segwitAddress;

    // Fund wallet
    const btcBalance = await getBtcBalance(provider, segwitAddress);
    if (btcBalance < 100_000_000n) {
      await mineBlocks(provider, 201, segwitAddress);
      await sleep(3000);
    }
  }, 120_000);

  it('should transfer DIESEL to a recipient and verify balances', async () => {
    // Snapshot balances
    const senderBefore = await getAlkaneBalance(provider, taprootAddress, REGTEST.DIESEL_ID);
    const recipientBefore = await getAlkaneBalance(provider, recipientTaproot, REGTEST.DIESEL_ID);
    console.log(`[send-alkane] Before: sender=${senderBefore}, recipient=${recipientBefore}`);

    // Build transfer protostone
    const protostones = buildTransferProtostone({
      alkaneId: REGTEST.DIESEL_ID,
      amount: TRANSFER_AMOUNT,
    });

    const inputRequirements = buildTransferInputRequirements({
      alkaneId: REGTEST.DIESEL_ID,
      amount: TRANSFER_AMOUNT,
    });

    console.log(`[send-alkane] Protostones: ${protostones}`);
    console.log(`[send-alkane] InputReqs: ${inputRequirements}`);

    // Execute: v0=sender(change), v1=recipient
    const result = await alkanesExecuteTyped(provider, {
      protostones,
      inputRequirements,
      feeRate: 2,
      fromAddresses: [segwitAddress, taprootAddress],
      toAddresses: [taprootAddress, recipientTaproot],
      changeAddress: segwitAddress,
      alkanesChangeAddress: taprootAddress,
    });

    expect(result).toBeTruthy();

    const txid = await signAndBroadcast(provider, result, signer, segwitAddress);
    console.log(`[send-alkane] Broadcast txid: ${txid}`);
    expect(txid).toBeTruthy();

    await sleep(3000);

    // Verify
    const senderAfter = await getAlkaneBalance(provider, taprootAddress, REGTEST.DIESEL_ID);
    const recipientAfter = await getAlkaneBalance(provider, recipientTaproot, REGTEST.DIESEL_ID);
    console.log(`[send-alkane] After: sender=${senderAfter}, recipient=${recipientAfter}`);

    // Sender should have less DIESEL
    expect(senderAfter).toBeLessThan(senderBefore);

    // Recipient should have more DIESEL
    expect(recipientAfter).toBeGreaterThan(recipientBefore);
    const gained = recipientAfter - recipientBefore;
    expect(gained).toBe(BigInt(TRANSFER_AMOUNT));
    console.log(`[send-alkane] Transferred: ${gained} DIESEL`);
  }, 120_000);
});
