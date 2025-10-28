import { networks } from '@oyl/sdk';

export type Network = 'mainnet' | 'signet' | 'regtest' | 'oylnet';

export const NetworkMap: Record<Network, typeof networks.mainnet> = {
  mainnet: networks.mainnet,
  signet: networks.testnet,
  regtest: networks.regtest,
  oylnet: networks.regtest,
};

export const SandshrewUrlMap: Record<Network, string> = {
  mainnet: 'https://mainnet.sandshrew.io',
  signet: 'https://signet.sandshrew.io',
  regtest: 'https://regtest.sandshrew.io',
  oylnet: 'https://regtest.sandshrew.io',
};


