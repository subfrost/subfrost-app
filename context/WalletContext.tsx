'use client';

import {
  useLaserEyes,
  type LaserEyesContextType,
  type ProviderType,
} from '@omnisat/lasereyes-react';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState, useCallback } from 'react';

import { NetworkMap } from '@/utils/constants';
import { Loader2 } from 'lucide-react';

// Types only - no runtime import of @oyl/sdk
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet';
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

// AddressType enum values - avoid importing from @oyl/sdk
const AddressType = {
  P2TR: 'p2tr',
  P2WPKH: 'p2wpkh',
} as const;

// Simple address type detection without importing @oyl/sdk
function detectAddressType(address: string): string | undefined {
  if (!address) return undefined;
  // Taproot addresses start with bc1p (mainnet) or tb1p (testnet/signet)
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return AddressType.P2TR;
  }
  // Native SegWit addresses start with bc1q (mainnet) or tb1q (testnet/signet)
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    return AddressType.P2WPKH;
  }
  return undefined;
}

type WalletContextType = {
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  address: string;
  publicKey: string;
  finalizeConnect: (walletName: ProviderType) => void;
  disconnect: () => void;
  getUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableUtxos: () => Promise<FormattedUtxo[]>;
  getSpendableTotalBalance: () => Promise<number>;
  account: Account;
  network: Network;
};

const WalletContext = createContext<
  (WalletContextType & Omit<LaserEyesContextType, 'connect' | 'network'>) | null
>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const laserEyesContext = useLaserEyes();
  const network = laserEyesContext.network as Network;

  const handleConnect = useCallback(async (walletName: ProviderType) => {
    try {
      if (laserEyesContext.provider === walletName) {
        laserEyesContext.disconnect();
      } else {
        setIsConnectModalOpen(false);
        // Only call connect - switchNetwork is not needed when connecting
        // since the network is already configured in LaserEyesProvider
        await laserEyesContext.connect(walletName);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  }, [laserEyesContext]);

  // @ts-ignore
  const account: Account = useMemo(() => {
    // Detect address types independently for both addresses
    const addressType = detectAddressType(laserEyesContext.address);
    const paymentAddressType = detectAddressType(laserEyesContext.paymentAddress);

    // Determine which address is which type
    let taprootAddress: string | undefined;
    let taprootPubkey: string | undefined;
    let nativeSegwitAddress: string | undefined;
    let nativeSegwitPubkey: string | undefined;

    if (addressType === AddressType.P2TR) {
      taprootAddress = laserEyesContext.address;
      taprootPubkey = laserEyesContext.publicKey;
    } else if (paymentAddressType === AddressType.P2TR) {
      taprootAddress = laserEyesContext.paymentAddress;
      taprootPubkey = laserEyesContext.paymentPublicKey;
    }

    if (addressType === AddressType.P2WPKH) {
      nativeSegwitAddress = laserEyesContext.address;
      nativeSegwitPubkey = laserEyesContext.publicKey;
    } else if (paymentAddressType === AddressType.P2WPKH) {
      nativeSegwitAddress = laserEyesContext.paymentAddress;
      nativeSegwitPubkey = laserEyesContext.paymentPublicKey;
    }
    
    // Build account structure dynamically based on what's found
    const accountStructure: any = {
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: NetworkMap[laserEyesContext.network as Network],
    };
    
    // Add taproot if found in either address
    if (taprootAddress) {
      accountStructure.taproot = {
        address: taprootAddress,
        pubkey: taprootPubkey,
        pubKeyXOnly: '',
        hdPath: '',
      };
    }

    // Add native segwit if found in either address
    if (nativeSegwitAddress) {
      accountStructure.nativeSegwit = {
        address: nativeSegwitAddress,
        pubkey: nativeSegwitPubkey,
        hdPath: '',
      };
    }
    
    // Fallback: if no addresses were detected, use the main address as native segwit
    // This ensures we always have at least one address available
    if (!taprootAddress && !nativeSegwitAddress) {
      console.warn('No supported address types detected, using main address as native segwit fallback');
      accountStructure.nativeSegwit = {
        address: laserEyesContext.address,
        pubkey: laserEyesContext.publicKey,
        hdPath: '',
      };
    }
    
    // Set spend strategy based on available address types
    const availableTypes: string[] = [];
    if (accountStructure.nativeSegwit) availableTypes.push('nativeSegwit');
    if (accountStructure.taproot) availableTypes.push('taproot');
    
    if (availableTypes.length > 0) {
      accountStructure.spendStrategy.addressOrder = availableTypes;
      // Set change address to the first available type (usually nativeSegwit if available)
      accountStructure.spendStrategy.changeAddress = availableTypes[0];
    } else {
      throw new Error('No valid addresses found in wallet');
    }
    
    return accountStructure;
  }, [
    laserEyesContext.address,
    laserEyesContext.paymentAddress,
    laserEyesContext.publicKey,
    laserEyesContext.paymentPublicKey,
    laserEyesContext.network,
  ]);

  const getUtxos = useCallback(async () => {
    // Lazy import to avoid loading @oyl/sdk on initial page load
    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);
    const promises: Promise<any>[] = [];

    // Fetch UTXOs from taproot address if it exists
    if (account.taproot) {
      promises.push(api.getAddressUtxos(account.taproot.address, account.spendStrategy));
    }

    // Fetch UTXOs from native segwit address if it exists
    if (account.nativeSegwit) {
      promises.push(api.getAddressUtxos(account.nativeSegwit.address, account.spendStrategy));
    }

    // If no addresses found, return empty array
    if (promises.length === 0) {
      return [];
    }

    const results = await Promise.all(promises);
    return results.flatMap(result => result.utxos);
  }, [network, account]);

  const getSpendableUtxos = useCallback(async () => {
    // Lazy import to avoid loading @oyl/sdk on initial page load
    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);

    const {spendableUtxos} = await api.getAddressUtxos(laserEyesContext.paymentAddress, account.spendStrategy)

    spendableUtxos.sort((a: any, b: any) =>
      account.spendStrategy.utxoSortGreatestToLeast
        ? b.satoshis - a.satoshis
        : a.satoshis - b.satoshis
    )

    return spendableUtxos;
  }, [network, account, laserEyesContext.paymentAddress]);

  const getSpendableTotalBalance = useCallback(async () => {
    // Lazy import to avoid loading @oyl/sdk on initial page load
    const { getApiProvider } = await import('@/utils/oylProvider');
    const api = getApiProvider(network);

    const {spendableTotalBalance} = await api.getAddressUtxos(laserEyesContext.paymentAddress, account.spendStrategy)

    return spendableTotalBalance;
  }, [network, account, laserEyesContext.paymentAddress]);

  const onConnectModalOpenChange = useCallback((isOpen: boolean) => {
    setIsConnectModalOpen(isOpen);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      ...laserEyesContext,
      isConnectModalOpen,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      account,
      network,
      onConnectModalOpenChange,
      finalizeConnect: handleConnect,
      isConnected: laserEyesContext.connected,
    }),
    [
      laserEyesContext,
      isConnectModalOpen,
      getUtxos,
      getSpendableUtxos,
      getSpendableTotalBalance,
      account,
      network,
      onConnectModalOpenChange,
      handleConnect,
    ]
  );

  if (laserEyesContext.isInitializing) {
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


