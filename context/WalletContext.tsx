'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

import { NetworkMap } from '@/utils/constants';

import { getApiProvider } from '@/utils/oylProvider';
import { Loader2 } from 'lucide-react';

import { Account, AddressType, NetworkType, UTXO } from '@/utils/types';
import { getAddressType } from '@/utils/wallet';

type WalletContextType = {
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  address: string | null;
  publicKey: string | null;
  finalizeConnect: (walletName: string) => void;
  disconnect: () => void;
  getUtxos: () => Promise<UTXO[]>;
  getSpendableUtxos: () => Promise<UTXO[]>;
  getSpendableTotalBalance: () => Promise<number>;
  account: Account | null;
  network: NetworkType;
  signPsbt: (psbt: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  provider: string;
};

const WalletContext = createContext<
  (WalletContextType) | null
>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<NetworkType>('mainnet'); // Default network

  const handleConnect = async (walletName: string) => {
    try {
      setAddress('bc1qxxxxxxxxx'); // Mock address
      setPublicKey('02xxxxxxxx'); // Mock public key
      setIsConnected(true);
      setIsConnectModalOpen(false);
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  const account: Account | null = (() => {
    if (!address || !publicKey) return null;

    const addressType = getAddressType(address);
    const paymentAddressType = getAddressType(address); // Assuming payment address is the same for now

    let taprootAddress: string | null | undefined;
    let taprootPubkey: string | null | undefined;
    let nativeSegwitAddress: string | null | undefined;
    let nativeSegwitPubkey: string | null | undefined;

    if (addressType === AddressType.P2TR) {
      taprootAddress = address;
      taprootPubkey = publicKey;
    } else if (paymentAddressType === AddressType.P2TR) {
      taprootAddress = address;
      taprootPubkey = publicKey;
    } else {
      taprootAddress = null;
      taprootPubkey = null;
    }

    if (addressType === AddressType.P2WPKH) {
      nativeSegwitAddress = address;
      nativeSegwitPubkey = publicKey;
    } else if (paymentAddressType === AddressType.P2WPKH) {
      nativeSegwitAddress = address;
      nativeSegwitPubkey = publicKey;
    } else {
      nativeSegwitAddress = null;
      nativeSegwitPubkey = null;
    }
    
    const accountStructure: Account = {
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: network, // network is already NetworkType
    };
    
    if (taprootAddress) {
      accountStructure.taproot = {
        address: taprootAddress,
        pubkey: taprootPubkey,
        pubKeyXOnly: '',
        hdPath: '',
      };
    }

    if (nativeSegwitAddress) {
      accountStructure.nativeSegwit = {
        address: nativeSegwitAddress,
        pubkey: nativeSegwitPubkey,
        hdPath: '',
      };
    }
    
    if (!taprootAddress && !nativeSegwitAddress) {
      console.warn('No supported address types detected, using main address as native segwit fallback');
      accountStructure.nativeSegwit = {
        address: address,
        pubkey: publicKey,
        hdPath: '',
      };
    }
    
    const availableTypes: string[] = [];
    if (accountStructure.nativeSegwit) availableTypes.push('nativeSegwit');
    if (accountStructure.taproot) availableTypes.push('taproot');
    
    if (availableTypes.length > 0) {
      accountStructure.spendStrategy.addressOrder = availableTypes;
      accountStructure.spendStrategy.changeAddress = availableTypes[0];
    } else {
      return {
        spendStrategy: {
          addressOrder: [],
          utxoSortGreatestToLeast: true,
          changeAddress: '',
        },
        network: 'mainnet',
      };
    }
    
    return accountStructure;
  })();

  const getUtxos = async () => {
    const api = getApiProvider(network);
    const promises: Promise<any>[] = [];
    
    if (account && account.taproot && account.taproot.address) {
      promises.push(api.getAddressUtxos(account.taproot.address, account.spendStrategy));
    }
    
    if (account && account.nativeSegwit && account.nativeSegwit.address) {
      promises.push(api.getAddressUtxos(account.nativeSegwit.address, account.spendStrategy));
    }
    
    if (promises.length === 0) {
      return [];
    }
    
    const results = await Promise.all(promises);
    return results.flatMap(result => result.utxos);
  };

  const getSpendableUtxos = async () => {
    const api = getApiProvider(network);

    if (!address || !account) return [];

    const {spendableUtxos} = await api.getAddressUtxos(address, account.spendStrategy);
    
    spendableUtxos.sort((a: any, b: any) =>
      account.spendStrategy.utxoSortGreatestToLeast
        ? b.satoshis - a.satoshis
        : a.satoshis - b.satoshis
    );

    return spendableUtxos;
  };

  const getSpendableTotalBalance = async () => {
    const api = getApiProvider(network);

    if (!address || !account) return 0;

    const {spendableTotalBalance} = await api.getAddressUtxos(address, account.spendStrategy);
  
    return spendableTotalBalance;
  };

  if (false) { // isInitializing removed for now
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 size={32} color="#449CFF" className="animate-spin" />
      </div>
    );
  }

  return (
    <WalletContext.Provider
      value={{
        isConnectModalOpen,
        getUtxos,
        getSpendableUtxos,
        getSpendableTotalBalance,
        address,
        publicKey,
        account,
        network,
        onConnectModalOpenChange: (isOpen) => setIsConnectModalOpen(isOpen),
        finalizeConnect: handleConnect,
        isConnected,
        signPsbt: async (psbt: string) => { console.log('Mock signPsbt', psbt); return 'mock_signed_psbt'; },
        signMessage: async (message: string) => { console.log('Mock signMessage', message); return 'mock_signed_message'; },
        provider: 'AlkanesWallet',
        disconnect: () => { setIsConnected(false); setAddress(null); setPublicKey(null); },
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
