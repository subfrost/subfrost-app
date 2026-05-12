/**
 * useSwapMutation - Execute AMM swap transactions
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## Swap Quotes Not Showing (2026-03-01)
 *
 * If swap quotes stop appearing after code changes, the issue is usually Next.js caching:
 *   rm -rf .next && lsof -ti:3000 | xargs kill -9; pnpm dev
 *
 * The `.next` directory caches compiled modules. When hooks/context providers change,
 * stale cached versions can prevent proper data flow. This manifests as:
 * - useAlkanesTokenPairs returning data but SwapInputs not receiving it
 * - Pool selection working but quote calculation returning undefined
 * - Console logs showing data at one layer but not reaching components
 *
 * Always clear .next cache when debugging unexplained data flow issues.
 *
 * ============================================================================
 * ⚠️⚠️⚠️ CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01) ⚠️⚠️⚠️
 * ============================================================================
 *
 * ### THE BUG THAT CAUSED TOKEN LOSS
 *
 * When using browser wallets (Xverse, OYL, UniSat, etc.) with symbolic addresses
 * like `p2tr:0` and `p2wpkh:0` in the SDK's `alkanesExecuteTyped()` call, the
 * SDK resolves these to its DUMMY WALLET addresses — NOT the user's addresses!
 *
 * **Lost transaction example:**
 * TX: 985436b5c5c850bd121cd4862f32413f467145b121d34c006417724d71588db9
 * - User's taproot: bc1p8gunhdgy085s6xz5tg0uuwwv5k2yndcn23qat79m0ee8e0rfcs6q3hdm5n
 * - User's segwit:  bc1q0mkku72jtxzdnh5s9086mkdxy234wkqltqextr
 * - Actual output 0: bc1ppl8797s9zc55xlzg3pm8s2ufgqrdp363gsw3gccy7j2g6n057kqqjkv7pt (WRONG!)
 * - Actual output 1: bc1qsc9eesuu5w2elkm5lm75h4ma5u7gt0gz4z6825 (WRONG!)
 *
 * The swap executed correctly on-chain, but tokens went to SDK dummy wallet!
 *
 * ### ROOT CAUSE
 *
 * The SDK's `walletCreate()` creates a DUMMY wallet for PSBT construction.
 * Symbolic addresses (p2tr:0, p2wpkh:0) resolve to THIS dummy wallet's addresses.
 * For keystore wallets, the real mnemonic is loaded, so symbolic addresses work.
 * For browser wallets, NO mnemonic is loaded — we only have the address strings.
 *
 * ### THE FIX (MANDATORY FOR ALL BROWSER WALLET TRANSACTIONS)
 *
 * ```typescript
 * const isBrowserWallet = walletType === 'browser';
 *
 * // Output addresses: where tokens should go
 * const toAddresses = isBrowserWallet
 *   ? [taprootAddress]          // REAL address string
 *   : ['p2tr:0'];               // Symbolic OK for keystore
 *
 * // Change addresses: where BTC/alkane change should go
 * const changeAddr = isBrowserWallet
 *   ? (segwitAddress || taprootAddress)
 *   : 'p2wpkh:0';
 *
 * const alkanesChangeAddr = isBrowserWallet
 *   ? taprootAddress
 *   : 'p2tr:0';
 * ```
 *
 * ### DEVNET NOTE
 *
 * Symbolic addresses resolve to the SDK wallet's derivation, not the connected
 * wallet's. The `useActualAddresses` pattern (isBrowserWallet || network === 'devnet')
 * ensures actual addresses are always used on devnet.
 *
 * ### FILES AFFECTED (ALL MUST USE THIS PATTERN)
 *
 * - hooks/useSwapMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useRemoveLiquidityMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useAddLiquidityMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useUnwrapMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useWrapMutation.ts - Uses different pattern (fixedOutputs for signer)
 *
 * ### HOW TO VERIFY AFTER ANY CHANGES
 *
 * 1. Check browser console for "[Swap] To addresses:" log
 * 2. If browser wallet, should show actual bc1p/bc1q addresses, NOT 'p2tr:0'
 * 3. After broadcast, verify on mempool.space that outputs go to YOUR addresses
 *
 * ============================================================================
 *
 * ## CRITICAL IMPLEMENTATION NOTES (January 2026)
 *
 * ### Why We Call the Factory (Not the Pool Directly)
 *
 * The deployed pool logic WASM at [4:65496] is missing Swap (opcode 3) and
 * SimulateSwap (opcode 4) — it's an older build. However, the factory contract
 * at [4:65498] has router opcodes that execute swaps internally:
 *   - 13: SwapExactTokensForTokens (verified working via simulate)
 *   - 14: SwapTokensForExactTokens
 *
 * Factory opcode 13 format:
 *   [factory_block, factory_tx, 13, path_len, ...path_tokens, amount_in, amount_out_min, deadline]
 *
 * ### SDK Auto-Edict Pattern
 *
 * For the swap to work, input tokens must appear in the factory's `incomingAlkanes`.
 * The SDK auto-generates the edict from `inputRequirements`:
 *   - p0: SDK auto-edict (from inputRequirements) - transfers sell tokens to p1
 *   - p1: Our cellpack [factory_block,factory_tx,13,...] - calls factory with swap opcode
 *
 * IMPORTANT: Do NOT add manual edicts to the protostones string. The SDK's
 * `alkanesExecuteWithStrings` auto-generates edicts from `inputRequirements`.
 * Adding manual edicts causes a double-edict bug where protostone indices shift
 * and the factory receives zero tokens (see buildSwapProtostone journal entry).
 *
 * ### Journal: 2026-01-28 — Swap token loss investigation & factory router fix
 *
 * PROBLEM: DIESEL → frBTC swaps broadcast and confirmed on Bitcoin, but no actual
 * swap occurred. User DIESEL was not debited, no frBTC received. Pool reserves
 * stable at 72.76 DIESEL / 6.99 frBTC.
 *
 * INVESTIGATION:
 *   1. Traced tx on-chain — confirmed but alkanes_protorunesbyoutpoint returned empty
 *      for all outputs, meaning no alkane state changes were recorded.
 *   2. Simulated pool [2:6] opcode 3 (Swap) directly via alkanes_simulate:
 *      → "Extcall failed: ALKANES: revert: Error: Unrecognized opcode"
 *   3. Systematically tested all pool opcodes on [2:6]:
 *      - Opcode 1 (AddLiquidity):    ✅ Works
 *      - Opcode 2 (RemoveLiquidity): ✅ Works
 *      - Opcode 3 (Swap):            ❌ "Unrecognized opcode"
 *      - Opcode 4 (SimulateSwap):    ❌ "Unrecognized opcode"
 *      - Opcode 97 (GetReserves):    ✅ Works
 *      - Opcode 999 (PoolDetails):   ✅ Works
 *   4. Ran `strings` on prod_wasms/pool.wasm — opcode 3 EXISTS in the binary file
 *      but the DEPLOYED version at [4:65496] doesn't have it (older build).
 *   5. Discovered factory [4:65498] has router opcodes 13/14 for swaps.
 *   6. Verified factory opcode 13 via simulate:
 *      inputs: ["13","2","2","0","32","0","10000000","0","999999999"]
 *      alkanes: [{id:{block:2,tx:0},value:"10000000"}]
 *      → SUCCESS: returned frBTC [32:0] = 950,148
 *
 * FIX: Changed buildSwapProtostone from calling pool with opcode 3 to calling
 * factory with opcode 13 (SwapExactTokensForTokens). Same two-protostone pattern,
 * but p1 now targets the factory instead of the pool.
 *
 * VERIFIED: User-tested DIESEL → frBTC swap — correct frBTC amount received.
 *
 * @see constants/index.ts - FACTORY_OPCODES documentation
 * @see useRemoveLiquidityMutation.ts - Same two-protostone pattern for burns
 * @see useAddLiquidityMutation.ts - Uses factory routing (different pattern)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useWalletUtxoCache } from '@/hooks/useWalletUtxoCache';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { getConfig } from '@/utils/getConfig';
import { getTokenSymbol } from '@/lib/alkanes-client';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
// NOTE: Only patching INPUTS (witnessUtxo + redeemScript), NOT outputs
// Output patching was removed - see comment at line 442 for why
import { patchInputsOnly } from '@/lib/psbt-patching';
import { buildSwapProtostone, buildSwapExactOutputProtostone, buildSwapInputRequirements, buildRouterSwapProtostone } from '@/lib/alkanes/builders';
import { FACTORY_SWAP_OPCODE } from '@/lib/alkanes/constants';
import { uint8ArrayToBase64, getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import { buildPlanFromTx } from '@/lib/alkanes/planBuilder';
import type { PlanAlkaneEntry } from '@/context/TransactionConfirmContext';

bitcoin.initEccLib(ecc);

export type SwapTransactionBaseData = {
  sellCurrency: string; // alkane id or 'btc'
  buyCurrency: string; // alkane id or 'btc'
  direction: 'sell' | 'buy';
  sellAmount: string; // alks
  buyAmount: string; // alks
  maxSlippage: string; // percent string, e.g. '0.5'
  feeRate: number; // sats/vB
  tokenPath?: string[]; // optional explicit path
  poolId?: { block: string | number; tx: string | number }; // Pool reference (not used for routing)
  deadlineBlocks?: number; // default 5
  isDieselMint?: boolean;
  // For confirmation modal display (optional)
  sellSymbol?: string;
  buySymbol?: string;
  skipConfirmation?: boolean; // For browser wallets that handle their own confirmation
  /** When set to 'clob' or 'router', route through Universal Router instead of AMM factory */
  routeSource?: 'amm' | 'clob' | 'router';
};

/**
 * Build protostone string for AMM swap operations
 *
 * Returns ONLY the factory cellpack protostone (no manual edict).
 * The edict that delivers sell tokens to this cellpack is auto-generated
 * by the SDK from the `inputRequirements` parameter passed to
 * `alkanesExecuteWithStrings`. The SDK creates p0 (edict → p1) and
 * this cellpack becomes p1.
 *
 * ### Journal: 2026-02-01 — Double-edict bug fix
 *
 * PROBLEM: frBTC→DIESEL swaps broadcast but frBTC ends up at vout 0 instead
 * of being consumed by the factory. Tx be4466de... confirmed this.
 *
 * ROOT CAUSE: `alkanesExecuteWithStrings` auto-generates an edict protostone
 * (p0) from `inputRequirements` that transfers alkane tokens to p1. Our code
 * was ALSO providing a manual edict in the protostones string, creating:
 *   p0: SDK auto-edict [32:0:amount:p1] → sends frBTC to p1
 *   p1: Our manual edict [32:0:amount:p1] → NOT the factory!
 *   p2: Our factory cellpack → receives nothing
 * The factory at p2 got zero incomingAlkanes and the swap silently failed.
 *
 * FIX: Remove the manual edict. Let inputRequirements handle it:
 *   p0: SDK auto-edict [32:0:amount:p1] → sends frBTC to p1
 *   p1: Factory cellpack → receives frBTC as incomingAlkanes ✓
 *
 * Factory opcode 13 format:
 *   [factory_block,factory_tx,13,path_len,sell_block,sell_tx,buy_block,buy_tx,amount_in,amount_out_min,deadline]
 */

export function useSwapMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, browserWallet, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig(network);
  // Pre-warmed UTXO snapshot — passed into alkanesExecuteTyped so the
  // SDK skips its internal BTC-fee fanout. Per-click latency win on
  // wallets with many UTXOs (user-reported, 2026-05-05).
  const utxoCache = useWalletUtxoCache();
  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

  return useMutation({
    mutationFn: async (swapData: SwapTransactionBaseData) => {

      if (!isConnected) {
        console.error('[useSwapMutation] ❌ Wallet not connected');
        throw new Error('Wallet not connected');
      }
      // Ensure browser wallet session is active before building PSBT
      if (walletType === 'browser') {
        const { ensureWalletSession } = await import('@/lib/wallet/browserWalletSigning');
        await ensureWalletSession();
      }
      if (!provider) {
        console.error('[useSwapMutation] ❌ Provider not available');
        throw new Error('Provider not available');
      }

      // Get addresses — use the consolidated `txContext` for fee/change addresses
      // and only keep the wallet-type-specific receive address (taproot when
      // available) for `toAddresses`. See `WalletContext.TxContext` jsdoc for the
      // semantics of feeSourceAddresses / btcChangeAddress / alkanesChangeAddress.
      if (!txContext) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      // For alkane operations, prefer taproot if available (alkanes use P2TR).
      // Falls back to segwit on single-address segwit-only wallets.
      const primaryAddress = (taprootAddress || segwitAddress)!;

      // BTC → non-frBTC: only allowed with override protostones (atomic wrap+swap).
      // Without overrides, this would try to swap BTC directly which is impossible.
      const hasOverrides = !!(swapData as any).overrideProtostones;
      if (swapData.sellCurrency === 'btc' && swapData.buyCurrency !== FRBTC_ALKANE_ID && !hasOverrides) {
        console.error('[useSwapMutation] ❌ BTC → non-frBTC swap reached mutation!');
        console.error('[useSwapMutation] sellCurrency:', swapData.sellCurrency);
        console.error('[useSwapMutation] buyCurrency:', swapData.buyCurrency);
        console.error('[useSwapMutation] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
        throw new Error(
          'BTC swaps must go through frBTC. This swap should have been split into wrap + swap in the UI.'
        );
      }

      const sellCurrency = swapData.sellCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.sellCurrency;
      const buyCurrency = swapData.buyCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.buyCurrency;


      // Adjust amounts for wrap fee when selling BTC
      const ammSellAmount =
        swapData.sellCurrency === 'btc'
          ? BigNumber(swapData.sellAmount)
              .multipliedBy(1000 - wrapFee)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : swapData.sellAmount;
      const ammBuyAmount =
        swapData.sellCurrency === 'btc'
          ? BigNumber(swapData.buyAmount)
              .multipliedBy(1000 + wrapFee)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : swapData.buyAmount;


      // Slippage is applied to the quote the user actually saw in the UI.
      // The quote is already kept fresh on each block via usePoolStateLive in
      // useSwapQuotes — we should NOT recompute it here from a newer snapshot.
      // If the price moves further than the user's tolerance between submit
      // and mining, the contract reverts on min-out and the user retries with
      // a fresh quote (standard Uniswap-style UX). Recomputing here would
      // silently deliver less than what the user agreed to.
      const minAmountOut = calculateMinimumFromSlippage({ amount: ammBuyAmount, maxSlippage: swapData.maxSlippage });


      // Get deadline block height (regtest uses large offset so deadline never expires)
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local' || network === 'qubitcoin-regtest';
      const deadlineBlocks = isRegtest ? 1000 : (swapData.deadlineBlocks || 5);
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);

      // Determine routing: Universal Router (hybrid CLOB+AMM) vs AMM factory direct
      const useRouter = swapData.routeSource === 'clob' || swapData.routeSource === 'router';
      const routerId = (getConfig(network) as any).UNIVERSAL_ROUTER_ID as string | undefined;

      let protostone: string;
      if (useRouter && routerId) {
        // Universal Router only supports exact-in (useSwapQuotes forces
        // direction='sell' when fetching router quotes).
        protostone = buildRouterSwapProtostone({
          routerId,
          sellTokenId: sellCurrency,
          buyTokenId: buyCurrency,
          sellAmount: new BigNumber(ammSellAmount).toFixed(0),
          minOutput: new BigNumber(minAmountOut).toFixed(0),
        });
      } else if (swapData.direction === 'buy') {
        // User typed in the BUY field — exact-out swap via factory opcode 14.
        // useSwapQuotes already populated swapData.sellAmount with the
        // slippage-adjusted maxSentInAlks; opcode 14 refunds any unused input
        // to alkanes_change_address.
        protostone = buildSwapExactOutputProtostone({
          factoryId: ALKANE_FACTORY_ID,
          sellTokenId: sellCurrency,
          buyTokenId: buyCurrency,
          amountOut: new BigNumber(ammBuyAmount).toFixed(0),
          amountInMax: new BigNumber(ammSellAmount).toFixed(0),
          deadline: deadline.toString(),
        });
      } else {
        // Default: exact-in via factory opcode 13 (slippage applied to output).
        protostone = buildSwapProtostone({
          factoryId: ALKANE_FACTORY_ID,
          sellTokenId: sellCurrency,
          buyTokenId: buyCurrency,
          sellAmount: new BigNumber(ammSellAmount).toFixed(0),
          minOutput: new BigNumber(minAmountOut).toFixed(0),
          deadline: deadline.toString(),
        });
      }

      // Build input requirements
      const isBtcSell = swapData.sellCurrency === 'btc';

      const inputReqParams = {
        bitcoinAmount: isBtcSell ? new BigNumber(swapData.sellAmount).toFixed(0) : undefined,
        alkaneInputs: !isBtcSell ? [{
          alkaneId: sellCurrency,
          amount: new BigNumber(swapData.sellAmount).toFixed(0),
        }] : undefined,
      };


      const inputRequirements = buildSwapInputRequirements(inputReqParams);


      const btcNetwork = getBitcoinNetwork(network);

      const isBrowserWallet = walletType === 'browser';

      // Symbolic addresses (`p2tr:0`, `p2wpkh:0`) used to resolve to the SDK's
      // dummy wallet whenever no real mnemonic was loaded — that's how
      // tx 985436b5… sent 0.3 DIESEL + BTC change to dummy addresses on
      // 2026-03-01. `txContext` always carries actual user addresses now,
      // so this whole class of bug is closed structurally.
      const toAddresses = [primaryAddress];

      try {
        // ordinals_strategy + paymentUtxos auto-applied by alkanesExecuteTyped
        // from txContext.walletType. Browser → 'preserve' + UniSat-clean-utxos
        // (when capability available); keystore → 'burn'. See lib/alkanes/execute.ts.
        const isKeystoreWallet = walletType === 'keystore';

        // Indexer sync probe lives in lib/alkanes/execute.ts (the central
        // alkanesExecuteTyped wrapper) — every mutation gets it for free.
        // The retry-on-error block below remains as a safety net for the
        // case where the indexer takes longer than waitForIndexer's own
        // internal budget.
        const wantsSplit = (swapData as any).splitTransactions === true;
        const useAutoConfirm = isKeystoreWallet || wantsSplit;

        const buildExecuteOpts = () => ({
          txContext,
          // Support overrides for atomic wrap+swap (SwapShell passes custom protostones/addresses)
          inputRequirements: (swapData as any).overrideInputRequirements || inputRequirements,
          protostones: (swapData as any).overrideProtostones || protostone,
          feeRate: swapData.feeRate,
          // Split-tx mode is implemented inside alkanes-rs execute_full. The
          // browser unsigned-PSBT path cannot broadcast the parent wrap tx
          // before building the child execute tx, so opt into SDK-side
          // signing/broadcasting whenever the caller requests split mode.
          autoConfirm: useAutoConfirm,
          toAddresses: (swapData as any).overrideToAddresses || toAddresses,
          network,
          // Pre-warmed UTXO snapshot. alkanesExecuteTyped derives clean
          // BTC payment_utxos from this and skips the WASM's internal
          // fanout. Click-to-popup latency win.
          cachedUtxos: utxoCache.utxos,
          // Opt-in CPFP-chained 2-tx flow when caller knows the combined wrap
          // + execute fuel cost would exceed the per-tx floor. The SDK splits
          // the wrap into Tx A and the execute into Tx B; each gets its own
          // 3.5M MINIMUM_FUEL budget. Required for atomic BTC→Token swaps on
          // mainnet where block-fuel-share starvation is real.
          // `splitTransactions` is honored at runtime by alkanesExecuteFull's
          // options JSON (see alkanes-rs ts-sdk/src/provider/index.ts), but
          // the SDK's hand-maintained index.d.ts hasn't surfaced the prop on
          // alkanesExecuteTyped's param type yet. Cast `as any` until the SDK
          // d.ts is regenerated; the runtime path is unchanged.
          splitTransactions: wantsSplit,
        });

        const isIndexerSyncError = (e: unknown): boolean => {
          const msg = e instanceof Error ? e.message : String(e ?? '');
          return /indexer sync timed out/i.test(msg);
        };

        // Safety net: if the SDK's internal waitForIndexer still trips
        // inside alkanesExecuteTyped, retry once more after a short
        // re-probe of provider.waitForIndexer(). Bounded to 2 retries.
        const RETRY_BACKOFF_MS = [3_000, 8_000];
        let result: any;
        let attempt = 0;
        while (true) {
          try {
            result = await provider.alkanesExecuteTyped(buildExecuteOpts() as any);
            break;
          } catch (err) {
            if (!isIndexerSyncError(err) || attempt >= RETRY_BACKOFF_MS.length) {
              throw err;
            }
            const delay = RETRY_BACKOFF_MS[attempt];
            console.warn(`[swap] indexer sync timeout (attempt ${attempt + 1}/${RETRY_BACKOFF_MS.length}), reprobing in ${delay}ms…`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            try { await provider.waitForIndexer(); } catch { /* continue to retry */ }
            attempt++;
          }
        }



        // Check if SDK auto-completed the transaction.
        //
        // splitTransactions=true returns an EnhancedExecuteResult with both
        // `wrap_txid` (parent CPFP-payable tx) and `reveal_txid` (child).
        // Surface both so the UI stepper can label and confirm-poll each leg
        // independently — without this, callers only see `reveal_txid` and
        // lose track of the wrap leg entirely.
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          const wrapTxId = result.wrap_txid || result.split_txid;
          return {
            success: true,
            transactionId: txId,
            wrapTxId: wrapTxId || undefined,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            wrapTxId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Check if we got a readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          const readyToSign = result.readyToSign;

          // The PSBT comes as Uint8Array from serde_wasm_bindgen (or as object with indices)
          const psbtBase64 = extractPsbtBase64(readyToSign.psbt);

          // Helper to classify script type from raw bytes
          const classifyScript = (script: Uint8Array | Buffer): string => {
            const s = Buffer.from(script);
            if (s.length === 34 && s[0] === 0x51 && s[1] === 0x20) return 'P2TR';
            if (s.length === 22 && s[0] === 0x00 && s[1] === 0x14) return 'P2WPKH';
            if (s.length === 23 && s[0] === 0xa9 && s[1] === 0x14 && s[22] === 0x87) return 'P2SH';
            if (s.length === 34 && s[0] === 0x00 && s[1] === 0x20) return 'P2WSH';
            return `UNKNOWN(len=${s.length},op=${s[0]?.toString(16)})`;
          };

          const logSwapInputDetails = (psbt: bitcoin.Psbt, label: string) => {
            psbt.data.inputs.forEach((input, idx) => {
              const ws = input.witnessUtxo?.script;
              const scriptHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
              const scriptType = ws ? classifyScript(ws) : 'NO_WITNESS_UTXO';
            });
            psbt.txOutputs.forEach((out, idx) => {
              try {
                const addr = bitcoin.address.fromOutputScript(out.script, btcNetwork);
              } catch {
              }
            });
          };

          // DIAGNOSTIC: Log PSBT state before patching
          {
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            logSwapInputDetails(tempPsbt, 'BEFORE PATCHING');
          }

          // ============================================================================
          // Input patching for ALL browser wallet types
          // ============================================================================
          // Different wallets have different requirements:
          // - Xverse: P2SH-P2WPKH (starts with '3'/'2'). Needs redeemScript injection.
          // - UniSat/OKX: Single-address P2TR or P2WPKH. Need witnessUtxo.script patching.
          // - OYL/Leather/Phantom: Native P2WPKH (bc1q). Need witnessUtxo.script patching.
          //
          // patchInputsOnly handles ALL these cases. It does NOT touch outputs (the SDK
          // already creates correct output addresses when we pass actual addresses).
          // ============================================================================
          let finalPsbtBase64 = psbtBase64;
          if (isBrowserWallet) {
            if (!taprootAddress) {
              throw new Error(
                'Connected wallet has no taproot address. Switch your wallet ' +
                'extension to Taproot (P2TR) mode and reconnect — alkanes only ' +
                'live at P2TR addresses.'
              );
            }
            const result = patchInputsOnly({
              psbtBase64,
              network: btcNetwork,
              taprootAddress,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            });
            finalPsbtBase64 = result.psbtBase64;
            if (result.inputsPatched > 0) {
            }
          }

          {
            const tempPsbt = bitcoin.Psbt.fromBase64(finalPsbtBase64, { network: btcNetwork });
            tempPsbt.data.inputs.forEach((inp, idx) => {
              if (inp.witnessUtxo) {
                try {
                  const addr = bitcoin.address.fromOutputScript(
                    Buffer.from(inp.witnessUtxo.script),
                    btcNetwork
                  );
                  const hasRedeemScript = inp.redeemScript ? ' [has redeemScript]' : '';
                } catch (e) {
                }
              } else {
              }
            });
            tempPsbt.txOutputs.forEach((out, idx) => {
              try {
                const addr = bitcoin.address.fromOutputScript(out.script, btcNetwork);
              } catch (e) {
              }
            });
          }

          // DIAGNOSTIC: Log PSBT state after patching
          {
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            logSwapInputDetails(tempPsbt, 'AFTER PATCHING');
          }

          // For keystore wallets, request user confirmation before signing.
          // Browser wallets handle confirmation via their own popup.
          //
          // We render the actual built PSBT via planBuilder, then annotate
          // the cellpack-receiving output with the predicted alkane payout
          // from the quote (with `uncertain: true` because the AMM may
          // move between quote-time and inclusion-time — slippage protects
          // the *minimum*, not the displayed value).
          if (walletType === 'keystore' && !swapData.skipConfirmation) {
            const ourAddresses = [taprootAddress, segwitAddress].filter(
              (a): a is string => !!a,
            );
            const isBuyBtc = swapData.buyCurrency === 'btc';
            const isSellBtc = swapData.sellCurrency === 'btc';
            const buySymbol = getTokenSymbol(
              swapData.buyCurrency,
              swapData.buySymbol,
            );
            const sellSymbol = getTokenSymbol(
              swapData.sellCurrency,
              swapData.sellSymbol,
            );
            const plan = buildPlanFromTx({
              psbtBase64: finalPsbtBase64,
              cache: utxoCache,
              ourAddresses,
              network: btcNetwork,
              feeRateSatVb: swapData.feeRate,
              label: `Swap ${sellSymbol} → ${buySymbol}`,
              summary:
                `Sells ${(parseFloat(swapData.sellAmount) / 1e8).toString()} ${sellSymbol} for ` +
                `≥${(parseFloat(minAmountOut) / 1e8).toFixed(8)} ${buySymbol} ` +
                `(slippage tolerance ${swapData.maxSlippage}%).`,
            });
            // Predicted alkane receive lands on the first cellpack-bound
            // output — by SDK convention this is the first non-OP_RETURN
            // output paying us (dust for token receives, BTC payout for
            // Token→BTC). For Token→BTC we don't add an alkane override
            // (the receive is BTC sats, already shown on the output).
            if (!isBuyBtc) {
              const buyId = swapData.buyCurrency === 'btc'
                ? FRBTC_ALKANE_ID
                : swapData.buyCurrency;
              const targetIdx = plan.outputs.findIndex(
                (o) => o.isOurs && !o.isOpReturn,
              );
              if (targetIdx >= 0) {
                plan.outputs[targetIdx].alkanes = [
                  ...(plan.outputs[targetIdx].alkanes ?? []),
                  {
                    alkaneId: buyId,
                    symbol: buySymbol,
                    amount: BigInt(
                      Math.floor(parseFloat(swapData.buyAmount)),
                    ),
                    uncertain: true,
                  } satisfies PlanAlkaneEntry,
                ];
              }
            }
            const approved = await requestConfirmation({
              type: 'swap',
              title: 'Confirm Swap',
              fromAmount: (parseFloat(swapData.sellAmount) / 1e8).toString(),
              fromSymbol: sellSymbol,
              fromId: isSellBtc ? undefined : swapData.sellCurrency,
              toAmount: (parseFloat(swapData.buyAmount) / 1e8).toString(),
              toSymbol: buySymbol,
              toId: isBuyBtc ? undefined : swapData.buyCurrency,
              feeRate: swapData.feeRate,
              plan: [plan],
            });

            if (!approved) {
              throw new Error('Transaction rejected by user');
            }
          }

          // ============================================================================
          // BROWSER WALLET SIGNING (2026-03-01)
          // ============================================================================
          //
          // VERIFIED WORKING: OYL wallet swaps confirmed via txid:
          // 0b2455ceef9c0f1fb8c09d37b08f667a656cac5e09e4d0cf01ddccc7b59aef43
          //
          // KEY IMPLEMENTATION DETAILS:
          //
          // 1. SINGLE signTaprootPsbt() CALL FOR ALL INPUTS
          //    Browser wallets handle both taproot AND segwit inputs in one call.
          //    DO NOT call signSegwitPsbt then signTaprootPsbt - this causes
          //    "inputType: sh without redeemScript" errors.
          //
          // 2. MULTIPLE WALLET POPUPS ARE EXPECTED (OYL specific)
          //    OYL wallet shows one confirmation popup PER INPUT in the PSBT.
          //    If the swap spends 3 UTXOs, user will see 3 popups.
          //    This is OYL's UX design, not a bug. Other wallets batch signatures.
          //
          // 3. signTaprootPsbt() HANDLES EVERYTHING
          //    Despite the name, signTaprootPsbt() in WalletContext dispatches to
          //    the correct wallet adapter which signs ALL input types.
          //
          // 4. ACTUAL ADDRESSES ALREADY CONFIGURED (see lines 388-411)
          //    The SDK was called with actual user addresses, not symbolic ones.
          //    This prevents the dummy wallet address bug that caused token loss.
          //
          // See WalletContext.tsx OYL WALLET BEHAVIOR DOCUMENTATION for full details.
          // ============================================================================
          // Single signing path. Browser wallets sign all input types via the wallet
          // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
          let signedPsbtBase64: string;
          const signStartTime = Date.now();
          try {
            signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);
          } catch (signErr: any) {
            console.error('[useSwapMutation][OYL-DEBUG] ===== signTaprootPsbt FAILED =====');
            console.error('[useSwapMutation][OYL-DEBUG] Error:', signErr?.message || signErr);
            console.error('[useSwapMutation][OYL-DEBUG] Error type:', signErr?.constructor?.name);
            console.error('[useSwapMutation][OYL-DEBUG] Full error:', signErr);
            throw signErr;
          }

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

          // DIAGNOSTIC: Log per-input state after signing
          signedPsbt.data.inputs.forEach((inp, idx) => {
            const ws = inp.witnessUtxo?.script;
            const scriptType = ws ? classifyScript(ws) : 'NO_WITNESS_UTXO';
            const scriptHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
          });

          // Check if already finalized by the wallet
          const alreadyFinalized = signedPsbt.data.inputs.every(input =>
            input.finalScriptWitness || input.finalScriptSig
          );

          // Finalize all inputs
          if (alreadyFinalized) {
          } else {
            try {
              signedPsbt.finalizeAllInputs();
            } catch (e: any) {
              console.error('[useSwapMutation] Finalization error:', e.message);
              // Dump per-input state for debugging
              console.error('[SWAP-DIAG] === FINALIZATION FAILURE DUMP ===');
              signedPsbt.data.inputs.forEach((inp, idx) => {
                const ws = inp.witnessUtxo?.script;
                const sType = ws ? classifyScript(ws) : 'NO_WITNESS_UTXO';
                const sHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
                console.error(`  Input ${idx}: type=${sType} script=${sHex} redeemScript=${inp.redeemScript ? Buffer.from(inp.redeemScript).toString('hex') : 'NONE'} tapKeySig=${!!inp.tapKeySig} partialSig=${inp.partialSig?.length || 0} finalScriptWitness=${!!inp.finalScriptWitness}`);
              });
              throw e;
            }
          }

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();


          // Broadcast the transaction
          const broadcastTxid = await provider.broadcastTransaction(txHex);

          if (txid !== broadcastTxid) {
            console.warn('[useSwapMutation] WARNING: Computed txid !== broadcast txid!');
            console.warn('[useSwapMutation] Computed:', txid);
            console.warn('[useSwapMutation] Broadcast:', broadcastTxid);
          }

          return {
            success: true,
            transactionId: broadcastTxid || txid,
            wrapTxId: undefined,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            wrapTxId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Check if execution completed directly
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          const wrapTxId = result.complete?.wrap_txid || result.complete?.split_txid;
          return {
            success: true,
            transactionId: txId,
            wrapTxId: wrapTxId || undefined,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            wrapTxId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Fallback: no txid found
        console.error('[useSwapMutation] No txid found in result:', result);
        throw new Error('Swap execution did not return a transaction ID');
      } catch (executeError: any) {
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('[useSwapMutation] ████ EXECUTE ERROR ████');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('[useSwapMutation] Error message:', executeError?.message);
        console.error('[useSwapMutation] Error name:', executeError?.name);
        console.error('[useSwapMutation] Error stack:', executeError?.stack);
        console.error('[useSwapMutation] Full error:', executeError);
        console.error('═══════════════════════════════════════════════════════════════');
        throw executeError;
      }
    },
    onSuccess: (data) => {

      // Invalidate all balance-related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['alkanesTokenPairs'] });
      // Invalidate activity feed so it shows the new swap transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

    },
  });
}
