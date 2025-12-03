'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';

import { Loader2 } from 'lucide-react';
import type { AlkanesWalletInstance } from '@/lib/oyl/alkanes/wallet-integration';

// Types
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest';
type Account = {
  taproot?: { address: string; pubkey: string; pubKeyXOnly: string; hdPath: string };
  nativeSegwit?: { address: string; pubkey: string; hdPath: string };
  spendStrategy: { addressOrder: string[]; utxoSortGreatestToLeast: boolean; changeAddress: string };
  network: any;
};

// FormattedUtxo type for UTXO handling
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

// Storage keys for wallet state
const ALKANES_WALLET_KEY = 'alkanes_wallet_connected';
const ALKANES_ADDRESS_KEY = 'alkanes_wallet_address';
const ALKANES_TAPROOT_KEY = 'alkanes_wallet_taproot';
const ALKANES_PUBKEY_KEY = 'alkanes_wallet_pubkey';

type WalletContextType = {
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  address: string;
  paymentAddress: string;
  publicKey: string;
  connect: () => void;
  disconnect: () => void;
  finalizeConnect: (walletType: string) => void;
  connectWithAddress: (address: string, taprootAddress: string, publicKey?: string) => void;
  getUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableTotalBalance: () => Promise<number>;
  signPsbt: (psbtBase64: string) => Promise<string>;
  signPsbts: (psbtsBase64: string[]) => Promise<string[]>;
  account: Account;
  network: Network;
  wallet: AlkanesWalletInstance | null;
  setWallet: (wallet: AlkanesWalletInstance | null) => void;
  isInitializing: boolean;
};

const WalletContext = createContext<WalletContextType | null>(null);

// Get network from environment or detect from URL
function detectNetwork(): Network {
  if (typeof window === 'undefined') return 'mainnet';

  // Check environment variable first
  if (process.env.NEXT_PUBLIC_NETWORK) {
    return process.env.NEXT_PUBLIC_NETWORK as Network;
  }

  const host = window.location.host;
  if (host.startsWith('signet.') || host.startsWith('staging-signet.')) {
    return 'signet';
  } else if (host.startsWith('oylnet.') || host.startsWith('staging-oylnet.')) {
    return 'oylnet';
  } else if (host.includes('localhost') || host.includes('regtest')) {
    return 'regtest';
  }
  return 'mainnet';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [taprootAddress, setTaprootAddress] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [wallet, setWallet] = useState<AlkanesWalletInstance | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const network = useMemo(() => detectNetwork(), []);

  // Load wallet state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsInitializing(false);
      return;
    }

    const connected = localStorage.getItem(ALKANES_WALLET_KEY) === 'true';
    const storedAddress = localStorage.getItem(ALKANES_ADDRESS_KEY) || '';
    const storedTaproot = localStorage.getItem(ALKANES_TAPROOT_KEY) || '';
    const storedPubkey = localStorage.getItem(ALKANES_PUBKEY_KEY) || '';

    if (connected && storedAddress) {
      setIsConnected(true);
      setAddress(storedAddress);
      setTaprootAddress(storedTaproot);
      setPublicKey(storedPubkey);
    }

    setIsInitializing(false);
  }, []);

  const connect = useCallback(() => {
    setIsConnectModalOpen(true);
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress('');
    setTaprootAddress('');
    setPublicKey('');
    setWallet(null);
    localStorage.removeItem(ALKANES_WALLET_KEY);
    localStorage.removeItem(ALKANES_ADDRESS_KEY);
    localStorage.removeItem(ALKANES_TAPROOT_KEY);
    localStorage.removeItem(ALKANES_PUBKEY_KEY);
  }, []);

  const connectWithAddress = useCallback((addr: string, taproot: string, pubkey: string = '') => {
    setIsConnected(true);
    setAddress(addr);
    setTaprootAddress(taproot);
    setPublicKey(pubkey);
    localStorage.setItem(ALKANES_WALLET_KEY, 'true');
    localStorage.setItem(ALKANES_ADDRESS_KEY, addr);
    localStorage.setItem(ALKANES_TAPROOT_KEY, taproot);
    localStorage.setItem(ALKANES_PUBKEY_KEY, pubkey);
    setIsConnectModalOpen(false);
  }, []);

  const finalizeConnect = useCallback((walletType: string) => {
    // For AlkanesWallet, the actual connection is done through connectWithAddress
    // This is called after the wallet is unlocked/created
    if (walletType === 'AlkanesWallet') {
      // The ConnectWalletModal will call connectWithAddress with the actual addresses
      setIsConnectModalOpen(false);
    }
  }, []);

  const onConnectModalOpenChange = useCallback((isOpen: boolean) => {
    setIsConnectModalOpen(isOpen);
  }, []);

  // Build account structure from addresses
  const account: Account = useMemo(() => {
    const accountStructure: Account = {
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: network,
    };

    if (address) {
      accountStructure.nativeSegwit = {
        address: address,
        pubkey: publicKey,
        hdPath: "m/84'/0'/0'/0/0",
      };
    }

    if (taprootAddress) {
      accountStructure.taproot = {
        address: taprootAddress,
        pubkey: publicKey,
        pubKeyXOnly: '',
        hdPath: "m/86'/0'/0'/0/0",
      };
    }

    return accountStructure;
  }, [address, taprootAddress, publicKey, network]);

  const getUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    if (!address && !taprootAddress) return [];

    try {
      const { getApiProvider } = await import('@/utils/oylProvider');
      const api = getApiProvider(network as any);
      const promises: Promise<any>[] = [];

      if (account.nativeSegwit) {
        promises.push(api.getAddressUtxos(account.nativeSegwit.address, account.spendStrategy));
      }

      if (account.taproot) {
        promises.push(api.getAddressUtxos(account.taproot.address, account.spendStrategy));
      }

      if (promises.length === 0) return [];

      const results = await Promise.all(promises);
      return results.flatMap(result => result.utxos || []);
    } catch (error) {
      console.error('Error fetching UTXOs:', error);
      return [];
    }
  }, [network, account, address, taprootAddress]);

  const getSpendableUtxos = useCallback(async (): Promise<FormattedUtxo[]> => {
    if (!address) return [];

    try {
      const { getApiProvider } = await import('@/utils/oylProvider');
      const api = getApiProvider(network as any);
      const { spendableUtxos } = await api.getAddressUtxos(address, account.spendStrategy);

      spendableUtxos.sort((a: any, b: any) =>
        account.spendStrategy.utxoSortGreatestToLeast
          ? b.satoshis - a.satoshis
          : a.satoshis - b.satoshis
      );

      return spendableUtxos;
    } catch (error) {
      console.error('Error fetching spendable UTXOs:', error);
      return [];
    }
  }, [network, account, address]);

  const getSpendableTotalBalance = useCallback(async (): Promise<number> => {
    if (!address) return 0;

    try {
      const { getApiProvider } = await import('@/utils/oylProvider');
      const api = getApiProvider(network as any);
      const { spendableTotalBalance } = await api.getAddressUtxos(address, account.spendStrategy);
      return spendableTotalBalance;
    } catch (error) {
      console.error('Error fetching balance:', error);
      return 0;
    }
  }, [network, account, address]);

  const signPsbt = useCallback(async (psbtBase64: string): Promise<string> => {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    return wallet.signPsbt(psbtBase64);
  }, [wallet]);

  const signPsbts = useCallback(async (psbtsBase64: string[]): Promise<string[]> => {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }
    return psbtsBase64.map(psbt => wallet.signPsbt(psbt));
  }, [wallet]);

  const contextValue = useMemo<WalletContextType>(
    () => ({
      isConnectModalOpen,
      onConnectModalOpenChange,
      isConnected,
      address: taprootAddress || address, // Primary address (prefer taproot for display)
      paymentAddress: address, // P2WPKH address for payments
      publicKey,
      connect,
      disconnect,
      finalizeConnect,
      connectWithAddress,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      signPsbt,
      signPsbts,
      account,
      network,
      wallet,
      setWallet,
      isInitializing,
    }),
    [
      isConnectModalOpen,
      onConnectModalOpenChange,
      isConnected,
      address,
      taprootAddress,
      publicKey,
      connect,
      disconnect,
      finalizeConnect,
      connectWithAddress,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      signPsbt,
      signPsbts,
      account,
      network,
      wallet,
      isInitializing,
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
