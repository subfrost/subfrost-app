/**
 * Network configurations for @alkanes/ts-sdk
 * Compatible with @oyl/sdk networks
 */

import * as bitcoin from 'bitcoinjs-lib';

/**
 * Network configuration type
 */
export interface NetworkConfig {
  network: bitcoin.networks.Network;
  networkType: 'mainnet' | 'testnet' | 'signet' | 'regtest';
  name: string;
}

/**
 * Mainnet configuration
 */
export const mainnet: NetworkConfig = {
  network: bitcoin.networks.bitcoin,
  networkType: 'mainnet',
  name: 'Bitcoin Mainnet',
};

/**
 * Testnet configuration
 */
export const testnet: NetworkConfig = {
  network: bitcoin.networks.testnet,
  networkType: 'testnet',
  name: 'Bitcoin Testnet',
};

/**
 * Signet configuration
 */
export const signet: NetworkConfig = {
  network: bitcoin.networks.testnet, // Signet uses same network params as testnet
  networkType: 'signet',
  name: 'Bitcoin Signet',
};

/**
 * Regtest configuration
 */
export const regtest: NetworkConfig = {
  network: bitcoin.networks.regtest,
  networkType: 'regtest',
  name: 'Bitcoin Regtest',
};

/**
 * Oylnet configuration (regtest variant)
 */
export const oylnet: NetworkConfig = {
  network: bitcoin.networks.regtest,
  networkType: 'regtest',
  name: 'Oylnet (Regtest)',
};

/**
 * Networks namespace export (compatible with @oyl/sdk)
 */
export const networks = {
  mainnet,
  testnet,
  signet,
  regtest,
  oylnet,
  bitcoin: mainnet, // Alias for compatibility
};

export default networks;
