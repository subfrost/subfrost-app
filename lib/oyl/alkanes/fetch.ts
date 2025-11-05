import type { Network } from '@oyl/sdk';
import { getApiProvider } from '@/utils/oylProvider';
import { parseAlkaneId } from './transform';

export type AlkaneDetailsDisplayData = {
  id: { block: string; tx: string };
  name: string;
  symbol: string;
  priceUsd: number;
  decimals: number;
  totalSupply: number;
  cap: number;
  minted: number;
  mintActive: boolean;
  mintAmount: number;
  fdvUsd: number;
  percentageMinted: number;
  idClubMarketplace: boolean | null;
  maxSupply: number;
  frbtcPoolFdvInSats?: number;
  busdPoolFdvInUsd?: number;
  image: string;
  floorPrice: number;
  marketcap: number;
};

export async function fetchAlkane(id: string, network: Network) {
  if (id === 'btc') {
    const btcDetails: AlkaneDetailsDisplayData = {
      id: { block: '0', tx: '0' },
      name: 'Bitcoin',
      symbol: 'BTC',
      priceUsd: 0,
      decimals: 8,
      totalSupply: 2100000000000000,
      cap: 21000000,
      minted: 0,
      mintActive: false,
      mintAmount: 0,
      fdvUsd: 0,
      percentageMinted: 0,
      idClubMarketplace: false,
      maxSupply: 2100000000000000,
      frbtcPoolFdvInSats: undefined,
      busdPoolFdvInUsd: undefined,
      image: '',
      floorPrice: 0,
      marketcap: 0,
    };
    return btcDetails;
  }
  const alkaneId = parseAlkaneId(id);
  const provider = getApiProvider(network);
  const response: any = await provider.getAlkaneTokenDetails({ alkaneId });
  response.name = response.name?.replace?.('SUBFROST BTC', 'frBTC') ?? response.name;
  return response as AlkaneDetailsDisplayData;
}


