'use client';

/**
 * WalletContext - Pure Alkanes Wallet Implementation
 *
 * Uses @alkanes/ts-sdk for wallet management (no lasereyes dependency)
 */

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { NetworkMap } from '@/utils/constants';
import {
  restoreAlkanesWallet,
  loadKeystoreFromStorage,
  hasStoredKeystore,
  type AlkanesWalletInstance,
} from '@/lib/oyl/alkanes/wallet-integration';

// Types
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet';

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

// Wallet provider type for compatibility
type WalletProviderType = 'AlkanesWallet';

// PSBT signing response types
type SignPsbtResponse = {
  signedPsbtBase64: string;
  signedPsbtHex: string;
};

type SignPsbtsResponse = {
  signedPsbts: SignPsbtResponse[];
};

type WalletContextType = {
  // Connection state
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  isInitializing: boolean;

  // Wallet info
  address: string;
  paymentAddress: string;
  publicKey: string;
  provider: WalletProviderType | null;

  // Actions
  finalizeConnect: (walletName: WalletProviderType) => void;
  disconnect: () => void;

  // UTXO functions
  getUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableTotalBalance: () => Promise<number>;

  // PSBT signing
  signPsbt: (psbtHex: string) => Promise<SignPsbtResponse | null>;
  signPsbts: (params: { psbts: string[] }) => Promise<SignPsbtsResponse | null>;

  // Account info
  account: Account;
  network: Network;

  // Wallet instance (for signing, etc.)
  wallet: AlkanesWalletInstance | null;
};

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({
  children,
  network: initialNetwork
}: {
  children: ReactNode;
  network: Network;
}) {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [wallet, setWallet] = useState<AlkanesWalletInstance | null>(null);
  const [walletAddresses, setWalletAddresses] = useState<{
    nativeSegwit: string;
    taproot: string;
    publicKey: string;
  } | null>(null);

  const network = initialNetwork;

  // Check for stored keystore on mount
  useEffect(() => {
    const checkStoredWallet = async () => {
      try {
        if (hasStoredKeystore()) {
          // User has a stored keystore but needs to unlock it
          // Don't auto-connect, let them unlock via modal
          setIsInitializing(false);
        } else {
          setIsInitializing(false);
        }
      } catch (error) {
        console.error('Error checking stored wallet:', error);
        setIsInitializing(false);
      }
    };

    checkStoredWallet();
  }, []);

  // Handle wallet connection (called from ConnectWalletModal after unlock/create)
  const handleConnect = useCallback(async (walletName: WalletProviderType) => {
    try {
      // The wallet is already set up by ConnectWalletModal
      // Just need to load from storage and restore
      const stored = loadKeystoreFromStorage();
      if (!stored) {
        console.error('No keystore found');
        return;
      }

      // Note: The password is not stored, so the modal handles unlocking
      // This is called after successful unlock
      setIsConnected(true);
      setIsConnectModalOpen(false);
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  }, []);

  // Set wallet instance (called from ConnectWalletModal after successful unlock)
  const setConnectedWallet = useCallback((walletInstance: AlkanesWalletInstance) => {
    setWallet(walletInstance);

    // Get addresses
    const nativeSegwitAddr = walletInstance.getReceivingAddress(0);
    const taprootAddr = walletInstance.deriveAddress('p2tr', 0, 0).address;

    setWalletAddresses({
      nativeSegwit: nativeSegwitAddr,
      taproot: taprootAddr,
      publicKey: '', // TODO: Get from wallet
    });

    setIsConnected(true);
    setIsConnectModalOpen(false);
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setWallet(null);
    setWalletAddresses(null);
    setIsConnected(false);
  }, []);

  // Build account structure
  const account: Account = useMemo(() => {
    const accountStructure: Account = {
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: NetworkMap[network],
    };

    if (walletAddresses) {
      if (walletAddresses.nativeSegwit) {
        accountStructure.nativeSegwit = {
          address: walletAddresses.nativeSegwit,
          pubkey: walletAddresses.publicKey,
          hdPath: "m/84'/0'/0'/0/0",
        };
      }

      if (walletAddresses.taproot) {
        accountStructure.taproot = {
          address: walletAddresses.taproot,
          pubkey: walletAddresses.publicKey,
          pubKeyXOnly: '',
          hdPath: "m/86'/0'/0'/0/0",
        };
      }
    }

    return accountStructure;
  }, [walletAddresses, network]);

  // UTXO functions
  const getUtxos = useCallback(async () => {
    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);
    const promises: Promise<any>[] = [];

    if (account.taproot) {
      promises.push(api.getAddressUtxos(account.taproot.address, account.spendStrategy));
    }

    if (account.nativeSegwit) {
      promises.push(api.getAddressUtxos(account.nativeSegwit.address, account.spendStrategy));
    }

    if (promises.length === 0) {
      return [];
    }

    const results = await Promise.all(promises);
    return results.flatMap(result => result.utxos || []);
  }, [network, account]);

  const getSpendableUtxos = useCallback(async () => {
    if (!account.nativeSegwit) return [];

    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);

    const { spendableUtxos } = await api.getAddressUtxos(
      account.nativeSegwit.address,
      account.spendStrategy
    );

    spendableUtxos?.sort((a: any, b: any) =>
      account.spendStrategy.utxoSortGreatestToLeast
        ? b.satoshis - a.satoshis
        : a.satoshis - b.satoshis
    );

    return spendableUtxos || [];
  }, [network, account]);

  const getSpendableTotalBalance = useCallback(async () => {
    if (!account.nativeSegwit) return 0;

    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);

    const { spendableTotalBalance } = await api.getAddressUtxos(
      account.nativeSegwit.address,
      account.spendStrategy
    );

    return spendableTotalBalance || 0;
  }, [network, account]);

  const onConnectModalOpenChange = useCallback((isOpen: boolean) => {
    setIsConnectModalOpen(isOpen);
  }, []);

  // PSBT signing - takes hex, returns base64 and hex
  const signPsbt = useCallback(async (psbtHex: string): Promise<SignPsbtResponse | null> => {
    if (!wallet) {
      console.error('No wallet available for signing');
      return null;
    }

    try {
      // Convert hex to base64 for signing
      const psbtBase64 = Buffer.from(psbtHex, 'hex').toString('base64');

      // Sign the PSBT (returns base64)
      const signedPsbtBase64 = wallet.signPsbt(psbtBase64);

      // Convert to hex as well
      const signedPsbtHex = Buffer.from(signedPsbtBase64, 'base64').toString('hex');

      return {
        signedPsbtBase64,
        signedPsbtHex,
      };
    } catch (error) {
      console.error('Error signing PSBT:', error);
      return null;
    }
  }, [wallet]);

  // Sign multiple PSBTs
  const signPsbts = useCallback(async (params: { psbts: string[] }): Promise<SignPsbtsResponse | null> => {
    if (!wallet) {
      console.error('No wallet available for signing');
      return null;
    }

    try {
      const signedPsbts: SignPsbtResponse[] = [];

      for (const psbtHex of params.psbts) {
        const result = await signPsbt(psbtHex);
        if (!result) {
          throw new Error('Failed to sign PSBT');
        }
        signedPsbts.push(result);
      }

      return { signedPsbts };
    } catch (error) {
      console.error('Error signing PSBTs:', error);
      return null;
    }
  }, [wallet, signPsbt]);

  // Context value
  const contextValue = useMemo<WalletContextType>(
    () => ({
      isConnectModalOpen,
      onConnectModalOpenChange,
      isConnected,
      isInitializing,
      address: walletAddresses?.taproot || walletAddresses?.nativeSegwit || '',
      paymentAddress: walletAddresses?.nativeSegwit || '',
      publicKey: walletAddresses?.publicKey || '',
      provider: isConnected ? 'AlkanesWallet' : null,
      finalizeConnect: handleConnect,
      disconnect,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      signPsbt,
      signPsbts,
      account,
      network,
      wallet,
    }),
    [
      isConnectModalOpen,
      onConnectModalOpenChange,
      isConnected,
      isInitializing,
      walletAddresses,
      handleConnect,
      disconnect,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      signPsbt,
      signPsbts,
      account,
      network,
      wallet,
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

// Export for ConnectWalletModal to use
export { WalletContext };
