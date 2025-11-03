export function getConfig(network: string) {
  const host = window.location.host;

  switch (network) {
    case 'regtest':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://ladder-chain-sieve.sandshrew.io',
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      };
    case 'oylnet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://ladder-chain-sieve.sandshrew.io',
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      };
    case 'signet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:571',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://signet-api.oyl.gg',
        BLOCK_EXPLORER_URL_BTC: 'https://mempool.space/signet',
        BLOCK_EXPLORER_URL_ETH: 'https://sepolia.etherscan.io',
      };
    case 'mainnet':
      if (host.startsWith('localhost') ||host.startsWith('app.localhost') || host.startsWith('staging-app')) {
        return {
          ALKANE_FACTORY_ID: '4:65522',
          BUSD_ALKANE_ID: '2:56801',
          FRBTC_ALKANE_ID: '32:0',
          OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://staging-api.oyl.gg',
          BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
          BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        };
      } else {
        return {
          ALKANE_FACTORY_ID: '4:65522',
          BUSD_ALKANE_ID: '2:56801',
          FRBTC_ALKANE_ID: '32:0',
          OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
          BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
          BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
        };
      }
    default:
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:25982',
        FRBTC_ALKANE_ID: '',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
        BLOCK_EXPLORER_URL_BTC: 'https://ordiscan.com',
        BLOCK_EXPLORER_URL_ETH: 'https://etherscan.io',
      };
  }
} 