import { useQuery } from '@tanstack/react-query';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';
import { useApiProvider } from '@/hooks/useApiProvider';

export type AddressPosition = {
  id: string;
  poolId: { block: string; tx: string };
  poolName: string;
  balance: string; // LP token balance in alks
  token0Amount: string;
  token1Amount: string;
  tokenSupply: string;
  poolTvlInUsd?: number;
  totalValueInUsd?: number;
  currencyA: {
    id: string;
    name: string;
    amount: string;
  };
  currencyB: {
    id: string;
    name: string;
    amount: string;
  };
};

export function useAddressPositions(address: string) {
  const api = useApiProvider();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  return useQuery({
    queryKey: ['address-positions', address, network],
    enabled: !!address,
    queryFn: async () => {
      if (!address) {
        return [];
      }

      const response = await api.getPoolPositionsByAddress({
        address,
        factoryId: parseAlkaneId(ALKANE_FACTORY_ID),
      });

      if (!response || response.length === 0) {
        return [];
      }

      return response.map((position: any): AddressPosition => {
        const [currencyAName, currencyBName] = position.poolName.split(' / ');

        return {
          id: `${position.poolId.block}:${position.poolId.tx}`,
          poolId: position.poolId,
          poolName: position.poolName,
          balance: position.balance || '0',
          token0Amount: position.token0Amount || '0',
          token1Amount: position.token1Amount || '0',
          tokenSupply: position.tokenSupply || '0',
          poolTvlInUsd: position.poolTvlInUsd,
          totalValueInUsd: position.totalValueInUsd,
          currencyA: {
            id: `${position.token0.block}:${position.token0.tx}`,
            name: currencyAName?.replace('SUBFROST BTC', 'frBTC') ?? '',
            amount: position.token0Amount || '0',
          },
          currencyB: {
            id: `${position.token1.block}:${position.token1.tx}`,
            name: currencyBName?.replace('SUBFROST BTC', 'frBTC').replace(' LP', '') ?? '',
            amount: position.token1Amount || '0',
          },
        };
      });
    },
  });
}

export function useAddressPosition(address: string, poolId: string) {
  const allPositionsQuery = useAddressPositions(address);
  const positions = allPositionsQuery.data;

  if (!positions || positions.length === 0 || !poolId) {
    return null;
  }

  const position = positions.find((pos) => pos.id === poolId);
  return position || null;
}
