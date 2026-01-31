// OYL Alkanode API base URL for alkane balance queries
const OYL_ALKANODE_URL = process.env.NEXT_PUBLIC_OYL_ALKANODE_URL ?? 'https://oyl.alkanode.com';

export function getConfig(network: string) {
  const host = typeof window !== 'undefined' ? window.location.host : '';

  switch (network) {
    case 'oylnet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2082',
        OYL_API_URL:
          process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://ladder-chain-sieve.sandshrew.io',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      };
    case 'signet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:571',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2088',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://signet-api.oyl.gg',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://mempool.space/signet',
        BLOCK_EXPLORER_URL_ETH: 'https://sepolia.etherscan.io',
        BOUND_API_URL: 'https://signet.bound.money/api/v1',
      } as const;
    case 'regtest':
    case 'subfrost-regtest':
      return {
        ALKANE_FACTORY_ID: '4:65498',
        BUSD_ALKANE_ID: '2:0', // NOTE: This is DIESEL (2:0 is always DIESEL). No bUSD on regtest.
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0', // frBTC (hardcoded in indexer)
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'http://localhost:18888',
        OYL_ALKANODE_URL,
        API_URL: 'https://regtest.subfrost.io/v4/subfrost',
        BLOCK_EXPLORER_URL_BTC: 'http://localhost:50010',
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'regtest-local':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:0', // NOTE: This is DIESEL (2:0 is always DIESEL). No bUSD on regtest.
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0', // frBTC (hardcoded in indexer)
        OYL_API_URL: 'http://localhost:18888',
        OYL_ALKANODE_URL,
        API_URL: 'http://localhost:4000',
        BLOCK_EXPLORER_URL_BTC: 'http://localhost:50010',
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'mainnet':
      if (host.startsWith('localhost') || host.startsWith('app.localhost') || host.startsWith('staging-app')) {
        return {
          ALKANE_FACTORY_ID: '4:65522',
          BUSD_SPLITTER_ID: '4:76',
          BUSD_ALKANE_ID: '2:56801',
          FRBTC_ALKANE_ID: '32:0',
          DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
          OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://staging-api.oyl.gg',
          OYL_ALKANODE_URL,
          BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
          BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
          BOUND_API_URL: 'https://api.bound.money/api/v1',
        } as const;
      }
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:56801',
        BUSD_SPLITTER_ID: '4:76',
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:70003',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        BOUND_API_URL: 'https://api.bound.money/api/v1',
      } as const;
    default:
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:25982',
        FRBTC_ALKANE_ID: '',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:69997',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
        OYL_ALKANODE_URL,
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      } as const;
  }
}

// OYL Alkanode API types
export interface OylAlkaneBalance {
  name: string;
  symbol: string;
  balance: string;
  alkaneId: { block: string; tx: string };
  floorPrice?: number | string;
  frbtcPoolPriceInSats?: number | string;
  busdPoolPriceInUsd?: number | string;
  priceUsd?: number | string;
  priceInSatoshi?: number | string;
  tokenImage?: string | null;
  idClubMarketplace?: boolean;
}

/**
 * Fetch alkane token balances for an address via OYL Alkanode REST API.
 * Uses POST /get-alkanes-by-address endpoint.
 */
export async function fetchAlkaneBalances(
  address: string,
  alkanodeUrl: string = OYL_ALKANODE_URL,
): Promise<OylAlkaneBalance[]> {
  const response = await fetch(`${alkanodeUrl}/get-alkanes-by-address`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  if (!response.ok) {
    throw new Error(`OYL Alkanode API error: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  return json.data ?? [];
}


