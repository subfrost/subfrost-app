import * as bitcoin from 'bitcoinjs-lib';

// Define and export Network type to use across the app
// - mainnet/testnet/signet: Standard Bitcoin networks
// - regtest: Local regtest (localhost)
// - subfrost-regtest: Hosted Subfrost regtest at regtest.subfrost.io
// - oylnet: Legacy local development network
export type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest' | 'subfrost-regtest';

// NetworkMap maps to bitcoin.networks.Network objects using bitcoinjs-lib directly
export const NetworkMap: Partial<Record<Network, bitcoin.networks.Network>> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet, // Signet uses same network params as testnet
  oylnet: bitcoin.networks.regtest,
  regtest: bitcoin.networks.regtest,
  'subfrost-regtest': bitcoin.networks.regtest,
};

// Human-readable network names for UI
export const NetworkNames: Record<Network, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  signet: 'Signet',
  oylnet: 'Local Dev',
  regtest: 'Local Regtest',
  'subfrost-regtest': 'Subfrost Regtest',
};

// Sandshrew URL map (legacy, used by some components)
export const SandshrewUrlMap: Partial<Record<Network, string>> = {
  mainnet: 'https://mainnet.sandshrew.io/v4/wrlckwrld',
  testnet: 'https://testnet.sandshrew.io/v4/wrlckwrld',
  signet: 'https://signet.sandshrew.io/v4/wrlckwrld',
  oylnet: 'https://ladder-chain-sieve.sandshrew.io/v4/wrlckwrld',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
};
