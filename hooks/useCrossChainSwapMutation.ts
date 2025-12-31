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
 * Cross-chain swap transaction data
 * Used for USDT/USDC → BTC swaps via the bridge
 */
export type CrossChainSwapData = {
  fromToken: 'USDT' | 'USDC';
  fromTokenId: string; // '4:8194' for USDT, '4:8193' for USDC
  toToken: 'BTC' | 'frBTC';
  amount: string; // Amount in token's native decimals (6 for USDT/USDC)
  maxSlippage: string; // percent string, e.g. '0.5'
  feeRate: number; // sats/vB
  deadlineBlocks?: number; // default 3
  ethereumAddress?: string; // For reverse swaps (BTC → USDT)
};

/**
 * Cross-chain swap step status
 */
export type CrossChainSwapStep = {
  step: 1 | 2 | 3 | 4 | 5;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  txHash?: string;
  message?: string;
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
 * Hook for cross-chain swaps (USDT/USDC → BTC)
 *
 * Flow for USDT/USDC → BTC:
 * 1. User deposits USDT/USDC on Ethereum to deposit address
 * 2. Bridge mints equivalent alkane tokens on Bitcoin
 * 3. Swap alkane tokens → frBTC via AMM pool
 * 4. Unwrap frBTC → BTC
 * 5. BTC sent to user's wallet
 *
 * This hook handles steps 3-5 (the on-chain Bitcoin part)
 */
export function useCrossChainSwapMutation() {
  const { network, isConnected } = useWallet();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID, FRBTC_ALKANE_ID } = getConfig(network);

  // Token decimals for USDT/USDC (6) vs frBTC (8)
  const STABLECOIN_DECIMALS = 6;
  const FRBTC_DECIMALS = 8;

  return useMutation({
    mutationFn: async (swapData: CrossChainSwapData) => {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useCrossChainSwapMutation] ████ CROSS-CHAIN SWAP STARTED ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useCrossChainSwapMutation] Input:', JSON.stringify(swapData, null, 2));

      if (!isConnected) {
        throw new Error('Wallet not connected');
      }
      if (!provider) {
        throw new Error('Provider not available');
      }

      // Step 1: Convert stablecoin amount to alkane units
      // USDT/USDC have 6 decimals, alkanes use 8 decimals internally
      // But the peg alkane should handle the conversion, so we use the raw amount
      const stablecoinAmount = new BigNumber(swapData.amount)
        .shiftedBy(STABLECOIN_DECIMALS) // Convert to smallest units
        .integerValue(BigNumber.ROUND_FLOOR)
        .toString();

      console.log('[useCrossChainSwapMutation] Stablecoin amount (raw):', stablecoinAmount);

      // Step 2: Build swap path: USDT/USDC → frBTC
      const tokenPath = [swapData.fromTokenId, FRBTC_ALKANE_ID];
      console.log('[useCrossChainSwapMutation] Token path:', tokenPath);

      // Step 3: Estimate output amount (in production, this would use pool reserves)
      // For now, use a 1:1 rate adjusted for BTC price
      // TODO: Fetch actual pool reserves and calculate expected output
      const estimatedFrbtcOutput = new BigNumber(stablecoinAmount)
        .shiftedBy(FRBTC_DECIMALS - STABLECOIN_DECIMALS) // Adjust decimals
        .toString();

      console.log('[useCrossChainSwapMutation] Estimated frBTC output:', estimatedFrbtcOutput);

      // Step 4: Calculate slippage limits
      const minAmountOut = calculateMinimumFromSlippage({
        amount: estimatedFrbtcOutput,
        maxSlippage: swapData.maxSlippage,
      });
      console.log('[useCrossChainSwapMutation] Min amount out:', minAmountOut);

      // Step 5: Get deadline block height
      const deadlineBlocks = swapData.deadlineBlocks || 3;
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[useCrossChainSwapMutation] Deadline block:', deadline);

      // Step 6: Build protostone for the swap
      const protostone = buildSwapProtostone({
        factoryId: ALKANE_FACTORY_ID,
        opcode: FACTORY_OPCODES.SwapExactTokensForTokens.toString(),
        tokenPath,
        amount: stablecoinAmount,
        limit: new BigNumber(minAmountOut).integerValue().toString(),
        deadline: deadline.toString(),
      });
      console.log('[useCrossChainSwapMutation] Protostone:', protostone);

      // Step 7: Build input requirements (stablecoin alkane)
      const inputRequirements = buildInputRequirements({
        alkaneInputs: [{
          alkaneId: swapData.fromTokenId,
          amount: stablecoinAmount,
        }],
      });
      console.log('[useCrossChainSwapMutation] Input requirements:', inputRequirements);

      // Step 8: Execute the swap
      console.log('[useCrossChainSwapMutation] Executing swap...');

      try {
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: swapData.feeRate,
          autoConfirm: true,
        });

        console.log('[useCrossChainSwapMutation] Swap result:', JSON.stringify(result, null, 2));

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

        console.log('[useCrossChainSwapMutation] Swap tx:', swapTxId);

        // Step 9: If target is BTC (not frBTC), we need to unwrap
        // The unwrap should happen automatically if the protostone is configured correctly
        // or we trigger a separate unwrap transaction

        if (swapData.toToken === 'BTC') {
          console.log('[useCrossChainSwapMutation] Target is BTC, frBTC will be unwrapped');
          // Note: The unwrap typically happens in the same transaction if configured
          // or can be done separately via the unwrap mutation
        }

        return {
          success: true,
          swapTransactionId: swapTxId,
          steps: [
            { step: 3, status: 'completed', txHash: swapTxId, message: 'Swap completed' },
          ] as CrossChainSwapStep[],
        };
      } catch (error: any) {
        console.error('[useCrossChainSwapMutation] Swap failed:', error);
        throw error;
      }
    },
  });
}

/**
 * Token configurations for cross-chain swaps
 */
export const CROSS_CHAIN_TOKENS = {
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    alkaneId: '4:8194',
    decimals: 6,
    ethereumContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum mainnet
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    alkaneId: '4:8193',
    decimals: 6,
    ethereumContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum mainnet
  },
} as const;

/**
 * Deposit addresses for cross-chain bridge
 */
export const BRIDGE_DEPOSIT_ADDRESSES = {
  USDT: '0x59f57b84d6742acdaa56e9da1c770898e4a270b6',
  USDC: '0x59f57b84d6742acdaa56e9da1c770898e4a270b6', // Same address for now
} as const;
