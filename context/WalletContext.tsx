'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

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
  WALLET_UNLOCKED: 'subfrost_wallet_unlocked',
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

  // Check for stored keystore on mount
  useEffect(() => {
    const checkStoredKeystore = () => {
      if (typeof window === 'undefined') return;
      const stored = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
      setHasStoredKeystore(!!stored);
      setIsInitializing(false);
    };

    checkStoredKeystore();
  }, []);

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

    setWallet(unlockedWallet);
  }, [network]);

  // Restore wallet from mnemonic
  const restoreWallet = useCallback(async (mnemonic: string, password: string): Promise<void> => {
    // Create keystore manager and use its validateMnemonic method
    const manager = new KeystoreManager();

    // Validate mnemonic
    if (!manager.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    // Create wallet
    const restoredWallet = createWalletFromMnemonic(mnemonic.trim(), network);

    // Create keystore and encrypt
    const keystore = manager.createKeystore(mnemonic.trim(), { network });
    const encrypted = await manager.exportKeystore(keystore, password, { pretty: true });
    const encryptedStr = typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted, null, 2);

    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, encryptedStr);
    localStorage.setItem(STORAGE_KEYS.WALLET_NETWORK, network);

    setWallet(restoredWallet);
    setHasStoredKeystore(true);
  }, [network]);

  // Disconnect (lock) wallet
  const disconnect = useCallback(() => {
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

    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);
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

    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);

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

  // Get spendable balance
  const getSpendableTotalBalance = useCallback(async (): Promise<number> => {
    if (!wallet || !account.nativeSegwit?.address) {
      return 0;
    }

    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);

    const { spendableTotalBalance } = await api.getAddressUtxos(
      account.nativeSegwit.address,
      account.spendStrategy
    );

    return spendableTotalBalance;
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
