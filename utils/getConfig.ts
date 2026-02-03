/**
 * Network configuration for Subfrost app
 *
 * All API calls should go through @alkanes/ts-sdk which is configured
 * with the correct URLs in AlkanesSDKContext. This config file only
 * contains static configuration values like contract IDs and block explorer URLs.
 */

// Subfrost API base URLs per network
export const SUBFROST_API_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
};

// Block explorer URLs per network
export const BLOCK_EXPLORER_URLS: Record<string, string> = {
  mainnet: 'https://espo.subfrost.io/mainnet',
  testnet: 'https://espo.subfrost.io/testnet',
  signet: 'https://espo.subfrost.io/signet',
  regtest: 'https://espo.subfrost.io/regtest',
  'regtest-local': 'http://localhost:50010',
  'subfrost-regtest': 'https://espo.subfrost.io/regtest',
  oylnet: 'https://espo.subfrost.io/mainnet',
};

export function getConfig(network: string) {
  const host = typeof window !== 'undefined' ? window.location.host : '';

  // Get API URL for network (defaults to mainnet)
  const apiUrl = SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;
  const blockExplorerUrl = BLOCK_EXPLORER_URLS[network] || BLOCK_EXPLORER_URLS.mainnet;

  switch (network) {
    case 'oylnet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        FRBTC_ALKANE_ID: '32:0',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2082',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      };
    case 'signet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:571',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:2088',
        FRBTC_ALKANE_ID: '32:0',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
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
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: '',
      } as const;
    case 'regtest-local':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:0', // NOTE: This is DIESEL (2:0 is always DIESEL). No bUSD on regtest.
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0', // frBTC (hardcoded in indexer)
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
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
          API_URL: apiUrl,
          BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
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
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        BOUND_API_URL: 'https://api.bound.money/api/v1',
      } as const;
    default:
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:25982',
        FRBTC_ALKANE_ID: '',
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '2:69997',
        API_URL: apiUrl,
        BLOCK_EXPLORER_URL_BTC: blockExplorerUrl,
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      } as const;
  }
}

/**
 * Alkane balance type (returned by SDK's dataApi.getAlkanesByAddress)
 */
export interface AlkaneBalance {
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
 * @deprecated Use provider.dataApi.getAlkanesByAddress() from @alkanes/ts-sdk instead
 * This function is kept for backward compatibility but will be removed.
 */
export async function fetchAlkaneBalances(
  address: string,
  _alkanodeUrl?: string,
): Promise<AlkaneBalance[]> {
  console.warn(
    'fetchAlkaneBalances is deprecated. Use provider.dataApi.getAlkanesByAddress() from @alkanes/ts-sdk instead.'
  );

  // Fallback to RPC if called directly (shouldn't happen in normal usage)
  const rpcUrl = typeof window !== 'undefined' ? '/api/rpc' : (
    process.env.REGTEST_RPC_URL || 'https://regtest.subfrost.io/v4/subfrost'
  );

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_protorunesbyaddress',
      params: [{ address }],
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const result = json.result;
  if (!result?.outpoints) return [];

  // Aggregate balances across all outpoints
  const balanceMap = new Map<string, bigint>();
  for (const outpoint of result.outpoints) {
    const balances = outpoint?.balance_sheet?.cached?.balances ?? [];
    for (const bal of balances) {
      const key = `${bal.block}:${bal.tx}`;
      const prev = balanceMap.get(key) ?? 0n;
      balanceMap.set(key, prev + BigInt(bal.amount));
    }
  }

  // Convert to AlkaneBalance format
  const entries: AlkaneBalance[] = [];
  for (const [alkaneId, amount] of balanceMap) {
    const [block, tx] = alkaneId.split(':');
    entries.push({
      name: '',
      symbol: '',
      balance: amount.toString(),
      alkaneId: { block, tx },
    });
  }

  return entries;
}
