import type { Network } from '@oyl/sdk';
import { networks } from '@oyl/sdk';

// UI
export const LINKS = {
  home: '/',
  swap: '/swap',
  stake: '/stake',
  governance: '/governance',
  earn: '/earn',
  wrap: '/wrap',
  profile: '/profile',
  privacy: '/privacy',
  terms: '/terms',
};

// Regex
// export const EMAIL_REGEX = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/g;
export const EMAIL_REGEX = /^([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

// Breakpoints
export const MOBILE_BREAKPOINT = 640;
export const TABLET_BREAKPOINT = 768;
export const DESKTOP_BREAKPOINT = 1024;

export const SANDSHREW_PROJECT_ID = 'd6aebfed1769128379aca7d215f0b689';

export const NetworkMap: Record<Network, typeof networks.mainnet> = {
  mainnet: networks.mainnet,
  testnet: networks.testnet,
  signet: networks.testnet,
  regtest: networks.regtest,
  oylnet: networks.regtest,
};

export const SandshrewUrlMap = {
  mainnet: 'https://mainnet.sandshrew.io',
  testnet: 'https://testnet.sandshrew.io',
  signet: 'https://signet.sandshrew.io',
  regtest: 'http://localhost:18888',
  oylnet: 'https://ladder-chain-sieve.sandshrew.io',
};

export const EspoUrlMap = {
  mainnet: 'https://api.alkanode.com/rpc',
  oylnet: 'https://ladder-chain-sieve.sandshrew.io/espo/rpc',
};
