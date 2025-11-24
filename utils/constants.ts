import type { NetworkType } from '@alkanes/ts-sdk';
import * as bitcoin from 'bitcoinjs-lib';

export const NetworkMap: Partial<Record<NetworkType, bitcoin.Network>> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet, // Signet often uses testnet parameters or specific signet parameters not in bitcoinjs-lib
  regtest: bitcoin.networks.regtest, // Assuming oylnet maps to regtest
};

export const SandshrewUrlMap: Partial<Record<NetworkType, string>> = {
  mainnet: 'https://mainnet.sandshrew.io',
  testnet: 'https://testnet.sandshrew.io',
  signet: 'https://signet.sandshrew.io',
  regtest: 'https://oylnet-api.oyl.gg', // Assuming oylnet maps to regtest
};


