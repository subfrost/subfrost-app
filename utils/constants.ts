import type { Network } from '@oyl/sdk';
import { networks } from '@oyl/sdk';

export const NetworkMap: Partial<Record<Network, typeof networks.mainnet>> = {
  mainnet: networks.mainnet,
  testnet: networks.testnet,
  signet: networks.testnet,
  oylnet: networks.regtest,
};

export const SandshrewUrlMap: Partial<Record<Network, string>> = {
  mainnet: 'https://mainnet.sandshrew.io',
  testnet: 'https://testnet.sandshrew.io',
  signet: 'https://signet.sandshrew.io',
  oylnet: 'https://ladder-chain-sieve.sandshrew.io',
};


