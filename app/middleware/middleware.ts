import { address } from "bitcoinjs-lib";

export type NetworkParams = {
  bech32Prefix: string;
  p2pkhPrefix: number;
  p2shPrefix: number;
};

export type Networks = {
  [key: string]: NetworkParams;
};

export const NETWORKS: Networks = {
  REGTEST: {
    bech32Prefix: "bcrt",
    p2pkhPrefix: 0x64,
    p2shPrefix: 0xc4
  },
  MAINNET: {
    bech32Prefix: "bc",
    p2shPrefix: 0x05,
    p2pkhPrefix: 0x00
  },
  TESTNET: {
    bech32Prefix: "tb",
    p2pkhPrefix: 0x6f,
    p2shPrefix: 0xc4
  },
  LUCKYCOIN: {
    bech32Prefix: "lky",
    p2pkhPrefix: 0x2f,
    p2shPrefix: 0x05
  },
  DOGECOIN: {
    bech32Prefix: "dc",
    p2pkhPrefix: 0x1e,
    p2shPrefix: 0x16
  },
  BELLSCOIN: {
    bech32Prefix: "bel",
    p2pkhPrefix: 0x19,
    p2shPrefix: 0x1e
  }
};

let network: Network = NETWORKS.REGTEST;

export function setNetwork(network: string) {
  network = NETWORKS[network] || NETWORKS.REGTEST;
}

export function lasereyesMiddleware(v: any): any {
  const result = { ...v };
  try {
    const decoded = address.fromBech32(result.address);
    result.address = address.toBech32(decoded.data, decoded.version, network.bech32Prefix);
  } catch (e) {
     // skip
  }
  return result;
}
