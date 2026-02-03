/**
 * useSwapMutation - Execute AMM swap transactions
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
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
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

/**
 * Factory router opcodes for swap operations.
 * The deployed pool logic is missing Swap (opcode 3), so we route through the factory.
 */
const FACTORY_SWAP_OPCODE = 13; // SwapExactTokensForTokens

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
function buildSwapProtostone(params: {
  factoryId: string; // e.g., "4:65498"
  sellTokenId: string; // e.g., "2:0" for DIESEL
  buyTokenId: string; // e.g., "32:0" for frBTC
  sellAmount: string;
  minOutput: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const {
    factoryId,
    sellTokenId,
    buyTokenId,
    sellAmount,
    minOutput,
    deadline,
    pointer = 'v0',
    refund = 'v0',
  } = params;

  const [sellBlock, sellTx] = sellTokenId.split(':');
  const [buyBlock, buyTx] = buyTokenId.split(':');
  const [factoryBlock, factoryTx] = factoryId.split(':');

  // Single cellpack protostone: Call factory with SwapExactTokensForTokens (opcode 13)
  // The SDK auto-generates p0 (edict) from inputRequirements, making this p1.
  // Sell tokens arrive as incomingAlkanes via the auto-generated edict.
  const cellpack = [
    factoryBlock,
    factoryTx,
    FACTORY_SWAP_OPCODE, // 13
    2, // path_len (always 2 for direct swap: sell → buy)
    sellBlock,
    sellTx,
    buyBlock,
    buyTx,
    sellAmount,
    minOutput,
    deadline,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for alkanes execute
 * Format: "B:amount" for bitcoin, "block:tx:amount" for alkanes
 */
function buildInputRequirements(params: {
  bitcoinAmount?: string;
  alkaneInputs?: Array<{ alkaneId: string; amount: string }>;
}): string {
  const parts: string[] = [];

  if (params.bitcoinAmount && params.bitcoinAmount !== '0') {
    parts.push(`B:${params.bitcoinAmount}`);
  }

  if (params.alkaneInputs) {
    for (const input of params.alkaneInputs) {
      const [block, tx] = input.alkaneId.split(':');
      parts.push(`${block}:${tx}:${input.amount}`);
    }
  }

  return parts.join(',');
}

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

      const inputRequirements = buildInputRequirements(inputReqParams);
      console.log('[useSwapMutation] Built inputRequirements:', inputRequirements);

      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] ████ EXECUTING SWAP ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] alkanesExecuteTyped params:');
      console.log('[useSwapMutation]   inputRequirements:', inputRequirements);
      console.log('[useSwapMutation]   protostone:', protostone);
      console.log('[useSwapMutation]   feeRate:', swapData.feeRate);
      console.log('═══════════════════════════════════════════════════════════════');

      // Determine btcNetwork for PSBT operations
      // Must match network detection in other mutation hooks (useWrapMutation, etc.)
      let btcNetwork: bitcoin.Network;
      switch (network) {
        case 'mainnet':
          btcNetwork = bitcoin.networks.bitcoin;
          break;
        case 'testnet':
        case 'signet':
          btcNetwork = bitcoin.networks.testnet;
          break;
        case 'regtest':
        case 'regtest-local':
        case 'subfrost-regtest':
        case 'oylnet':
        default:
          btcNetwork = bitcoin.networks.regtest;
          break;
      }

      try {
        // Build fromAddresses array - use actual wallet addresses, not SDK descriptors
        // This ensures the SDK can find UTXOs correctly even when wallet isn't loaded via mnemonic
        const fromAddresses: string[] = [];
        if (segwitAddress) fromAddresses.push(segwitAddress);
        if (taprootAddress) fromAddresses.push(taprootAddress);

        // Execute using alkanesExecuteTyped with ACTUAL addresses:
        // - fromAddresses: actual wallet addresses (fixes "Available: []" issue)
        // - changeAddress: segwit address for BTC change
        // - alkanesChangeAddress: taproot address for alkane change
        // - toAddresses: taproot address for outputs
        // autoConfirm must be false — no wallet mnemonic is loaded into the WASM
        // provider (app uses external wallet signing). With autoConfirm: true the SDK
        // attempts to sign internally and throws when no wallet is present.
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: swapData.feeRate,
          autoConfirm: false,
          fromAddresses,
          toAddresses: [taprootAddress], // Swapped tokens go to taproot
          changeAddress: segwitAddress || taprootAddress, // BTC change to segwit
          alkanesChangeAddress: taprootAddress, // Alkane change to taproot
        });

        console.log('[useSwapMutation] Called alkanesExecuteTyped with fromAddresses:', fromAddresses);

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
          let psbtBase64: string;
          if (readyToSign.psbt instanceof Uint8Array) {
            psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
          } else if (typeof readyToSign.psbt === 'string') {
            // Already base64
            psbtBase64 = readyToSign.psbt;
          } else if (typeof readyToSign.psbt === 'object') {
            // PSBT came back as object with numeric keys (e.g., {"0": 112, "1": 115, ...})
            const keys = Object.keys(readyToSign.psbt).map(Number).sort((a, b) => a - b);
            const bytes = new Uint8Array(keys.length);
            for (let i = 0; i < keys.length; i++) {
              bytes[i] = readyToSign.psbt[keys[i]];
            }
            psbtBase64 = uint8ArrayToBase64(bytes);
          } else {
            throw new Error('Unexpected PSBT format: ' + typeof readyToSign.psbt);
          }
          console.log('[useSwapMutation] PSBT base64 length:', psbtBase64.length);

          // Debug: Analyze PSBT structure
          try {
            const debugPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            console.log('[useSwapMutation] PSBT has', debugPsbt.inputCount, 'inputs');
            console.log('[useSwapMutation] PSBT has', debugPsbt.txOutputs.length, 'outputs');
          } catch (dbgErr) {
            console.log('[useSwapMutation] PSBT debug parse error:', dbgErr);
          }

          // For keystore wallets, request user confirmation before signing
          // Browser wallets handle confirmation via their own popup
          if (walletType === 'keystore' && !swapData.skipConfirmation) {
            console.log('[useSwapMutation] Keystore wallet - requesting user confirmation...');
            const sellSymbol = swapData.sellSymbol || (swapData.sellCurrency === 'btc' ? 'BTC' : swapData.sellCurrency);
            const buySymbol = swapData.buySymbol || (swapData.buyCurrency === 'btc' ? 'BTC' : swapData.buyCurrency);
            const approved = await requestConfirmation({
              type: 'swap',
              title: 'Confirm Swap',
              fromAmount: (parseFloat(swapData.sellAmount) / 1e8).toString(),
              fromSymbol: sellSymbol,
              toAmount: (parseFloat(swapData.buyAmount) / 1e8).toString(),
              toSymbol: buySymbol,
              feeRate: swapData.feeRate,
            });

            if (!approved) {
              console.log('[useSwapMutation] User rejected transaction');
              throw new Error('Transaction rejected by user');
            }
            console.log('[useSwapMutation] User approved transaction');
          }

          // Sign the PSBT with both keys (SegWit first, then Taproot)
          // The PSBT may have inputs from both address types
          console.log('[useSwapMutation] Signing PSBT with SegWit key first, then Taproot key...');
          let signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          console.log('[useSwapMutation] PSBT signed with both keys');

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
