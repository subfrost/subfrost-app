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
        BLOCK_EXPLORER_URL_BTC: 'https://mempool.space/signet',
        BLOCK_EXPLORER_URL_ETH: 'https://sepolia.etherscan.io',
        BOUND_API_URL: 'https://signet.bound.money/api/v1',
      } as const;
    case 'regtest':
    case 'subfrost-regtest':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:0', // NOTE: This is DIESEL (2:0 is always DIESEL). No bUSD on regtest.
        DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID: '',
        FRBTC_ALKANE_ID: '32:0', // frBTC (hardcoded in indexer)
        USDC_ALKANE_ID: '4:8193', // USDC peg alkane for Curve LP vault
        USDT_ALKANE_ID: '4:8194', // USDT peg alkane for Curve LP vault
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'http://localhost:18888',
        API_URL: 'https://regtest.subfrost.io/v4/subfrost',
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
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      } as const;
  }
}


