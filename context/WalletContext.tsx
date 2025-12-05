'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { NetworkMap, type Network } from '@/utils/constants';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Session storage key for mnemonic
const SESSION_MNEMONIC_KEY = 'subfrost_session_mnemonic';
// Import directly from sub-modules to avoid WASM dependency
import { AlkanesWallet, AddressType, createWallet, createWalletFromMnemonic } from '@alkanes/ts-sdk';
import { KeystoreManager, createKeystore, unlockKeystore } from '@alkanes/ts-sdk';

// Map app network names to SDK network names for address generation
// The SDK only recognizes: mainnet, testnet, regtest
function toSdkNetwork(network: Network): 'mainnet' | 'testnet' | 'regtest' {
  switch (network) {
    case 'mainnet':
      return 'mainnet';
    case 'testnet':
    case 'signet':
      return 'testnet';
    case 'regtest':
    case 'subfrost-regtest':
    case 'oylnet':
      return 'regtest';
    default:
      return 'mainnet';
  }
}

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
  const { provider: sdkProvider, isInitialized: sdkInitialized, loadWallet } = useAlkanesSDK();
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
          const restoredWallet = createWalletFromMnemonic(sessionMnemonic, toSdkNetwork(network));
          setWallet(restoredWallet);

          // Also load the wallet into the SDK provider for signing
          if (sdkInitialized && loadWallet) {
            loadWallet(sessionMnemonic);
          }
        } catch (error) {
          // Session invalid, clear it
          sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
        }
      }

      setIsInitializing(false);
    };

    initializeWallet();
  }, [network, sdkInitialized, loadWallet]);

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
    const sdkNetwork = toSdkNetwork(network);
    const { keystore: encrypted, mnemonic } = await createKeystore(password, { network: sdkNetwork });

    // Create wallet from mnemonic
    const newWallet = createWalletFromMnemonic(mnemonic, sdkNetwork);

    // Store encrypted keystore
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, encrypted);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, mnemonic);

    setWallet(newWallet);
    setHasStoredKeystore(true);

    // Load wallet into SDK provider for signing
    if (loadWallet) {
      loadWallet(mnemonic);
    }

    return { mnemonic };
  }, [network, loadWallet]);

  // Unlock existing wallet
  const unlockWallet = useCallback(async (password: string): Promise<void> => {
    const encrypted = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    if (!encrypted) {
      throw new Error('No wallet found. Please create or restore a wallet first.');
    }

    const keystore = await unlockKeystore(encrypted, password);
    const unlockedWallet = createWalletFromMnemonic(keystore.mnemonic, toSdkNetwork(network));

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, keystore.mnemonic);

    setWallet(unlockedWallet);

    // Load wallet into SDK provider for signing
    if (loadWallet) {
      loadWallet(keystore.mnemonic);
    }
  }, [network, loadWallet]);

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
    const sdkNetwork = toSdkNetwork(network);
    const restoredWallet = createWalletFromMnemonic(trimmedMnemonic, sdkNetwork);

    // Create keystore and encrypt
    const keystore = manager.createKeystore(trimmedMnemonic, { network: sdkNetwork });
    const encrypted = await manager.exportKeystore(keystore, password, { pretty: true });
    const encryptedStr = typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted, null, 2);

    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, encryptedStr);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);

    // Store mnemonic in session for page navigation persistence
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, trimmedMnemonic);

    setWallet(restoredWallet);
    setHasStoredKeystore(true);

    // Load wallet into SDK provider for signing
    if (loadWallet) {
      loadWallet(trimmedMnemonic);
    }
  }, [network, loadWallet]);

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

  // Get UTXOs using WASM provider
  const getUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    if (!wallet || !account.nativeSegwit || !sdkProvider || !sdkInitialized) {
      return [];
    }

    try {
      const utxos: FormattedUtxo[] = [];

      // Fetch UTXOs for native segwit address
      if (account.nativeSegwit?.address) {
        const enriched = await sdkProvider.getEnrichedBalances(account.nativeSegwit.address, '1');
        if (enriched) {
          // Combine all UTXO categories
          const allUtxos = [
            ...(enriched.spendable || []),
            ...(enriched.assets || []),
            ...(enriched.pending || []),
          ];
          for (const utxo of allUtxos) {
            utxos.push({
              txId: utxo.txid || '',
              outputIndex: utxo.vout || 0,
              satoshis: utxo.value || 0,
              scriptPk: utxo.scriptpubkey || '',
              address: account.nativeSegwit.address,
              inscriptions: [],
              runes: [],
              alkanes: {},
              indexed: true,
              confirmations: utxo.status?.confirmed ? 1 : 0,
            });
          }
        }
      }

      // Fetch UTXOs for taproot address
      if (account.taproot?.address) {
        const enriched = await sdkProvider.getEnrichedBalances(account.taproot.address, '1');
        if (enriched) {
          const allUtxos = [
            ...(enriched.spendable || []),
            ...(enriched.assets || []),
            ...(enriched.pending || []),
          ];
          for (const utxo of allUtxos) {
            utxos.push({
              txId: utxo.txid || '',
              outputIndex: utxo.vout || 0,
              satoshis: utxo.value || 0,
              scriptPk: utxo.scriptpubkey || '',
              address: account.taproot.address,
              inscriptions: [],
              runes: [],
              alkanes: {},
              indexed: true,
              confirmations: utxo.status?.confirmed ? 1 : 0,
            });
          }
        }
      }

      return utxos;
    } catch (error) {
      console.error('[WalletContext] Error fetching UTXOs:', error);
      return [];
    }
  }, [wallet, account, sdkProvider, sdkInitialized]);

  // Get spendable UTXOs using WASM provider
  const getSpendableUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    if (!wallet || !account.nativeSegwit?.address || !sdkProvider || !sdkInitialized) {
      return [];
    }

    try {
      const enriched = await sdkProvider.getEnrichedBalances(account.nativeSegwit.address, '1');

      if (!enriched || !enriched.spendable) {
        return [];
      }

      const spendableUtxos: FormattedUtxo[] = enriched.spendable.map((utxo: any) => ({
        txId: utxo.txid || '',
        outputIndex: utxo.vout || 0,
        satoshis: utxo.value || 0,
        scriptPk: utxo.scriptpubkey || '',
        address: account.nativeSegwit!.address,
        inscriptions: [],
        runes: [],
        alkanes: {},
        indexed: true,
        confirmations: utxo.status?.confirmed ? 1 : 0,
      }));

      spendableUtxos.sort((a, b) =>
        account.spendStrategy.utxoSortGreatestToLeast
          ? b.satoshis - a.satoshis
          : a.satoshis - b.satoshis
      );

      return spendableUtxos;
    } catch (error) {
      console.error('[WalletContext] Error fetching spendable UTXOs:', error);
      return [];
    }
  }, [wallet, account, sdkProvider, sdkInitialized]);

  // Get spendable balance using WASM provider
  const getSpendableTotalBalance = useCallback(async (): Promise<number> => {
    if (!wallet || !account.nativeSegwit?.address || !sdkProvider || !sdkInitialized) {
      return 0;
    }

    try {
      // Get enriched balances which includes spendable/assets/pending categorization
      const enriched = await sdkProvider.getEnrichedBalances(account.nativeSegwit.address, '1');

      // enriched.spendable is an array of UTXOs
      // Calculate total balance from spendable UTXOs
      if (enriched && enriched.spendable && Array.isArray(enriched.spendable)) {
        return enriched.spendable.reduce((total: number, utxo: any) => {
          return total + (utxo.value || 0);
        }, 0);
      }

      return 0;
    } catch (error) {
      console.error('[WalletContext] Error fetching balance:', error);
      return 0;
    }
  }, [wallet, account, sdkProvider, sdkInitialized]);

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

  if (isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 size={32} color="#449CFF" className="animate-spin" />
      </div>
    );
  }

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
