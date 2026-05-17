/**
 * Frostlend in-browser deployment, ported from `reference/frost-lend/scripts/deploy-all.sh`.
 *
 * Reuses the boot.ts primitives (deployWasm, executeCall, fetchWasmHex) so we get the same
 * commit/reveal flow, mining cadence, and CREATERESERVED atomic-rollback semantics.
 *
 * Five phases (order matters):
 *   1. Deploy 11 WASMs (auth-token-factory FIRST — TroveManager + BorrowerOps spawn auth
 *      tokens during their initialize() and need the factory live).
 *   2. Initialize 9 contracts (opcode 0). frost-usd-token + frost-lend-fire-token init
 *      themselves; the rest set up cross-references.
 *   3. SetParams (BorrowerOps opcode 70) — locks MCR/CCR/min_net_debt/gas_comp/max_fee
 *      before finalize_auth permanently freezes the param storage.
 *   4. FinalizeAuth (opcode 60) on the 7 callee contracts — they read BorrowerOps' /
 *      TroveManager's protocol auth tokens via staticcall and store them. After this,
 *      cross-contract calls are auth-gated.
 *   5. PostPrice (PriceFeed opcode 1) — set initial $50k/BTC price (mock oracle).
 *
 * After deployment, the protocol is live: users can OpenTrove, deposit to SP, and (after
 * the 14-day bootstrap window) redeem.
 *
 * ⚠️ ALKANE UTXO: deployWasm and executeCall do NOT set ordinals_strategy, so they may
 * spend alkane-bearing UTXOs as fee inputs. Frostlend deployment is on a fresh devnet
 * (no pre-existing alkane balances at the deployer), so this is safe — but if you call
 * this AFTER Phase 10a re-mints DIESEL/frBTC for the user, the user's frBTC will be
 * destroyed. Always deploy frostlend BEFORE seeding user balances, or re-mint after.
 */

import {
  deployWasm,
  executeCall,
  fetchWasmHex,
  getBootAddresses,
  getHarness,
  getProvider,
  simulate,
  type ProgressCallback,
} from '@/lib/devnet/boot';
import {
  ACTIVE_POOL_TX,
  BORROWER_OPS_OPCODES,
  BORROWER_OPS_TX,
  CCR,
  COLL_SURPLUS_POOL_TX,
  DEFAULT_INITIAL_PRICE_18DEC,
  FIRE_TOKEN_TX,
  FROSTLEND_AUTH_TOKEN_FACTORY_TX,
  FROST_USD_GAS_COMPENSATION,
  FROST_USD_TOKEN_TX,
  MAX_BORROWING_FEE,
  MCR,
  MIN_NET_DEBT,
  PRICE_FEED_OPCODES,
  PRICE_FEED_TX,
  SORTED_TROVES_TX,
  STABILITY_POOL_TX,
  STAKING_TX,
  TROVE_MANAGER_OPCODES,
  TROVE_MANAGER_TX,
} from '@/constants/frostlend';

// Frostlend WASMs live in /public/wasm/frostlend/. boot.ts's fetchWasmHex looks in
// /public/wasm/, so we use the "frostlend/<name>" subpath form.
async function fetchFrostlendWasm(name: string): Promise<string> {
  return fetchWasmHex(`frostlend/${name}`);
}

export type FrostlendDeploymentResult = {
  success: boolean;
  contractsDeployed: number;
  contractsInitialized: number;
  initialPrice18Dec: bigint;
  error?: string;
};

/**
 * Deploy frostlend onto the running in-browser devnet.
 *
 * Requires the devnet to be already booted (provider/harness/addresses set).
 * Idempotency: re-deploying on the same chain will fail because alkanes
 * CREATERESERVED slots are one-shot — clear devnet state first if redeploying.
 */
export async function deployFrostlend(
  onProgress: ProgressCallback,
  initialPrice18Dec: bigint = DEFAULT_INITIAL_PRICE_18DEC,
): Promise<FrostlendDeploymentResult> {
  const provider = getProvider();
  const harness = getHarness();
  if (!provider || !harness) {
    return {
      success: false,
      contractsDeployed: 0,
      contractsInitialized: 0,
      initialPrice18Dec,
      error: 'Devnet not booted — provider/harness unavailable',
    };
  }
  const { segwit, taproot } = getBootAddresses();

  let deployed = 0;
  let initialized = 0;

  try {
    // -- Phase 0: fetch all WASM bytes in parallel ---------------------------
    onProgress('frostlend: loading WASMs...', 2);
    const [
      authTokenWasm,
      fireTokenWasm,
      frostUsdWasm,
      troveManagerWasm,
      borrowerOpsWasm,
      stabilityPoolWasm,
      activePoolWasm,
      sortedTrovesWasm,
      priceFeedWasm,
      stakingWasm,
      collSurplusWasm,
    ] = await Promise.all([
      fetchFrostlendWasm('alkanes_std_auth_token'),
      fetchFrostlendWasm('frost_lend_fire_token'),
      fetchFrostlendWasm('frost_lend_token'),
      fetchFrostlendWasm('frost_lend_trove_manager'),
      fetchFrostlendWasm('frost_lend_borrower_ops'),
      fetchFrostlendWasm('frost_lend_stability_pool'),
      fetchFrostlendWasm('frost_lend_active_pool'),
      fetchFrostlendWasm('frost_lend_sorted_troves'),
      fetchFrostlendWasm('frost_lend_price_feed'),
      fetchFrostlendWasm('frost_lend_staking'),
      fetchFrostlendWasm('frost_lend_coll_surplus_pool'),
    ]);

    // -- Phase 1: deploy WASMs (auth-token-factory FIRST) --------------------
    // The auth-token contract uses init args [100] in subfrost-appx's existing AMM
    // deployment — that's the "supply" arg for the std auth token init. Reusing it
    // here keeps the contract well-defined.
    onProgress('frostlend: deploy auth-token-factory...', 5);
    await deployWasm(provider, harness, segwit, taproot,
      authTokenWasm, FROSTLEND_AUTH_TOKEN_FACTORY_TX, [100],
      'frostlend/auth-token-factory', onProgress, 5);
    deployed++;

    // FIRE token may already be deployed by the main devnet boot (slot 0x100 / 256).
    // We DO NOT redeploy if it exists — alkanes CREATERESERVED slots are one-shot
    // and re-deploying would no-op (or fail). The frost-lend-staking contract reads
    // FIRE at [4:0x100] regardless of which deployer wrote the binary.
    // Skip phase: do not deploy fire-token from frostlend's bundle.
    void fireTokenWasm; // intentionally unused — see comment above

    onProgress('frostlend: deploy frostUSD...', 8);
    await deployWasm(provider, harness, segwit, taproot,
      frostUsdWasm, FROST_USD_TOKEN_TX, [0],
      'frostlend/frost-usd-token', onProgress, 8);
    deployed++;

    onProgress('frostlend: deploy trove-manager...', 11);
    await deployWasm(provider, harness, segwit, taproot,
      troveManagerWasm, TROVE_MANAGER_TX, [0],
      'frostlend/trove-manager', onProgress, 11);
    deployed++;

    onProgress('frostlend: deploy borrower-ops...', 14);
    await deployWasm(provider, harness, segwit, taproot,
      borrowerOpsWasm, BORROWER_OPS_TX, [0],
      'frostlend/borrower-ops', onProgress, 14);
    deployed++;

    onProgress('frostlend: deploy stability-pool...', 17);
    await deployWasm(provider, harness, segwit, taproot,
      stabilityPoolWasm, STABILITY_POOL_TX, [0],
      'frostlend/stability-pool', onProgress, 17);
    deployed++;

    onProgress('frostlend: deploy active-pool...', 20);
    await deployWasm(provider, harness, segwit, taproot,
      activePoolWasm, ACTIVE_POOL_TX, [0],
      'frostlend/active-pool', onProgress, 20);
    deployed++;

    onProgress('frostlend: deploy sorted-troves...', 23);
    await deployWasm(provider, harness, segwit, taproot,
      sortedTrovesWasm, SORTED_TROVES_TX, [0],
      'frostlend/sorted-troves', onProgress, 23);
    deployed++;

    onProgress('frostlend: deploy price-feed...', 26);
    await deployWasm(provider, harness, segwit, taproot,
      priceFeedWasm, PRICE_FEED_TX, [0],
      'frostlend/price-feed', onProgress, 26);
    deployed++;

    onProgress('frostlend: deploy staking...', 29);
    await deployWasm(provider, harness, segwit, taproot,
      stakingWasm, STAKING_TX, [0],
      'frostlend/staking', onProgress, 29);
    deployed++;

    onProgress('frostlend: deploy coll-surplus-pool...', 32);
    await deployWasm(provider, harness, segwit, taproot,
      collSurplusWasm, COLL_SURPLUS_POOL_TX, [0],
      'frostlend/coll-surplus-pool', onProgress, 32);
    deployed++;

    // -- Phase 2: initialize 9 contracts -------------------------------------
    // Each Initialize (opcode 0) sets cross-contract pointers. TroveManager and
    // BorrowerOps additionally call spawn_auth_token() to mint their protocol
    // auth tokens — these get stored in their own /protocol_auth_{block,tx} keys.
    const initContracts: Array<{ tx: number; name: string; pct: number }> = [
      { tx: FROST_USD_TOKEN_TX, name: 'frost-usd-token', pct: 35 },
      { tx: TROVE_MANAGER_TX, name: 'trove-manager', pct: 38 },
      { tx: BORROWER_OPS_TX, name: 'borrower-ops', pct: 41 },
      { tx: STABILITY_POOL_TX, name: 'stability-pool', pct: 44 },
      { tx: ACTIVE_POOL_TX, name: 'active-pool', pct: 47 },
      { tx: SORTED_TROVES_TX, name: 'sorted-troves', pct: 50 },
      { tx: PRICE_FEED_TX, name: 'price-feed', pct: 53 },
      { tx: STAKING_TX, name: 'staking', pct: 56 },
      { tx: COLL_SURPLUS_POOL_TX, name: 'coll-surplus-pool', pct: 59 },
    ];
    for (const c of initContracts) {
      onProgress(`frostlend: init ${c.name}...`, c.pct);
      await executeCall(
        provider, harness, segwit, taproot,
        `[4,${c.tx},0]:v0:v0`,
        'B:50000:v0',
      );
      initialized++;
    }

    // -- Phase 3: SetParams on BorrowerOps (opcode 70) -----------------------
    // Args: mcr, ccr, min_net_debt, gas_compensation, max_borrowing_fee
    onProgress('frostlend: set protocol params...', 62);
    await executeCall(
      provider, harness, segwit, taproot,
      `[4,${BORROWER_OPS_TX},${BORROWER_OPS_OPCODES.SetParams},${MCR},${CCR},${MIN_NET_DEBT},${FROST_USD_GAS_COMPENSATION},${MAX_BORROWING_FEE}]:v0:v0`,
      'B:50000:v0',
    );

    // -- Phase 4: FinalizeAuth (opcode 60) on 7 callee contracts -------------
    // Each callee staticcalls BorrowerOps.GetProtocolAuthToken (opcode 50) and
    // TroveManager.GetProtocolAuthToken (opcode 50) to discover the auth token
    // IDs of its authorized callers, then locks the references permanently.
    const finalizeContracts: Array<{ tx: number; name: string; pct: number }> = [
      { tx: TROVE_MANAGER_TX, name: 'trove-manager', pct: 65 },
      { tx: ACTIVE_POOL_TX, name: 'active-pool', pct: 68 },
      { tx: STABILITY_POOL_TX, name: 'stability-pool', pct: 71 },
      { tx: SORTED_TROVES_TX, name: 'sorted-troves', pct: 74 },
      { tx: FROST_USD_TOKEN_TX, name: 'frost-usd-token', pct: 77 },
      { tx: STAKING_TX, name: 'staking', pct: 80 },
      { tx: COLL_SURPLUS_POOL_TX, name: 'coll-surplus-pool', pct: 83 },
    ];
    for (const c of finalizeContracts) {
      onProgress(`frostlend: finalize-auth ${c.name}...`, c.pct);
      await executeCall(
        provider, harness, segwit, taproot,
        `[4,${c.tx},${TROVE_MANAGER_OPCODES.FinalizeAuth}]:v0:v0`,
        'B:50000:v0',
      );
    }

    // -- Phase 5: post initial oracle price ----------------------------------
    onProgress('frostlend: post initial price...', 90);
    await executeCall(
      provider, harness, segwit, taproot,
      `[4,${PRICE_FEED_TX},${PRICE_FEED_OPCODES.PostPrice},${initialPrice18Dec}]:v0:v0`,
      'B:50000:v0',
    );

    onProgress('frostlend: deployment complete', 100);
    return {
      success: true,
      contractsDeployed: deployed,
      contractsInitialized: initialized,
      initialPrice18Dec,
    };
  } catch (e: any) {
    return {
      success: false,
      contractsDeployed: deployed,
      contractsInitialized: initialized,
      initialPrice18Dec,
      error: e?.message || String(e),
    };
  }
}

/**
 * Manipulate the mock oracle price. Used by the devnet helper to drive liquidations
 * by lowering the price below an existing trove's MCR.
 */
export async function setOraclePrice(price18Dec: bigint): Promise<void> {
  const provider = getProvider();
  const harness = getHarness();
  if (!provider || !harness) throw new Error('Devnet not booted');
  const { segwit, taproot } = getBootAddresses();

  await executeCall(
    provider, harness, segwit, taproot,
    `[4,${PRICE_FEED_TX},${PRICE_FEED_OPCODES.PostPrice},${price18Dec}]:v0:v0`,
    'B:50000:v0',
  );
}

/**
 * Permissionless single-trove liquidation, callable from the devnet helper to
 * close out an undercollateralized trove. trove_id format: lower 128 bits of the
 * sequential u128 trove counter (NOT block:tx).
 */
export async function liquidateTrove(troveId: bigint): Promise<void> {
  const provider = getProvider();
  const harness = getHarness();
  if (!provider || !harness) throw new Error('Devnet not booted');
  const { segwit, taproot } = getBootAddresses();

  await executeCall(
    provider, harness, segwit, taproot,
    `[4,${TROVE_MANAGER_TX},${TROVE_MANAGER_OPCODES.Liquidate},${troveId}]:v0:v0`,
    'B:50000:v0',
  );
}

/**
 * Batch liquidation — sweep up to maxCount worst-collateralized troves in one call.
 */
export async function liquidateTroves(maxCount: number): Promise<void> {
  const provider = getProvider();
  const harness = getHarness();
  if (!provider || !harness) throw new Error('Devnet not booted');
  const { segwit, taproot } = getBootAddresses();

  await executeCall(
    provider, harness, segwit, taproot,
    `[4,${TROVE_MANAGER_TX},${TROVE_MANAGER_OPCODES.LiquidateTroves},${maxCount}]:v0:v0`,
    'B:50000:v0',
  );
}

/**
 * Open a "guardian" trove from the deployer account. Used in E2E tests to ensure
 * a second healthy trove exists before running a liquidation scenario.
 *
 * Liquity invariant: the sole trove cannot be liquidated (system would have 0
 * collateral). This guardian trove stays safe through the oracle drop because
 * its collateral is set high enough (collateralSats argument).
 *
 * The function wraps fresh BTC → frBTC at the deployer address first, then
 * calls BorrowerOps.OpenTrove with the wrapped frBTC as collateral.
 *
 * @param collateralSats frBTC amount (8-decimal sat units). E.g. 10_000_000 = 0.10 frBTC.
 * @param debtSats frostUSD amount to draw (8-decimal sat units). Must ≥ MIN_NET_DEBT.
 */
export async function openGuardianTrove(collateralSats: bigint, debtSats: bigint): Promise<void> {
  const provider = getProvider();
  const harness = getHarness();
  if (!provider || !harness) throw new Error('Devnet not booted');
  const { segwit, taproot } = getBootAddresses();

  // 1. Get frBTC signer address (opcode 103 on frBTC contract [32:0]).
  //    Same resolution as boot.ts Phase 2 wrap — opcode 103 returns the x-only
  //    32-byte public key; derive the P2TR address from it.
  let signerAddr = taproot;
  try {
    const signerResult = await simulate('32:0', ['103']);
    if (signerResult?.result?.execution?.data) {
      const hex = (signerResult.result.execution.data as string).replace('0x', '');
      if (hex.length === 64) {
        const bitcoin = await import('bitcoinjs-lib');
        const ecc = await import('@bitcoinerlab/secp256k1');
        bitcoin.initEccLib(ecc);
        const xOnly = Buffer.from(hex, 'hex');
        const payment = bitcoin.payments.p2tr({
          internalPubkey: xOnly,
          network: bitcoin.networks.regtest,
        });
        if (payment.address) signerAddr = payment.address;
      }
    }
  } catch { /* fall through — use taproot as signer */ }

  // 2. Wrap BTC → frBTC at deployer address. Use 1.5× the collateral so there's
  //    enough for the OpenTrove inputRequirements AND fee dust.
  const wrapSats = collateralSats * 2n; // wrap 2× to have buffer
  await executeCall(
    provider, harness, segwit, taproot,
    '[32,0,77]:v1:v1',
    `B:${wrapSats}:v0`,
    [signerAddr, taproot],
  );

  // 3. Open the guardian trove.
  await executeCall(
    provider, harness, segwit, taproot,
    `[4,${BORROWER_OPS_TX},${BORROWER_OPS_OPCODES.OpenTrove},${debtSats},0,0,${MAX_BORROWING_FEE}]:v0:v0`,
    `32:0:${collateralSats}`,
    [taproot],
    [taproot],
  );
}
