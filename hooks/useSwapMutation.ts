/**
 * useSwapMutation - Execute AMM swap transactions
 *
 * ## CRITICAL IMPLEMENTATION NOTES (January 2026)
 *
 * ### Why We Call the Pool Directly (Not the Factory)
 *
 * The app's constants/index.ts defines FACTORY_OPCODES with swap opcodes (3, 4),
 * but these DO NOT execute swaps. The actual factory only has opcodes 0-3:
 *   - 0: InitPool
 *   - 1: CreateNewPool
 *   - 2: FindExistingPoolId
 *   - 3: GetAllPools
 *
 * The POOL contract has the actual operation opcodes:
 *   - 0: Init
 *   - 1: AddLiquidity (mint LP tokens)
 *   - 2: RemoveLiquidity (burn LP tokens)
 *   - 3: Swap <-- WE USE THIS
 *   - 4: SimulateSwap
 *
 * ### The Two-Protostone Pattern
 *
 * For Swap to work, input tokens must appear in the pool's `incomingAlkanes`.
 * This is how the indexer (poolswap.rs) detects swap events:
 *   1. Looks for delegatecall to pool with inputs[0] == 0x3 (opcode 3)
 *   2. Checks incomingAlkanes for one of the pool's tokens
 *   3. Looks for return event with the other pool token
 *
 * To achieve this, we use TWO protostones:
 *   - p0: Edict [sell_block:sell_tx:amount:p1] - transfers sell tokens to p1
 *   - p1: Cellpack [pool_block,pool_tx,3,minOutput,deadline] - calls pool with opcode 3
 *
 * The edict in p0 sends sell tokens TO p1, making them available as incomingAlkanes
 * for the pool call.
 *
 * ### Previous Broken Implementation
 *
 * The old code tried to call factory with a swap opcode:
 *   Protostone: [factory_block,factory_tx,3,...]:v1:v1
 *
 * This transaction would broadcast and confirm, but NO SWAP occurred because
 * factory opcode 3 is GetAllPools, not Swap. The factory just returned pool data
 * and ignored the swap intent.
 *
 * ### Working Implementation
 *
 * Current code calls pool directly with two-protostone pattern:
 *   Protostone: [sell_block:sell_tx:amount:p1]:v0:v0,[pool_block,pool_tx,3,minOut,deadline]:v0:v0
 *
 * This ensures sell tokens flow into the pool call and get properly swapped.
 *
 * @see alkanes-rs-dev/crates/alkanes-cli-common/src/alkanes/amm.rs - Pool opcodes
 * @see alkanes-rs-dev/crates/alkanes-contract-indexer/src/helpers/poolswap.rs - Swap detection
 * @see useRemoveLiquidityMutation.ts - Same two-protostone pattern for burns
 * @see useAddLiquidityMutation.ts - Uses factory routing (different pattern)
 * @see constants/index.ts - FACTORY_OPCODES documentation with warnings
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
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
 * Pool operation codes (NOT factory opcodes!)
 * These are the opcodes for calling the pool contract directly
 */
const POOL_OPCODES = {
  Init: 0,
  AddLiquidity: 1, // mint
  RemoveLiquidity: 2, // burn
  Swap: 3,
  SimulateSwap: 4,
};

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
  poolId?: { block: string | number; tx: string | number }; // Pool to swap through
  deadlineBlocks?: number; // default 3
  isDieselMint?: boolean;
};

/**
 * Build protostone string for AMM swap operations
 *
 * This calls the POOL directly with opcode 3 (Swap).
 * We use a two-protostone pattern:
 * 1. First protostone (p0): Transfer sell tokens to p1 (the pool call)
 * 2. Second protostone (p1): Call pool with Swap opcode 3
 *
 * Format: [sell_block:sell_tx:sellAmount:p1]:v0:v0,[pool_block,pool_tx,3,minOutput,deadline]:v0:v0
 *
 * The edict [sell_block:sell_tx:sellAmount:p1] sends sell tokens to the pool call.
 * The pool call receives these tokens as incomingAlkanes and executes the swap.
 */
function buildSwapProtostone(params: {
  poolId: { block: string | number; tx: string | number };
  sellTokenId: string; // e.g., "32:0" for frBTC
  sellAmount: string;
  minOutput: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const {
    poolId,
    sellTokenId,
    sellAmount,
    minOutput,
    deadline,
    pointer = 'v0',
    refund = 'v0',
  } = params;

  const [sellBlock, sellTx] = sellTokenId.split(':');
  const poolBlock = poolId.block.toString();
  const poolTx = poolId.tx.toString();

  // First protostone: Transfer sell tokens to p1 (the pool call)
  // Edict format: [block:tx:amount:target]
  const edict = `[${sellBlock}:${sellTx}:${sellAmount}:p1]`;
  // This protostone just transfers, pointer/refund go to v0 for output tokens
  const p0 = `${edict}:${pointer}:${refund}`;

  // Second protostone: Call pool with Swap opcode (3)
  // The pool receives sell tokens from p0's edict as incomingAlkanes
  // Pool swap calldata: [pool_block, pool_tx, opcode(3), minOutput, deadline]
  const cellpack = [
    poolBlock,
    poolTx,
    POOL_OPCODES.Swap, // 3
    minOutput,
    deadline,
  ].join(',');
  const p1 = `[${cellpack}]:${pointer}:${refund}`;

  // Combine both protostones
  return `${p0},${p1}`;
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
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { FRBTC_ALKANE_ID } = getConfig(network);

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

      // Get deadline block height
      const deadlineBlocks = swapData.deadlineBlocks || 3;
      console.log('[useSwapMutation] Fetching deadline block height...');
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[useSwapMutation] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      // Validate poolId - required for the two-protostone pattern
      if (!swapData.poolId) {
        console.error('[useSwapMutation] ❌ poolId is required for swap!');
        console.error('[useSwapMutation] The swap needs a pool ID to call the pool contract directly.');
        throw new Error('Pool ID is required for swap. Make sure the quote includes the pool information.');
      }

      console.log('[useSwapMutation] Pool ID:', `${swapData.poolId.block}:${swapData.poolId.tx}`);
      console.log('[useSwapMutation] Using two-protostone pattern (like RemoveLiquidity):');
      console.log('[useSwapMutation]   p0: Edict to transfer sell tokens to p1');
      console.log('[useSwapMutation]   p1: Call pool with opcode 3 (Swap)');

      // Build protostone for the swap using two-protostone pattern
      const protostoneParams = {
        poolId: swapData.poolId,
        sellTokenId: sellCurrency,
        sellAmount: new BigNumber(ammSellAmount).toFixed(0),
        minOutput: new BigNumber(minAmountOut).toFixed(0),
        deadline: deadline.toString(),
      };

      console.log('[useSwapMutation] Protostone params:', JSON.stringify(protostoneParams, null, 2));

      const protostone = buildSwapProtostone(protostoneParams);
      console.log('[useSwapMutation] Built protostone (two-protostone pattern):', protostone);

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
      const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

      try {
        // Execute using alkanesExecuteTyped with SDK defaults:
        // - fromAddresses: ['p2wpkh:0', 'p2tr:0'] (sources from both SegWit and Taproot)
        // - changeAddress: 'p2wpkh:0' (BTC change -> SegWit)
        // - alkanesChangeAddress: 'p2tr:0' (alkane change -> Taproot)
        // - toAddresses: auto-generated from protostone vN references
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: swapData.feeRate,
          autoConfirm: true,
        });

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
