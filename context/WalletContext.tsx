'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';

import { NetworkMap, type Network } from '@/utils/constants';
// Import directly from sub-modules to avoid WASM dependency
import { AlkanesWallet, AddressType, createWallet, createWalletFromMnemonic } from '@alkanes/ts-sdk';
import { KeystoreManager, createKeystore, unlockKeystore } from '@alkanes/ts-sdk';

type Account = {
  taproot?: { address: string; pubkey: string; pubKeyXOnly: string; hdPath: string };
  nativeSegwit?: { address: string; pubkey: string; hdPath: string };
  spendStrategy: { addressOrder: string[]; utxoSortGreatestToLeast: boolean; changeAddress: string };
  network: any;
};

type FormattedUtxo = {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  address: string;
  inscriptions: any[];
  runes: any[];
  alkanes: Record<string, { value: string; name: string; symbol: string }>;
  indexed: boolean;
  confirmations: number;
};

// Storage keys
const STORAGE_KEYS = {
  ENCRYPTED_KEYSTORE: 'subfrost_encrypted_keystore',
  WALLET_NETWORK: 'subfrost_wallet_network',
  SESSION_MNEMONIC: 'subfrost_session_mnemonic', // Session-only storage for active wallet
} as const;

type WalletContextType = {
  // Connection state
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  isInitializing: boolean;

  // Wallet data
  address: string;
  paymentAddress: string;
  publicKey: string;
  account: Account;
  network: Network;
  wallet: AlkanesWallet | null;

  // Actions
  createWallet: (password: string) => Promise<{ mnemonic: string }>;
  unlockWallet: (password: string) => Promise<void>;
  restoreWallet: (mnemonic: string, password: string) => Promise<void>;
  disconnect: () => void;
  signPsbt: (psbtBase64: string) => Promise<string>;
  signPsbts: (params: { psbts: string[] }) => Promise<{ signedPsbts: string[] }>;
  signMessage: (message: string) => Promise<string>;

  // UTXO methods
  getUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableTotalBalance: () => Promise<number>;

  // For compatibility with existing code
  hasStoredKeystore: boolean;
};

const WalletContext = createContext<WalletContextType | null>(null);

interface WalletProviderProps {
  children: ReactNode;
  network: Network;
}

export function WalletProvider({ children, network }: WalletProviderProps) {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [wallet, setWallet] = useState<AlkanesWallet | null>(null);
  const [hasStoredKeystore, setHasStoredKeystore] = useState(false);

  // Check for stored keystore and restore session on mount
  useEffect(() => {
    const initializeWallet = async () => {
      if (typeof window === 'undefined') return;

      const stored = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
      setHasStoredKeystore(!!stored);

      // Check for active session (survives page navigation but not tab close)
      const sessionMnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
      if (sessionMnemonic && stored) {
        try {
          // Restore wallet from session mnemonic
          const restoredWallet = createWalletFromMnemonic(sessionMnemonic, network);
          setWallet(restoredWallet);
        } catch (error) {
          // Session invalid, clear it
          sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
        }
      }

      setIsInitializing(false);
    };

    initializeWallet();
  }, [network]);

  // Derive addresses from wallet
  const addresses = useMemo(() => {
    if (!wallet) {
      return {
        nativeSegwit: { address: '', pubkey: '', hdPath: '' },
        taproot: { address: '', pubkey: '', pubKeyXOnly: '', hdPath: '' },
      };
    }

    const segwitInfo = wallet.deriveAddress(AddressType.P2WPKH, 0, 0);
    const taprootInfo = wallet.deriveAddress(AddressType.P2TR, 0, 0);

    return {
      nativeSegwit: {
        address: segwitInfo.address,
        pubkey: segwitInfo.publicKey,
        hdPath: segwitInfo.path,
      },
      taproot: {
        address: taprootInfo.address,
        pubkey: taprootInfo.publicKey,
        pubKeyXOnly: taprootInfo.publicKey.slice(2), // Remove prefix for x-only
        hdPath: taprootInfo.path,
      },
    };
  }, [wallet]);

  // Build account structure
  const account: Account = useMemo(() => {
    return {
      nativeSegwit: addresses.nativeSegwit.address ? addresses.nativeSegwit : undefined,
      taproot: addresses.taproot.address ? addresses.taproot : undefined,
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: NetworkMap[network],
    };
  }, [addresses, network]);

  // Create new wallet
  const createNewWallet = useCallback(async (password: string): Promise<{ mnemonic: string }> => {
    // createKeystore generates mnemonic and returns both encrypted keystore and mnemonic
    const { keystore: encrypted, mnemonic } = await createKeystore(password, { network });

    // Create wallet from mnemonic
    const newWallet = createWalletFromMnemonic(mnemonic, network);

    // Store encrypted keystore
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, encrypted);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, mnemonic);

    setWallet(newWallet);
    setHasStoredKeystore(true);

    return { mnemonic };
  }, [network]);

  // Unlock existing wallet
  const unlockWallet = useCallback(async (password: string): Promise<void> => {
    const encrypted = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    if (!encrypted) {
      throw new Error('No wallet found. Please create or restore a wallet first.');
    }

    const keystore = await unlockKeystore(encrypted, password);
    const unlockedWallet = createWalletFromMnemonic(keystore.mnemonic, network);

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, keystore.mnemonic);

    setWallet(unlockedWallet);
  }, [network]);

  // Restore wallet from mnemonic
  const restoreWallet = useCallback(async (mnemonic: string, password: string): Promise<void> => {
    // Create keystore manager and use its validateMnemonic method
    const manager = new KeystoreManager();

    const trimmedMnemonic = mnemonic.trim();

    // Validate mnemonic
    if (!manager.validateMnemonic(trimmedMnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    // Create wallet
    const restoredWallet = createWalletFromMnemonic(trimmedMnemonic, network);

    // Create keystore and encrypt
    const keystore = manager.createKeystore(trimmedMnemonic, { network });
    const encrypted = await manager.exportKeystore(keystore, password, { pretty: true });
    const encryptedStr = typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted, null, 2);

    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, encryptedStr);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, trimmedMnemonic);

    setWallet(restoredWallet);
    setHasStoredKeystore(true);
  }, [network]);

  // Disconnect (lock) wallet
  const disconnect = useCallback(() => {
    // Clear session mnemonic so wallet doesn't auto-reconnect on navigation
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
    setWallet(null);
    setIsConnectModalOpen(false);
  }, []);

  // Sign PSBT
  const signPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    return wallet.signPsbt(psbtBase64);
  }, [wallet]);

  // Sign multiple PSBTs
  const signPsbts = useCallback(async (params: { psbts: string[] }): Promise<{ signedPsbts: string[] }> => {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    const signedPsbts = await Promise.all(params.psbts.map(psbt => wallet.signPsbt(psbt)));
    return { signedPsbts };
  }, [wallet]);

  // Sign message
  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    return wallet.signMessage(message, 0);
  }, [wallet]);

  // Get UTXOs
  const getUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    if (!wallet || !account.nativeSegwit) {
      return [];
    }

    const { getAlkanesProvider } = await import('@/utils/alkanesProvider');
    const api = await getAlkanesProvider(network);
    const promises: Promise<any>[] = [];

    if (account.taproot?.address) {
      promises.push(api.getAddressUtxos(account.taproot.address, account.spendStrategy));
    }

    if (account.nativeSegwit?.address) {
      promises.push(api.getAddressUtxos(account.nativeSegwit.address, account.spendStrategy));
    }

    if (promises.length === 0) {
      return [];
    }

    const results = await Promise.all(promises);
    return results.flatMap(result => result.utxos || []);
  }, [wallet, account, network]);

  // Get spendable UTXOs
  const getSpendableUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    if (!wallet || !account.nativeSegwit?.address) {
      return [];
    }

    const { getAlkanesProvider } = await import('@/utils/alkanesProvider');
    const api = await getAlkanesProvider(network);

    const { spendableUtxos } = await api.getAddressUtxos(
      account.nativeSegwit.address,
      account.spendStrategy
    );

    spendableUtxos.sort((a: any, b: any) =>
      account.spendStrategy.utxoSortGreatestToLeast
        ? b.satoshis - a.satoshis
        : a.satoshis - b.satoshis
    );

    return spendableUtxos;
  }, [wallet, account, network]);

  // Get spendable balance - uses simple esplora API for speed
  const getSpendableTotalBalance = useCallback(async (): Promise<number> => {
    if (!wallet || !account.nativeSegwit?.address) {
      return 0;
    }

    try {
      const { getNetworkUrls } = await import('@/utils/alkanesProvider');
      const networkUrls = getNetworkUrls(network);

      // Use esplora REST API directly for fast balance lookup
      // For regtest, esplora is on port 50010
      const esploraUrl = process.env.NEXT_PUBLIC_ESPLORA_URL || networkUrls.rpc;

      let totalBalance = 0;
      const addresses = [account.nativeSegwit?.address, account.taproot?.address].filter(Boolean);

      for (const address of addresses) {
        try {
          // Try REST endpoint first (esplora on port 50010)
          const restResponse = await fetch(`${esploraUrl}/address/${address}/utxo`);
          if (restResponse.ok) {
            const utxos = await restResponse.json();
            if (Array.isArray(utxos)) {
              totalBalance += utxos.reduce((sum: number, utxo: any) => sum + (utxo.value || 0), 0);
            }
          }
        } catch {
          // Fallback to RPC method
          const rpcResponse = await fetch(networkUrls.rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'esplora_address::utxo',
              params: [address],
            }),
          });
          const data = await rpcResponse.json();
          if (data.result && Array.isArray(data.result)) {
            totalBalance += data.result.reduce((sum: number, utxo: any) => sum + (utxo.value || 0), 0);
          }
        }
      }

      return totalBalance;
    } catch (error) {
      console.error('[WalletContext] Error fetching balance:', error);
      return 0;
    }
  }, [wallet, account, network]);

  const onConnectModalOpenChange = useCallback((isOpen: boolean) => {
    setIsConnectModalOpen(isOpen);
  }, []);

  // Build context value
  const contextValue = useMemo<WalletContextType>(
    () => ({
      isConnectModalOpen,
      onConnectModalOpenChange,
      isConnected: !!wallet,
      isInitializing,

      address: addresses.taproot.address || addresses.nativeSegwit.address,
      paymentAddress: addresses.nativeSegwit.address,
      publicKey: addresses.nativeSegwit.pubkey,
      account,
      network,
      wallet,

      createWallet: createNewWallet,
      unlockWallet,
      restoreWallet,
      disconnect,
      signPsbt,
      signPsbts,
      signMessage,

      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,

      hasStoredKeystore,
    }),
    [
      isConnectModalOpen,
      onConnectModalOpenChange,
      wallet,
      isInitializing,
      addresses,
      account,
      network,
      createNewWallet,
      unlockWallet,
      restoreWallet,
      disconnect,
      signPsbt,
      signPsbts,
      signMessage,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      hasStoredKeystore,
    ]
  );

  // Render children even during initialization - components can handle
  // the unconnected state. This prevents blocking navigation.
  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
