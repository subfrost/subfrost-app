import * as bitcoin from 'bitcoinjs-lib';

// Define and export Network type to use across the app
// - mainnet/testnet/signet: Standard Bitcoin networks
// - regtest: Local regtest (localhost)
// - regtest-local: Local Docker regtest environment (localhost:18888)
// - subfrost-regtest: Hosted Subfrost regtest at regtest.subfrost.io
// - oylnet: Legacy local development network
// - devnet: In-browser devnet (full protocol simulation)
// - custom: User-specified JSON-RPC URL + v4 (sandshrew) / v5 (qubitcoin) interface
export type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest' | 'regtest-local' | 'qubitcoin-regtest' | 'subfrost-regtest' | 'devnet' | 'custom';

// NetworkMap maps to bitcoin.networks.Network objects using bitcoinjs-lib directly
export const NetworkMap: Partial<Record<Network, bitcoin.networks.Network>> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet, // Signet uses same network params as testnet
  oylnet: bitcoin.networks.regtest,
  regtest: bitcoin.networks.regtest,
  'regtest-local': bitcoin.networks.regtest,
  'qubitcoin-regtest': bitcoin.networks.regtest,
  'subfrost-regtest': bitcoin.networks.regtest,
  devnet: bitcoin.networks.regtest,
  // Custom: assume mainnet network params; user owns the address space they target.
  custom: bitcoin.networks.bitcoin,
};

// Human-readable network names for UI
export const NetworkNames: Record<Network, string> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  signet: 'Signet',
  oylnet: 'Local Dev',
  regtest: 'Local Regtest',
  'regtest-local': 'Local Docker',
  'qubitcoin-regtest': 'Qubitcoin Regtest',
  'subfrost-regtest': 'Subfrost Regtest',
  devnet: 'In-Browser Devnet',
  custom: 'Custom',
};

// Sandshrew URL map (legacy, used by some components)
export const SandshrewUrlMap: Partial<Record<Network, string>> = {
  mainnet: 'https://mainnet.sandshrew.io/v4/wrlckwrld',
  testnet: 'https://testnet.sandshrew.io/v4/wrlckwrld',
  signet: 'https://signet.sandshrew.io/v4/wrlckwrld',
  oylnet: 'https://ladder-chain-sieve.sandshrew.io/v4/wrlckwrld',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
};
