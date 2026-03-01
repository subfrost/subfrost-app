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
 * ### FILES AFFECTED (ALL MUST USE THIS PATTERN)
 *
 * - hooks/useSwapMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useSwapUnwrapMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useRemoveLiquidityMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useAddLiquidityMutation.ts ✅ Fixed 2026-03-01
 * - hooks/useWrapSwapMutation.ts ✅ Fixed 2026-03-01
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
 * but p1 now targets the factory instead of the pool. Applied same fix to
 * useWrapSwapMutation (BTC→token) and useSwapUnwrapMutation (token→BTC).
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
import { buildSwapProtostone, buildSwapInputRequirements } from '@/lib/alkanes/builders';
import { FACTORY_SWAP_OPCODE } from '@/lib/alkanes/constants';
import { uint8ArrayToBase64, getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';

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
  deadlineBlocks?: number; // default 3
  isDieselMint?: boolean;
  // For confirmation modal display (optional)
  sellSymbol?: string;
  buySymbol?: string;
  skipConfirmation?: boolean; // For browser wallets that handle their own confirmation
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
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

  return useMutation({
    mutationFn: async (swapData: SwapTransactionBaseData) => {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] ████ MUTATION STARTED ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] Input swapData:', JSON.stringify(swapData, null, 2));
      console.log('[useSwapMutation] Network:', network);
      console.log('[useSwapMutation] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
      console.log('[useSwapMutation] wrapFee:', wrapFee);
      console.log('[useSwapMutation] isConnected:', isConnected);
      console.log('[useSwapMutation] hasProvider:', !!provider);
      console.log('───────────────────────────────────────────────────────────────');

      if (!isConnected) {
        console.error('[useSwapMutation] ❌ Wallet not connected');
        throw new Error('Wallet not connected');
      }
      if (!provider) {
        console.error('[useSwapMutation] ❌ Provider not available');
        throw new Error('Provider not available');
      }

      // Get addresses - use actual addresses instead of SDK descriptors
      // This fixes the "Available: []" issue where SDK couldn't find alkane UTXOs
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');
      console.log('[useSwapMutation] Using addresses:', { taprootAddress, segwitAddress });

      // NOTE: BTC → token swaps (other than frBTC) should be handled in SwapShell.tsx
      // by first wrapping BTC to frBTC, then calling swapMutation with frBTC.
      // If we reach here with BTC as sellCurrency for a non-frBTC target, something is wrong.
      if (swapData.sellCurrency === 'btc' && swapData.buyCurrency !== FRBTC_ALKANE_ID) {
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

      console.log('[useSwapMutation] Resolved currencies:');
      console.log('[useSwapMutation]   sellCurrency:', swapData.sellCurrency, '→', sellCurrency);
      console.log('[useSwapMutation]   buyCurrency:', swapData.buyCurrency, '→', buyCurrency);

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

      console.log('[useSwapMutation] AMM amounts (after wrap fee adjustment):');
      console.log('[useSwapMutation]   ammSellAmount:', ammSellAmount);
      console.log('[useSwapMutation]   ammBuyAmount:', ammBuyAmount);

      // Calculate slippage limits
      const minAmountOut = calculateMinimumFromSlippage({ amount: ammBuyAmount, maxSlippage: swapData.maxSlippage });

      console.log('[useSwapMutation] Slippage calculations:');
      console.log('[useSwapMutation]   maxSlippage:', swapData.maxSlippage);
      console.log('[useSwapMutation]   minAmountOut:', minAmountOut);

      // Get deadline block height (regtest uses large offset so deadline never expires)
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
      const deadlineBlocks = isRegtest ? 1000 : (swapData.deadlineBlocks || 3);
      console.log('[useSwapMutation] Fetching deadline block height...');
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[useSwapMutation] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      console.log('[useSwapMutation] Factory ID:', ALKANE_FACTORY_ID);
      console.log('[useSwapMutation] Using factory opcode 13 (SwapExactTokensForTokens):');
      console.log('[useSwapMutation]   p0: SDK auto-edict (from inputRequirements) → sends sell tokens to p1');
      console.log('[useSwapMutation]   p1: Factory cellpack (our protostone)');

      // Build protostone for the swap using factory-routed two-protostone pattern
      const protostoneParams = {
        factoryId: ALKANE_FACTORY_ID,
        sellTokenId: sellCurrency,
        buyTokenId: buyCurrency,
        sellAmount: new BigNumber(ammSellAmount).toFixed(0),
        minOutput: new BigNumber(minAmountOut).toFixed(0),
        deadline: deadline.toString(),
      };

      console.log('[useSwapMutation] Protostone params:', JSON.stringify(protostoneParams, null, 2));

      const protostone = buildSwapProtostone(protostoneParams);
      console.log('[useSwapMutation] Built protostone (factory-routed):', protostone);

      // Build input requirements
      const isBtcSell = swapData.sellCurrency === 'btc';
      console.log('[useSwapMutation] isBtcSell:', isBtcSell);

      const inputReqParams = {
        bitcoinAmount: isBtcSell ? new BigNumber(swapData.sellAmount).toFixed(0) : undefined,
        alkaneInputs: !isBtcSell ? [{
          alkaneId: sellCurrency,
          amount: new BigNumber(swapData.sellAmount).toFixed(0),
        }] : undefined,
      };

      console.log('[useSwapMutation] Input requirements params:', JSON.stringify(inputReqParams, null, 2));

      const inputRequirements = buildSwapInputRequirements(inputReqParams);
      console.log('[useSwapMutation] Built inputRequirements:', inputRequirements);

      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] ████ EXECUTING SWAP ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] alkanesExecuteTyped params:');
      console.log('[useSwapMutation]   inputRequirements:', inputRequirements);
      console.log('[useSwapMutation]   protostone:', protostone);
      console.log('[useSwapMutation]   feeRate:', swapData.feeRate);
      console.log('═══════════════════════════════════════════════════════════════');

      const btcNetwork = getBitcoinNetwork(network);

      const isBrowserWallet = walletType === 'browser';

      // ============================================================================
      // ⚠️ CRITICAL: Browser wallets need ACTUAL addresses, not symbolic ⚠️
      // ============================================================================
      // For browser wallets, ALL address parameters must use actual user addresses.
      // Symbolic addresses (p2tr:0, p2wpkh:0) resolve to the SDK's DUMMY wallet,
      // causing tokens and BTC to be sent to the wrong addresses!
      //
      // Bug discovered: 2026-03-01
      // TX 985436b5... sent 0.3 DIESEL + BTC change to dummy wallet addresses
      // instead of user's addresses. User lost tokens and BTC.
      //
      // For keystore wallets, symbolic addresses work because the user's mnemonic
      // is loaded into the provider, so p2tr:0 resolves to their actual address.
      // ============================================================================
      const fromAddresses = isBrowserWallet
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      // Output addresses: where swapped tokens and BTC change should go
      const toAddresses = isBrowserWallet
        ? [taprootAddress]
        : ['p2tr:0'];

      const changeAddr = isBrowserWallet
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = isBrowserWallet
        ? taprootAddress
        : 'p2tr:0';

      console.log('[useSwapMutation] Address configuration:');
      console.log('[useSwapMutation]   isBrowserWallet:', isBrowserWallet);
      console.log('[useSwapMutation]   toAddresses:', toAddresses);
      console.log('[useSwapMutation]   changeAddress:', changeAddr);
      console.log('[useSwapMutation]   alkanesChangeAddress:', alkanesChangeAddr);

      try {
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: swapData.feeRate,
          autoConfirm: false,
          fromAddresses,
          toAddresses,
          changeAddress: changeAddr,
          alkanesChangeAddress: alkanesChangeAddr,
          ordinalsStrategy: 'burn',
        });

        console.log('[useSwapMutation] Called alkanesExecuteTyped (browser:', isBrowserWallet, ')');

        console.log('[useSwapMutation] ✓ Execute result:', JSON.stringify(result, null, 2));

        // Check if SDK auto-completed the transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[useSwapMutation] Transaction auto-completed, txid:', txId);
          return {
            success: true,
            transactionId: txId,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Check if we got a readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[useSwapMutation] Got readyToSign state, signing transaction...');
          const readyToSign = result.readyToSign;

          // The PSBT comes as Uint8Array from serde_wasm_bindgen (or as object with indices)
          const psbtBase64 = extractPsbtBase64(readyToSign.psbt);
          console.log('[useSwapMutation] PSBT base64 length:', psbtBase64.length);

          // ============================================================================
          // ⚠️ CRITICAL: PSBT PATCHING REMOVED - DO NOT RE-ADD ⚠️
          // ============================================================================
          // Date Removed: 2026-03-01
          // Investigation Time: ~4 hours
          // Bug: Xverse wallet popup not appearing during swap (hung indefinitely)
          //
          // VERIFIED WORKING (2026-03-01):
          // TX: 985436b5c5c850bd121cd4862f32413f467145b121d34c006417724d71588db9
          // - Xverse popup appeared correctly after removing PSBT patching
          // - Both inputs properly mapped: Input 0 (segwit) → payment address, Input 1 (taproot) → ordinals address
          // - signInputs object correctly had separate entries for each address type
          // - Transaction broadcast successful
          //
          // ROOT CAUSE (Same as wrap bug from 2026-02-20):
          // 1. alkanes-rs SDK creates CORRECT PSBT with real addresses for browser wallets
          //    - fromAddresses: [segwitAddress, taprootAddress] passes real user addresses
          //    - SDK fetches UTXOs from these addresses and builds PSBT with correct scripts
          // 2. patchPsbtForBrowserWallet() was CORRUPTING these correct addresses
          //    - patchInputWitnessScripts() patched ALL P2TR inputs to one taproot address
          //      and ALL P2WPKH inputs to one segwit address
          //    - This overwrote correct SDK-generated addresses with potentially wrong ones
          //    - Both inputs ended up with same script type → signInputs mapping broken
          //    - Xverse couldn't find matching address for taproot input → hung indefinitely
          //
          // THE FIX:
          // - Removed patchPsbtForBrowserWallet() call entirely
          // - alkanes-rs SDK already creates PSBTs with correct real addresses
          // - No patching needed - use PSBT from SDK directly
          //
          // DIAGNOSTIC LOGS TO CHECK:
          // [SWAP] PSBT inputs:
          //   Input 0: X sats from bc1q... (segwit - payment address) ✓
          //   Input 1: 546 sats from bc1p... (taproot - ordinals address) ✓
          // If both inputs show same address type, PSBT corruption has returned.
          //
          // Related Documentation:
          // - hooks/useWrapMutation.ts:246-297 - Same fix for wrap transactions (2026-02-20)
          // - ~/.claude/CLAUDE.md: "CRITICAL: PSBT Patching Removed" section
          // - lib/psbt-patching.ts - Contains the (now unused for swaps) patching logic
          // ============================================================================

          // DIAGNOSTIC: Log PSBT inputs/outputs to detect future regressions
          console.log('[SWAP] Using PSBT from SDK (addresses already correct, no patching needed)');

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
            const result = patchInputsOnly({
              psbtBase64,
              network: btcNetwork,
              taprootAddress: taprootAddress!,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            });
            finalPsbtBase64 = result.psbtBase64;
            if (result.inputsPatched > 0) {
              console.log(`[SWAP] Patched ${result.inputsPatched} input(s) for browser wallet compatibility`);
            }
          }

          {
            const tempPsbt = bitcoin.Psbt.fromBase64(finalPsbtBase64, { network: btcNetwork });
            console.log('[SWAP] PSBT inputs:');
            tempPsbt.data.inputs.forEach((inp, idx) => {
              if (inp.witnessUtxo) {
                try {
                  const addr = bitcoin.address.fromOutputScript(
                    Buffer.from(inp.witnessUtxo.script),
                    btcNetwork
                  );
                  const hasRedeemScript = inp.redeemScript ? ' [has redeemScript]' : '';
                  console.log(`  Input ${idx}: ${inp.witnessUtxo.value} sats from ${addr}${hasRedeemScript}`);
                } catch (e) {
                  console.log(`  Input ${idx}: ${inp.witnessUtxo.value} sats from [unknown script]`);
                }
              } else {
                console.log(`  Input ${idx}: [no witnessUtxo]`);
              }
            });
            console.log('[SWAP] PSBT outputs:');
            tempPsbt.txOutputs.forEach((out, idx) => {
              try {
                const addr = bitcoin.address.fromOutputScript(out.script, btcNetwork);
                console.log(`  Output ${idx}: ${out.value} sats -> ${addr}`);
              } catch (e) {
                console.log(`  Output ${idx}: ${out.value} sats -> [OP_RETURN or invalid]`);
              }
            });
          }

          // For keystore wallets, request user confirmation before signing
          // Browser wallets handle confirmation via their own popup
          if (walletType === 'keystore' && !swapData.skipConfirmation) {
            console.log('[useSwapMutation] Keystore wallet - requesting user confirmation...');
            const approved = await requestConfirmation({
              type: 'swap',
              title: 'Confirm Swap',
              fromAmount: (parseFloat(swapData.sellAmount) / 1e8).toString(),
              fromSymbol: getTokenSymbol(swapData.sellCurrency, swapData.sellSymbol),
              fromId: swapData.sellCurrency === 'btc' ? undefined : swapData.sellCurrency,
              toAmount: (parseFloat(swapData.buyAmount) / 1e8).toString(),
              toSymbol: getTokenSymbol(swapData.buyCurrency, swapData.buySymbol),
              toId: swapData.buyCurrency === 'btc' ? undefined : swapData.buyCurrency,
              feeRate: swapData.feeRate,
            });

            if (!approved) {
              console.log('[useSwapMutation] User rejected transaction');
              throw new Error('Transaction rejected by user');
            }
            console.log('[useSwapMutation] User approved transaction');
          }

          // Sign PSBT — browser wallets sign all input types in a single call,
          // so we must NOT call signPsbt twice (causes "inputType: sh without redeemScript").
          let signedPsbtBase64: string;
          if (isBrowserWallet) {
            console.log('[useSwapMutation] Browser wallet: signing PSBT once (all input types)...');
            signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);
          } else {
            console.log('[useSwapMutation] Keystore: signing PSBT with SegWit, then Taproot...');
            signedPsbtBase64 = await signSegwitPsbt(finalPsbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }
          console.log('[useSwapMutation] PSBT signed');

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

          // Finalize all inputs
          console.log('[useSwapMutation] Finalizing PSBT...');
          signedPsbt.finalizeAllInputs();

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[useSwapMutation] Transaction ID:', txid);
          console.log('[useSwapMutation] Transaction hex length:', txHex.length);

          // Broadcast the transaction
          console.log('[useSwapMutation] Broadcasting transaction...');
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[useSwapMutation] Transaction broadcast successful');
          console.log('[useSwapMutation] Broadcast returned txid:', broadcastTxid);

          if (txid !== broadcastTxid) {
            console.warn('[useSwapMutation] WARNING: Computed txid !== broadcast txid!');
            console.warn('[useSwapMutation] Computed:', txid);
            console.warn('[useSwapMutation] Broadcast:', broadcastTxid);
          }

          return {
            success: true,
            transactionId: broadcastTxid || txid,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Check if execution completed directly
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[useSwapMutation] Execution complete, txid:', txId);
          return {
            success: true,
            transactionId: txId,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
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
      console.log('[useSwapMutation] Swap successful, txid:', data.transactionId);
      console.log('[useSwapMutation] Invalidating balance queries...');

      // Invalidate all balance-related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balance'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['alkanesTokenPairs'] });
      // Invalidate activity feed so it shows the new swap transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[useSwapMutation] Balance queries invalidated - UI should refresh when indexer processes block');
    },
  });
}
