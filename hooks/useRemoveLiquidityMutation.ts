/**
 * useRemoveLiquidityMutation.ts
 *
 * This hook handles removing liquidity from AMM pools by burning LP tokens.
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## CRITICAL IMPLEMENTATION NOTES (January 2026)
 *
 * ### Why We Call the Pool Directly (Not the Factory)
 *
 * The app's constants/index.ts defines FACTORY_OPCODES including opcode 12 (Burn),
 * but this opcode DOES NOT EXIST in the deployed factory contract. The actual
 * factory only has opcodes 0-3:
 *   - 0: InitPool
 *   - 1: CreateNewPool
 *   - 2: FindExistingPoolId
 *   - 3: GetAllPools
 *
 * The POOL contract has the actual operation opcodes:
 *   - 0: Init
 *   - 1: AddLiquidity (mint LP tokens)
 *   - 2: RemoveLiquidity (burn LP tokens) <-- WE USE THIS
 *   - 3: Swap
 *   - 4: SimulateSwap
 *
 * ### The Two-Protostone Pattern
 *
 * For RemoveLiquidity to work, LP tokens must appear in the pool's `incomingAlkanes`.
 * This is how the indexer (poolburn.rs) detects burn events:
 *   1. Looks for delegatecall to pool with inputs[0] == 0x2 (opcode 2)
 *   2. Checks incomingAlkanes for LP tokens matching the pool ID
 *
 * To achieve this, we use TWO protostones:
 *   - p0: Edict [lp_block:lp_tx:amount:p1] - transfers LP tokens to p1
 *   - p1: Cellpack [pool_block,pool_tx,2,...] - calls pool with opcode 2
 *
 * The edict in p0 sends LP tokens TO p1, making them available as incomingAlkanes
 * for the pool call.
 *
 * ### Previous Broken Implementation
 *
 * The old code tried to call factory opcode 12:
 *   Protostone: [4,0,12,2,3,amount,min0,min1,deadline]:v0:v0
 *
 * This transaction would broadcast and confirm, but LP tokens were NOT burned
 * because factory opcode 12 doesn't exist - the factory just ignored the call.
 *
 * ### Working Implementation
 *
 * Current code calls pool directly with two-protostone pattern:
 *   Protostone: [2:3:amount:p1]:v0:v0,[2,3,2,min0,min1,deadline]:v0:v0
 *
 * This ensures LP tokens flow into the pool call and get properly burned.
 *
 * @see alkanes-rs-dev/crates/alkanes-cli-common/src/alkanes/amm.rs - Pool opcodes
 * @see alkanes-rs-dev/crates/alkanes-contract-indexer/src/helpers/poolburn.rs - Burn detection
 * @see alkanes-rs-dev/docs/FLEXIBLE-PROTOSTONE-PARSING.md - Protostone format docs
 * @see useSwapMutation.ts - Same two-protostone pattern for swaps
 * @see useAddLiquidityMutation.ts - Uses factory routing (different pattern)
 * @see constants/index.ts - FACTORY_OPCODES documentation with warnings
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { getFutureBlockHeight } from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type RemoveLiquidityTransactionData = {
  lpTokenId: string;       // LP token alkane id (e.g., "3:123")
  lpAmount: string;        // amount of LP tokens to burn (display units)
  lpDecimals?: number;     // LP token decimals (default 8)
  minAmount0?: string;     // minimum token0 to receive (display units, optional)
  minAmount1?: string;     // minimum token1 to receive (display units, optional)
  token0Decimals?: number; // token0 decimals (default 8)
  token1Decimals?: number; // token1 decimals (default 8)
  feeRate: number;         // sats/vB
  deadlineBlocks?: number; // blocks until deadline (default 3)
};

/**
 * Convert display amount to alks (atomic units)
 * Default is 8 decimals for alkane tokens
 */
function toAlks(amount: string, decimals: number = 8): string {
  const bn = new BigNumber(amount);
  return bn.multipliedBy(Math.pow(10, decimals)).integerValue(BigNumber.ROUND_FLOOR).toString();
}

/**
 * Pool operation codes
 * These are the opcodes for calling the pool contract directly
 */
const POOL_OPCODES = {
  Init: 0,
  AddLiquidity: 1, // mint
  RemoveLiquidity: 2, // burn
  Swap: 3,
  SimulateSwap: 4,
};

/**
 * Build protostone string for RemoveLiquidity (Burn) operation
 *
 * This calls the POOL directly with opcode 2 (RemoveLiquidity/Burn).
 * The LP token ID IS the pool ID (e.g., 2:3 is both the pool contract and its LP token).
 *
 * We use a two-protostone pattern:
 * 1. First protostone (p0): Transfer LP tokens to p1 (the pool call)
 * 2. Second protostone (p1): Call pool with RemoveLiquidity opcode 2
 *
 * Format: [lp_block:lp_tx:lpAmount:p1]:v0:v0,[pool_block,pool_tx,2,minAmount0,minAmount1,deadline]:v0:v0
 *
 * The edict [lp_block:lp_tx:lpAmount:p1] sends LP tokens to the pool call.
 * The pool call receives these tokens as incomingAlkanes and burns them.
 */
function buildRemoveLiquidityProtostone(params: {
  factoryId: string; // kept for signature compatibility but not used
  lpTokenId: string; // LP token = pool ID
  lpAmount: string;
  minAmount0: string;
  minAmount1: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const {
    lpTokenId,
    lpAmount,
    minAmount0,
    minAmount1,
    deadline,
    pointer = 'v0',
    refund = 'v0',
  } = params;

  const [lpBlock, lpTx] = lpTokenId.split(':');

  // First protostone: Transfer LP tokens to p1 (the pool call)
  // Edict format: [block:tx:amount:target]
  const edict = `[${lpBlock}:${lpTx}:${lpAmount}:p1]`;
  // This protostone just transfers, pointer/refund go to v0 for any remaining tokens
  const p0 = `${edict}:${pointer}:${refund}`;

  // Second protostone: Call pool with RemoveLiquidity opcode (2)
  // The pool receives LP tokens from p0's edict
  const cellpack = [
    lpBlock,      // pool block (= LP block)
    lpTx,         // pool tx (= LP tx)
    POOL_OPCODES.RemoveLiquidity, // 2
    minAmount0,
    minAmount1,
    deadline,
  ].join(',');
  const p1 = `[${cellpack}]:${pointer}:${refund}`;

  // Combine both protostones
  return `${p0},${p1}`;
}

/**
 * Build input requirements string for RemoveLiquidity
 * Format: "lp_block:lp_tx:lpAmount"
 */
function buildRemoveLiquidityInputRequirements(params: {
  lpTokenId: string;
  lpAmount: string;
}): string {
  const { lpTokenId, lpAmount } = params;
  const [block, tx] = lpTokenId.split(':');
  return `${block}:${tx}:${lpAmount}`;
}

export function useRemoveLiquidityMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  // Get bitcoin network for PSBT parsing
  const getBitcoinNetwork = () => {
    switch (network) {
      case 'mainnet':
        return bitcoin.networks.bitcoin;
      case 'testnet':
      case 'signet':
        return bitcoin.networks.testnet;
      case 'regtest':
      case 'regtest-local':
      case 'subfrost-regtest':
      case 'oylnet':
        return bitcoin.networks.regtest;
      default:
        return bitcoin.networks.bitcoin;
    }
  };

  return useMutation({
    mutationFn: async (data: RemoveLiquidityTransactionData) => {
      console.log('[RemoveLiquidity] ═══════════════════════════════════════════');
      console.log('[RemoveLiquidity] Starting remove liquidity transaction');
      console.log('[RemoveLiquidity] Input data:', JSON.stringify(data, null, 2));

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // Get addresses - use actual addresses instead of SDK descriptors
      // This fixes the "Available: []" issue where SDK couldn't find alkane UTXOs
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      console.log('[RemoveLiquidity] Using addresses:', { taprootAddress, segwitAddress });

      // Convert display amounts to alks
      const lpAmountAlks = toAlks(data.lpAmount, data.lpDecimals ?? 8);
      const minAmount0Alks = data.minAmount0 ? toAlks(data.minAmount0, data.token0Decimals ?? 8) : '0';
      const minAmount1Alks = data.minAmount1 ? toAlks(data.minAmount1, data.token1Decimals ?? 8) : '0';

      console.log('[RemoveLiquidity] Amounts in alks:', { lpAmountAlks, minAmount0Alks, minAmount1Alks });

      // Get block height for deadline (regtest uses large offset so deadline never expires)
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
      const deadline = await getFutureBlockHeight(
        isRegtest ? 1000 : (data.deadlineBlocks || 3),
        provider as any
      );

      console.log('[RemoveLiquidity] Deadline block:', deadline);

      // Build protostone - calls pool directly with opcode 2
      // Uses two-protostone pattern: p0 transfers LP tokens to p1 (pool call)
      const protostone = buildRemoveLiquidityProtostone({
        factoryId: ALKANE_FACTORY_ID, // not used, kept for compatibility
        lpTokenId: data.lpTokenId,
        lpAmount: lpAmountAlks,
        minAmount0: minAmount0Alks,
        minAmount1: minAmount1Alks,
        deadline: deadline.toString(),
      });

      console.log('[RemoveLiquidity] Protostone (two-protostone pattern):', protostone);
      console.log('[RemoveLiquidity] p0: edict transfers LP to p1');
      console.log('[RemoveLiquidity] p1: pool call with opcode 2 (RemoveLiquidity)');

      // Build input requirements
      const inputRequirements = buildRemoveLiquidityInputRequirements({
        lpTokenId: data.lpTokenId,
        lpAmount: lpAmountAlks,
      });

      console.log('[RemoveLiquidity] Input requirements:', inputRequirements);

      console.log('[RemoveLiquidity] ═══════════════════════════════════════════');
      console.log('[RemoveLiquidity] Executing...');
      console.log('[RemoveLiquidity] inputRequirements:', inputRequirements);
      console.log('[RemoveLiquidity] protostone:', protostone);
      console.log('[RemoveLiquidity] feeRate:', data.feeRate);

      const btcNetwork = getBitcoinNetwork();

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
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: data.feeRate,
          autoConfirm: false,
          fromAddresses,
          toAddresses: [taprootAddress], // Returned tokens go to taproot
          changeAddress: segwitAddress || taprootAddress, // BTC change to segwit
          alkanesChangeAddress: taprootAddress, // Alkane change to taproot
        });

        console.log('[RemoveLiquidity] Called alkanesExecuteTyped with fromAddresses:', fromAddresses);

        console.log('[RemoveLiquidity] Execute result:', JSON.stringify(result, null, 2));

        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[RemoveLiquidity] Transaction auto-completed, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[RemoveLiquidity] Got readyToSign, signing PSBT...');
          const readyToSign = result.readyToSign;

          // Convert PSBT to base64
          let psbtBase64: string;
          if (readyToSign.psbt instanceof Uint8Array) {
            psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
          } else if (typeof readyToSign.psbt === 'string') {
            psbtBase64 = readyToSign.psbt;
          } else if (typeof readyToSign.psbt === 'object') {
            const keys = Object.keys(readyToSign.psbt).map(Number).sort((a, b) => a - b);
            const bytes = new Uint8Array(keys.length);
            for (let i = 0; i < keys.length; i++) {
              bytes[i] = readyToSign.psbt[keys[i]];
            }
            psbtBase64 = uint8ArrayToBase64(bytes);
          } else {
            throw new Error('Unexpected PSBT format');
          }

          // Sign the PSBT with both keys (SegWit first, then Taproot)
          // The PSBT may have inputs from both address types
          console.log('[RemoveLiquidity] Signing PSBT with SegWit key first, then Taproot key...');
          let signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[RemoveLiquidity] Transaction built:', txid);

          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[RemoveLiquidity] Broadcast successful:', broadcastTxid);

          return {
            success: true,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[RemoveLiquidity] Complete, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[RemoveLiquidity] Transaction ID:', txId);
        return { success: true, transactionId: txId };

      } catch (error) {
        console.error('[RemoveLiquidity] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[RemoveLiquidity] Success! txid:', data.transactionId);

      // Invalidate balance queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['pool-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lp-positions'] });
      // Invalidate activity feed so it shows the new liquidity transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
    },
  });
}
