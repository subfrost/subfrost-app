import { getWebProvider } from '@/utils/wasmProvider';
import type { Network } from '@/utils/constants';
import { parseAlkaneId } from './transform';

// AlkaneReflection type matching the Rust struct
export type AlkaneReflection = {
  id: string;
  name?: string;
  symbol?: string;
  total_supply?: string; // u128 as string
  cap?: string; // u128 as string
  minted?: string; // u128 as string
  value_per_mint?: string; // u128 as string
  data?: string; // hex string
  premine?: string; // u128 as string
  decimals: number;
};

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
  const provider = await getWebProvider(network);
  const contractId = `${alkaneId.block}:${alkaneId.tx}`;

  try {
    // Use alkanesReflect to get full token metadata via WASM
    let name = 'Unknown';
    let symbol = '';
    let decimals = 8;
    let totalSupply = 0;
    let cap = 0;
    let minted = 0;
    let valuePerMint = 0;

    try {
      const reflection = await provider.alkanesReflect(contractId) as AlkaneReflection;

      if (reflection) {
        name = reflection.name || 'Unknown';
        symbol = reflection.symbol || '';
        decimals = reflection.decimals ?? 8;
        totalSupply = reflection.total_supply ? Number(reflection.total_supply) : 0;
        cap = reflection.cap ? Number(reflection.cap) : 0;
        minted = reflection.minted ? Number(reflection.minted) : 0;
        valuePerMint = reflection.value_per_mint ? Number(reflection.value_per_mint) : 0;
      }
    } catch (reflectError) {
      // Reflection may not be supported by all contracts, use defaults
      console.log(`[fetchAlkane] Reflection failed for ${contractId}:`, reflectError);
    }

    // Calculate mint status
    const mintActive = cap > 0 && minted < cap;
    const percentageMinted = cap > 0 ? (minted / cap) * 100 : 0;

    // Normalize the response
    const details: AlkaneDetailsDisplayData = {
      id: { block: String(alkaneId.block), tx: String(alkaneId.tx) },
      name: name.replace('SUBFROST BTC', 'frBTC'),
      symbol,
      priceUsd: 0,
      decimals,
      totalSupply,
      cap,
      minted,
      mintActive,
      mintAmount: valuePerMint,
      fdvUsd: 0,
      percentageMinted,
      idClubMarketplace: null,
      maxSupply: cap || totalSupply,
      frbtcPoolFdvInSats: undefined,
      busdPoolFdvInUsd: undefined,
      image: '',
      floorPrice: 0,
      marketcap: 0,
    };

    return details;
  } catch (error) {
    console.error('[fetchAlkane] Error:', error);

    // Return default details on error
    return {
      id: { block: String(alkaneId.block), tx: String(alkaneId.tx) },
      name: 'Unknown',
      symbol: '',
      priceUsd: 0,
      decimals: 8,
      totalSupply: 0,
      cap: 0,
      minted: 0,
      mintActive: false,
      mintAmount: 0,
      fdvUsd: 0,
      percentageMinted: 0,
      idClubMarketplace: null,
      maxSupply: 0,
      frbtcPoolFdvInSats: undefined,
      busdPoolFdvInUsd: undefined,
      image: '',
      floorPrice: 0,
      marketcap: 0,
    } as AlkaneDetailsDisplayData;
  }
}
