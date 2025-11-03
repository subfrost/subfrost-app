import type { Network } from './constants';

export function getConfig(network: Network) {
  const host = typeof window !== 'undefined' ? window.location.host : '';

  switch (network) {
    case 'signet':
      return {
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://signet-api.oyl.gg',
      };
    case 'mainnet':
      if (host.startsWith('localhost') || host.startsWith('app.localhost') || host.startsWith('staging-app')) {
        return {
          OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://staging-api.oyl.gg',
        };
      }
      return {
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
      };
    case 'oylnet':
    case 'regtest':
    default:
      return {
        OYL_API_URL: process.env.NEXT_PUBLIC_OYL_API_URL ?? 'https://mainnet-api.oyl.gg',
      };
  }
}


