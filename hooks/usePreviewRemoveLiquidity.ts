import { useQuery } from '@tanstack/react-query';
import { alksToAlkanes } from '@/utils/currencyConverters';
import { parseAlkaneId, formatAlkaneId } from '@/lib/oyl/alkanes/transform';
import { fetchAlkane } from '@/lib/oyl/alkanes/fetch';
import { useApiProvider } from '@/hooks/useApiProvider';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import BigNumber from 'bignumber.js';

type PoolId = {
  block: string;
  tx: string;
};

type PreviewRemoveLiquidityParams = {
  poolId: PoolId | null;
  amount: string; // in alks
  enabled?: boolean;
};

type TokenInfo = {
  id: string;
  name: string;
  symbol?: string;
};

type PreviewResult = {
  tokenA: {
    info: TokenInfo | null;
    amount: string; // in display format (alkanes)
  };
  tokenB: {
    info: TokenInfo | null;
    amount: string; // in display format (alkanes)
  };
  isLoading: boolean;
  error: unknown;
};

export function usePreviewRemoveLiquidity({
  poolId,
  amount,
  enabled = true,
}: PreviewRemoveLiquidityParams): PreviewResult {
  const { network } = useWallet();
  const api = useApiProvider();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  const { data, isLoading, error } = useQuery({
    queryKey: ['previewRemoveLiquidity', poolId?.block, poolId?.tx, amount, network],
    queryFn: async () => {
      if (!poolId || !amount || amount === '0') {
        return null;
      }

      try {
        const factoryId = parseAlkaneId(ALKANE_FACTORY_ID);
        const poolDetails = await api.getAlkanesTokenPoolDetails({
          factoryId,
          poolId: { block: poolId.block, tx: poolId.tx },
        });

        if (!poolDetails) {
          throw new Error('Failed to fetch pool details');
        }

        // Fetch token details
        const [token0, token1] = await Promise.all([
          fetchAlkane(formatAlkaneId(poolDetails.token0), network),
          fetchAlkane(formatAlkaneId(poolDetails.token1), network),
        ]);

        // Calculate approximate amounts of tokens received
        const lpTokenSupply = BigInt(poolDetails.tokenSupply || '0');
        const token0Reserve = BigInt(poolDetails.token0Amount || '0');
        const token1Reserve = BigInt(poolDetails.token1Amount || '0');

        // Calculate token amounts proportional to LP tokens being withdrawn
        const lpAmount = BigInt(new BigNumber(amount).toFixed());
        const token0Amount =
          lpTokenSupply > 0 ? (lpAmount * token0Reserve) / lpTokenSupply : BigInt(0);
        const token1Amount =
          lpTokenSupply > 0 ? (lpAmount * token1Reserve) / lpTokenSupply : BigInt(0);

        // Convert to display format (Alkanes)
        const token0DisplayAmount = alksToAlkanes(token0Amount.toString());
        const token1DisplayAmount = alksToAlkanes(token1Amount.toString());

        return {
          tokenA: {
            info: {
              id: `${poolDetails.token0.block}:${poolDetails.token0.tx}`,
              name: token0.name || 'Token A',
              symbol: token0.symbol || 'TKA',
            },
            amount: token0DisplayAmount,
          },
          tokenB: {
            info: {
              id: `${poolDetails.token1.block}:${poolDetails.token1.tx}`,
              name: token1.name || 'Token B',
              symbol: token1.symbol || 'TKB',
            },
            amount: token1DisplayAmount,
          },
        };
      } catch (error) {
        console.error('Error previewing remove liquidity:', error);
        throw error;
      }
    },
    enabled: enabled && !!poolId && !!amount && amount !== '0',
  });

  return {
    tokenA: data?.tokenA || { info: null, amount: '0' },
    tokenB: data?.tokenB || { info: null, amount: '0' },
    isLoading,
    error,
  };
}
