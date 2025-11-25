import { networks } from '@/ts-sdk';
import type { networks as btcNetworks } from 'bitcoinjs-lib';

// Define types locally to avoid import issues with ts-sdk
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest';

// NetworkMap maps to bitcoin.networks.Network objects (the .network property from ts-sdk NetworkConfig)
export const NetworkMap: Partial<Record<Network, btcNetworks.Network>> = {
  mainnet: networks.mainnet.network,
  testnet: networks.testnet.network,
  signet: networks.signet.network,
  oylnet: networks.oylnet.network,
};

export const SandshrewUrlMap: Partial<Record<Network, string>> = {
  mainnet: 'https://mainnet.sandshrew.io/v4/wrlckwrld',
  testnet: 'https://testnet.sandshrew.io/v4/wrlckwrld',
  signet: 'https://signet.sandshrew.io/v4/wrlckwrld',
  oylnet: 'https://ladder-chain-sieve.sandshrew.io/v4/wrlckwrld',
};
