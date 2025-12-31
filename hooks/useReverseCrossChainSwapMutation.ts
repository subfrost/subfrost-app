import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { FACTORY_OPCODES } from '@/constants';
import {
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';

/**
 * Reverse cross-chain swap transaction data
 * Used for BTC → USDT/USDC swaps via the bridge
 */
export type ReverseCrossChainSwapData = {
  fromToken: 'BTC' | 'frBTC';
  toToken: 'USDT' | 'USDC';
  toTokenId: string; // '4:8194' for USDT, '4:8193' for USDC
  amount: string; // Amount in BTC/frBTC (8 decimals)
  maxSlippage: string; // percent string, e.g. '0.5'
  feeRate: number; // sats/vB
  deadlineBlocks?: number; // default 3
  ethereumAddress: string; // Required: where to send USDT/USDC on Ethereum
};

/**
 * Build protostone string for AMM swap operations
 */
function buildSwapProtostone(params: {
  factoryId: string;
  opcode: string;
  tokenPath: string[];
  amount: string;
  limit: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const { factoryId, opcode, tokenPath, amount, limit, deadline, pointer = 'v1', refund = 'v1' } = params;
  const [factoryBlock, factoryTx] = factoryId.split(':');

  const pathTokens = tokenPath.flatMap(token => token.split(':'));
  const cellpack = [
    factoryBlock,
    factoryTx,
    opcode,
    tokenPath.length.toString(),
    ...pathTokens,
    amount,
    limit,
    deadline,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for alkanes execute
 */
function buildInputRequirements(params: {
  alkaneInputs: Array<{ alkaneId: string; amount: string }>;
}): string {
  return params.alkaneInputs
    .map(input => {
      const [block, tx] = input.alkaneId.split(':');
      return `${block}:${tx}:${input.amount}`;
    })
    .join(',');
}

/**
 * Hook for reverse cross-chain swaps (BTC → USDT/USDC)
 *
 * Flow for BTC → USDT/USDC:
 * 1. User wraps BTC → frBTC (if starting from BTC)
 * 2. Swap frBTC → USDT/USDC alkane via AMM pool
 * 3. Bridge burns alkane tokens
 * 4. Equivalent USDT/USDC sent to user's Ethereum address
 *
 * This hook handles steps 1-2 (the on-chain Bitcoin part)
 * Step 3-4 happens via the bridge backend watching for burns
 */
export function useReverseCrossChainSwapMutation() {
  const { network, isConnected } = useWallet();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID, FRBTC_ALKANE_ID } = getConfig(network);

  // Token decimals for frBTC (8) vs USDT/USDC (6)
  const FRBTC_DECIMALS = 8;
  const STABLECOIN_DECIMALS = 6;

  return useMutation({
    mutationFn: async (swapData: ReverseCrossChainSwapData) => {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useReverseCrossChainSwapMutation] ████ REVERSE CROSS-CHAIN SWAP STARTED ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useReverseCrossChainSwapMutation] Input:', JSON.stringify(swapData, null, 2));

      if (!isConnected) {
        throw new Error('Wallet not connected');
      }
      if (!provider) {
        throw new Error('Provider not available');
      }
      if (!swapData.ethereumAddress || !swapData.ethereumAddress.startsWith('0x')) {
        throw new Error('Valid Ethereum address required for reverse cross-chain swap');
      }

      // Step 1: Convert BTC/frBTC amount to base units (satoshis)
      const frbtcAmount = new BigNumber(swapData.amount)
        .shiftedBy(FRBTC_DECIMALS)
        .integerValue(BigNumber.ROUND_FLOOR)
        .toString();

      console.log('[useReverseCrossChainSwapMutation] frBTC amount (sats):', frbtcAmount);

      // Step 2: Build swap path: frBTC → USDT/USDC
      const tokenPath = [FRBTC_ALKANE_ID, swapData.toTokenId];
      console.log('[useReverseCrossChainSwapMutation] Token path:', tokenPath);

      // Step 3: Estimate output amount (in production, this would use pool reserves)
      // Adjust for decimal difference (8 decimals → 6 decimals)
      const estimatedStablecoinOutput = new BigNumber(frbtcAmount)
        .shiftedBy(STABLECOIN_DECIMALS - FRBTC_DECIMALS)
        .toString();

      console.log('[useReverseCrossChainSwapMutation] Estimated stablecoin output:', estimatedStablecoinOutput);

      // Step 4: Calculate slippage limits
      const minAmountOut = calculateMinimumFromSlippage({
        amount: estimatedStablecoinOutput,
        maxSlippage: swapData.maxSlippage,
      });
      console.log('[useReverseCrossChainSwapMutation] Min amount out:', minAmountOut);

      // Step 5: Get deadline block height
      const deadlineBlocks = swapData.deadlineBlocks || 3;
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[useReverseCrossChainSwapMutation] Deadline block:', deadline);

      // Step 6: Build protostone for the swap
      const protostone = buildSwapProtostone({
        factoryId: ALKANE_FACTORY_ID,
        opcode: FACTORY_OPCODES.SwapExactTokensForTokens.toString(),
        tokenPath,
        amount: frbtcAmount,
        limit: new BigNumber(minAmountOut).integerValue().toString(),
        deadline: deadline.toString(),
      });
      console.log('[useReverseCrossChainSwapMutation] Protostone:', protostone);

      // Step 7: Build input requirements (frBTC)
      const inputRequirements = buildInputRequirements({
        alkaneInputs: [{
          alkaneId: FRBTC_ALKANE_ID,
          amount: frbtcAmount,
        }],
      });
      console.log('[useReverseCrossChainSwapMutation] Input requirements:', inputRequirements);

      // Step 8: Execute the swap
      // Note: For BTC input, we'd need to wrap first using useWrapMutation
      // This assumes the user already has frBTC
      console.log('[useReverseCrossChainSwapMutation] Executing swap...');

      try {
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: swapData.feeRate,
          autoConfirm: true,
        });

        console.log('[useReverseCrossChainSwapMutation] Swap result:', JSON.stringify(result, null, 2));

        // Extract transaction ID from result
        let swapTxId: string | undefined;
        if (result?.txid) {
          swapTxId = result.txid;
        } else if (result?.reveal_txid) {
          swapTxId = result.reveal_txid;
        } else if (result?.complete?.reveal_txid) {
          swapTxId = result.complete.reveal_txid;
        }

        if (!swapTxId) {
          throw new Error('Swap execution did not return a transaction ID');
        }

        console.log('[useReverseCrossChainSwapMutation] Swap tx:', swapTxId);

        // Step 9: The bridge backend should detect the stablecoin output
        // and initiate the Ethereum transfer to the user's address
        console.log('[useReverseCrossChainSwapMutation] Stablecoin will be bridged to:', swapData.ethereumAddress);

        return {
          success: true,
          swapTransactionId: swapTxId,
          ethereumAddress: swapData.ethereumAddress,
          expectedOutput: estimatedStablecoinOutput,
        };
      } catch (error: any) {
        console.error('[useReverseCrossChainSwapMutation] Swap failed:', error);
        throw error;
      }
    },
  });
}

/**
 * Token configurations for reverse cross-chain swaps
 */
export const REVERSE_CROSS_CHAIN_TOKENS = {
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    alkaneId: '4:8194',
    decimals: 6,
    ethereumContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    alkaneId: '4:8193',
    decimals: 6,
    ethereumContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
} as const;
