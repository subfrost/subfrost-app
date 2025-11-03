import type { Network } from './constants';

export function getConfig(network: Network) {
  const host = typeof window !== 'undefined' ? window.location.host : '';

  switch (network) {
    case 'signet':
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:571',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://signet-api.oyl.gg',
      };
    case 'mainnet':
      if (host.startsWith('localhost') || host.startsWith('app.localhost') || host.startsWith('staging-app')) {
        return {
          ALKANE_FACTORY_ID: '4:65522',
          BUSD_ALKANE_ID: '2:56801',
          FRBTC_ALKANE_ID: '32:0',
          OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://staging-api.oyl.gg',
        };
      }
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:56801',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
      };
    case 'oylnet':
    case 'regtest':
    default:
      return {
        ALKANE_FACTORY_ID: '4:65522',
        BUSD_ALKANE_ID: '2:8',
        FRBTC_ALKANE_ID: '32:0',
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
      };
  }
}


