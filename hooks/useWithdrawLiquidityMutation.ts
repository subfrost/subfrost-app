import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { amm } from '@oyl/sdk';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import type { AlkaneId } from '@oyl/sdk';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { getConfig } from '@/utils/getConfig';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { FACTORY_OPCODES } from '@/constants';
import { assertAlkaneUtxosAreClean, calculateMinimumFromSlippage, getFutureBlockHeight } from '@/utils/amm';
import { useApiProvider } from '@/hooks/useApiProvider';

export type WithdrawLiquidityBaseData = {
  poolId: AlkaneId; // pool LP token ID
  amount: string; // LP token amount in alks
  feeRate: number; // sats/vB
  maxSlippage?: string; // percent string, e.g. '0.5'
  deadlineBlocks?: number; // default 3
  isDieselMint?: boolean;
};

export function useWithdrawLiquidityMutation() {
  const { getUtxos, account, network, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();
  const api = useApiProvider();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (withdrawData: WithdrawLiquidityBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      try {
        const factoryId = parseAlkaneId(ALKANE_FACTORY_ID);

        // Fetch pool details to get token reserves
        const poolDetails = await api.getAlkanesTokenPoolDetails({
          factoryId,
          poolId: withdrawData.poolId,
        });

        if (!poolDetails) {
          throw new Error('Failed to fetch pool details');
        }

        // Calculate approximate amounts of tokens received
        const lpTokenSupply = BigInt(poolDetails.tokenSupply || '0');
        const token0Reserve = BigInt(poolDetails.token0Amount || '0');
        const token1Reserve = BigInt(poolDetails.token1Amount || '0');

        // Calculate token amounts proportional to LP tokens being withdrawn
        const lpAmount = BigInt(new BigNumber(withdrawData.amount).toFixed());
        const token0Amount =
          lpTokenSupply > 0
            ? (lpAmount * token0Reserve) / lpTokenSupply
            : BigInt(0);
        const token1Amount =
          lpTokenSupply > 0
            ? (lpAmount * token1Reserve) / lpTokenSupply
            : BigInt(0);

        // Calculate minimum amounts with slippage
        const maxSlippage = withdrawData.maxSlippage || '0.5';
        const amount0Min = calculateMinimumFromSlippage({
          amount: token0Amount.toString(),
          maxSlippage,
        });
        const amount1Min = calculateMinimumFromSlippage({
          amount: token1Amount.toString(),
          maxSlippage,
        });

        const deadlineBlocks = withdrawData.deadlineBlocks || 3;

        const calldata = [
          BigInt(factoryId.block),
          BigInt(factoryId.tx),
          BigInt(FACTORY_OPCODES.Burn),
          BigInt(poolDetails.token0.block),
          BigInt(poolDetails.token0.tx),
          BigInt(poolDetails.token1.block),
          BigInt(poolDetails.token1.tx),
          lpAmount,
          BigInt(new BigNumber(amount0Min).toFixed()), // amount_a_min
          BigInt(new BigNumber(amount1Min).toFixed()), // amount_b_min
          BigInt(await getFutureBlockHeight(deadlineBlocks, provider)), // deadline
        ];

        const tokens = [{ alkaneId: withdrawData.poolId, amount: lpAmount }];

        const utxos = await getUtxos();

        const { utxos: alkanesUtxos } = amm.factory.splitAlkaneUtxos(tokens, utxos);
        assertAlkaneUtxosAreClean(alkanesUtxos);

        const { executeResult } = await executeWithBtcWrapUnwrap({
          utxos,
          alkanesUtxos,
          calldata,
          feeRate: withdrawData.feeRate,
          account,
          provider,
          signer: signerShim,
          addDieselMint: withdrawData.isDieselMint,
        });

        if (!executeResult?.txId) {
          throw new Error('Failed to sign transaction');
        }

        return {
          success: true,
          transactionId: executeResult.txId,
        };
      } catch (error) {
        console.error('Error removing liquidity:', error);

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error removing liquidity';

        throw new Error(errorMessage);
      }
    },
  });
}
