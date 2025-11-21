'use client';

import {
  useLaserEyes,
  type LaserEyesContextType,
  type ProviderType,
} from '@omnisat/lasereyes-react';
import { type Account, getAddressType, AddressType } from '@oyl/sdk';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';

import { NetworkMap } from '@/utils/constants';
import type { Network, utxo } from '@oyl/sdk';

import { getApiProvider } from '@/utils/oylProvider';
import { Loader2 } from 'lucide-react';

type WalletContextType = {
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  address: string;
  publicKey: string;
  finalizeConnect: (walletName: ProviderType) => void;
  disconnect: () => void;
  getUtxos: () => Promise<utxo.FormattedUtxo[]>;
  getSpendableUtxos: () => Promise<utxo.FormattedUtxo[]>;
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

  const handleConnect = async (walletName: ProviderType) => {
    try {
      if (laserEyesContext.provider === walletName) {
        laserEyesContext.disconnect();
      } else {
        setIsConnectModalOpen(false);
        await laserEyesContext.switchNetwork(laserEyesContext.network);
        await laserEyesContext.connect(walletName);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  // @ts-ignore
  const account: Account = useMemo(() => {
    // Detect address types independently for both addresses
    const addressType = getAddressType(laserEyesContext.address);
    const paymentAddressType = getAddressType(laserEyesContext.paymentAddress);

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
    } else {
      taprootAddress = undefined;
      taprootPubkey = undefined;
    }

    if (addressType === AddressType.P2WPKH) {
      nativeSegwitAddress = laserEyesContext.address;
      nativeSegwitPubkey = laserEyesContext.publicKey;
    } else if (paymentAddressType === AddressType.P2WPKH) {
      nativeSegwitAddress = laserEyesContext.paymentAddress;
      nativeSegwitPubkey = laserEyesContext.paymentPublicKey;
    } else {
      nativeSegwitAddress = undefined;
      nativeSegwitPubkey = undefined;
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

  const getUtxos = async () => {
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
  };

  const getSpendableUtxos = async () => {
    const api = getApiProvider(network);

    const {spendableUtxos} = await api.getAddressUtxos(laserEyesContext.paymentAddress, account.spendStrategy)
    
    spendableUtxos.sort((a: any, b: any) =>
      account.spendStrategy.utxoSortGreatestToLeast
        ? b.satoshis - a.satoshis
        : a.satoshis - b.satoshis
    )

    return spendableUtxos;
  };

  const getSpendableTotalBalance = async () => {
    const api = getApiProvider(network);

    const {spendableTotalBalance} = await api.getAddressUtxos(laserEyesContext.paymentAddress, account.spendStrategy)

    return spendableTotalBalance;
  };

  if (laserEyesContext.isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 size={32} color="#449CFF" className="animate-spin" />
      </div>
    );
  }

  return (
    <WalletContext.Provider
      value={{
        ...laserEyesContext,
        isConnectModalOpen,
        getUtxos,
        getSpendableUtxos,
        getSpendableTotalBalance,
        account,
        network,
        onConnectModalOpenChange: (isOpen) => setIsConnectModalOpen(isOpen),
        finalizeConnect: handleConnect,
        isConnected: laserEyesContext.connected,
      }}
    >
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


