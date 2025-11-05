interface OylConnectProviderAPI {
  isConnected: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  getAddresses: () => Promise<{
    taproot: { address: string; publicKey: string };
    nativeSegwit: { address: string; publicKey: string };
    nestedSegwit: { address: string; publicKey: string };
    legacy?: { address: string; publicKey: string };
  }>;
  getBalance: () => Promise<{
    confirmed: number;
    unconfirmed: number;
    total: number;
  }>;
  signMessage: (params: {
    address: string;
    message: string;
    protocol?: 'bip322' | 'ecdsa';
  }) => Promise<{ address: string; signature: string }>;
  signPsbt: (params: {
    psbt: string;
    finalize?: boolean;
    broadcast?: boolean;
  }) => Promise<{
    psbt: string;
    txid?: string;
  }>;
  signPsbts: (
    psbts: Array<{ psbt: string; finalize?: boolean; broadcast?: boolean }>,
  ) => Promise<
    Array<{
      psbt: string;
      txid?: string;
    }>
  >;
  pushPsbt: (params: { psbt: string }) => Promise<{ txid: string }>;
}

declare global {
  interface Window {
    oyl?: OylConnectProviderAPI;
  }
}

export {}; // Ensure this is treated as a module
export type { OylConnectProviderAPI };


