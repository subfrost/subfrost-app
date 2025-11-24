// Define AddressType enum locally based on its usage
export enum AddressType {
  P2PKH = 'p2pkh',      // Legacy
  P2SH = 'p2sh',        // Script hash
  P2WPKH = 'p2wpkh',    // Native SegWit
  P2TR = 'p2tr',        // Taproot
}

// Define NetworkType locally
export type NetworkType = 'mainnet' | 'testnet' | 'signet' | 'regtest';

// Define UTXO interface locally
export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

// Define Account type locally, as it's not directly imported
export type Account = {
  spendStrategy: {
    addressOrder: string[];
    utxoSortGreatestToLeast: boolean;
    changeAddress: string;
  };
  network: NetworkType;
  taproot?: {
    address: string | null;
    pubkey: string | null;
    pubKeyXOnly: string;
    hdPath: string;
  };
  nativeSegwit?: {
    address: string | null;
    pubkey: string | null;
    hdPath: string;
  };
};

// Define Network type locally for compatibility, as original code uses 'Network'
export type Network = NetworkType;

// Define a placeholder for FormattedUtxo to satisfy existing code
export namespace utxo {
  export type FormattedUtxo = UTXO & {
    status: {
      confirmed: boolean;
      block_height?: number;
      block_hash?: string;
      block_time?: number;
    };
    scriptpubkey: string;
    value: number;
    witnessUtxo: {
      script: Buffer;
      value: number;
    };
    rawTx?: string;
    txHex?: string;
  };
}
