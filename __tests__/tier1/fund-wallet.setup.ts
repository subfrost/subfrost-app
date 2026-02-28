/**
 * Wallet funding setup for Tier 1 integration tests.
 *
 * Ensures the test wallet has sufficient BTC and frBTC for swap/send tests.
 * Run before other Tier 1 tests via vitest's globalSetup or beforeAll.
 */

import { createRegtestTestContext, mineBlocks, getBtcBalance, sleep } from '../shared/regtest-helpers';
import { signAndBroadcast } from '../shared/sign-and-broadcast';
import { REGTEST } from '../shared/regtest-constants';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';
import { buildWrapProtostone } from '@/lib/alkanes/builders';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const MIN_BTC_SATS = 100_000_000n; // 1 BTC minimum
const WRAP_AMOUNT_SATS = 10_000_000; // 0.1 BTC to wrap for frBTC

/**
 * Fund the test wallet if needed. Returns the test context.
 */
export async function fundTestWallet() {
  console.log('[fund-wallet] Setting up regtest test context...');
  const ctx = await createRegtestTestContext();
  const { provider, signer, segwitAddress, taprootAddress } = ctx;

  // Check BTC balance
  const btcBalance = await getBtcBalance(provider, segwitAddress);
  console.log(`[fund-wallet] Current BTC balance: ${btcBalance} sats (${Number(btcBalance) / 1e8} BTC)`);

  if (btcBalance < MIN_BTC_SATS) {
    console.log('[fund-wallet] Insufficient BTC — mining 201 blocks...');
    // Mine 201 blocks to make coinbase spendable (100-block maturity)
    await mineBlocks(provider, 201, segwitAddress);
    await sleep(3000);

    const newBalance = await getBtcBalance(provider, segwitAddress);
    console.log(`[fund-wallet] BTC balance after mining: ${newBalance} sats`);

    if (newBalance < MIN_BTC_SATS) {
      throw new Error(`Failed to fund wallet: balance ${newBalance} < ${MIN_BTC_SATS}`);
    }
  }

  // Wrap some BTC to get frBTC for swap tests
  console.log(`[fund-wallet] Wrapping ${WRAP_AMOUNT_SATS} sats to frBTC...`);
  try {
    await wrapBtcToFrbtc(provider, signer, taprootAddress, segwitAddress, WRAP_AMOUNT_SATS);
    console.log('[fund-wallet] frBTC wrap successful');
  } catch (error: any) {
    console.warn(`[fund-wallet] frBTC wrap failed (may already have frBTC): ${error.message}`);
  }

  console.log('[fund-wallet] Setup complete');
  return ctx;
}

async function wrapBtcToFrbtc(
  provider: WebProvider,
  signer: any,
  taprootAddress: string,
  segwitAddress: string,
  amountSats: number
) {
  const protostones = buildWrapProtostone({ frbtcId: REGTEST.FRBTC_ID });
  const inputRequirements = `B:${amountSats}:v0`;

  const result = await alkanesExecuteTyped(provider, {
    protostones,
    inputRequirements,
    feeRate: 2,
    toAddresses: [REGTEST.FRBTC_SIGNER, taprootAddress],
    fromAddresses: [segwitAddress, taprootAddress],
    changeAddress: segwitAddress,
    alkanesChangeAddress: taprootAddress,
  });

  return signAndBroadcast(provider, result, signer, segwitAddress);
}
