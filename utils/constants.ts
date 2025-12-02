import * as bitcoin from 'bitcoinjs-lib';

// Define and export Network type to use across the app
export type Network = 'mainnet' | 'testnet' | 'signet' | 'regtest';

// NetworkMap maps to bitcoin.networks.Network objects using bitcoinjs-lib directly
export const NetworkMap: Record<Network, bitcoin.networks.Network> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet, // Signet uses same network params as testnet
  regtest: bitcoin.networks.regtest,
};

export const SandshrewUrlMap: Partial<Record<Network, string>> = {
  mainnet: 'https://mainnet.sandshrew.io/v4/wrlckwrld',
  testnet: 'https://testnet.sandshrew.io/v4/wrlckwrld',
  signet: 'https://signet.sandshrew.io/v4/wrlckwrld',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
};
