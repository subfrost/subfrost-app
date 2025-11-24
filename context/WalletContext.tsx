'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect } from 'react';

import { NetworkMap } from '@/utils/constants';

import { getApiProvider } from '@/utils/oylProvider';
import { Loader2 } from 'lucide-react';

import { Account, AddressType, UTXO } from '@/utils/types';
import { getAddressType } from '@/utils/wallet';
import type { NetworkType } from '@/ts-sdk/src/types';
import { createWallet, AlkanesWallet, AddressType as SdkAddressType } from '@/ts-sdk/src/wallet';
import { unlockKeystore } from '@/ts-sdk/src/keystore';

type WalletType = 'keystore' | 'browser';

type WalletContextType = {
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  address: string | null;
  addresses: {
    p2wpkh?: string;
    p2tr?: string;
  };
  publicKey: string | null;
  connectKeystore: (mnemonic: string, network: NetworkType, derivationPath?: string) => void;
  connectBrowserWallet: (walletId: string) => Promise<void>;
  disconnect: () => void;
  getUtxos: () => Promise<UTXO[]>;
  getSpendableUtxos: () => Promise<UTXO[]>;
  getSpendableTotalBalance: () => Promise<number>;
  account: Account | null;
  network: NetworkType;
  signPsbt: (psbt: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  provider: string;
  walletType: WalletType | null;
};

const WalletContext = createContext<
  (WalletContextType) | null
>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<{ p2wpkh?: string; p2tr?: string }>({});
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<NetworkType>('mainnet');
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [alkanesWallet, setAlkanesWallet] = useState<AlkanesWallet | null>(null);
  const [browserWalletProvider, setBrowserWalletProvider] = useState<any>(null);

  const connectKeystore = async (
    mnemonic: string,
    selectedNetwork: NetworkType,
    derivationPath?: string
  ) => {
    try {
      // Create wallet directly from mnemonic (no need for keystore encryption/decryption here)
      const { KeystoreManager } = await import('@/ts-sdk/src/keystore');
      const { createWallet } = await import('@/ts-sdk/src/wallet');
      
      const manager = new KeystoreManager();
      const keystore = manager.createKeystore(mnemonic, { 
        network: selectedNetwork,
        derivationPath 
      });

      const wallet = createWallet(keystore);
      setAlkanesWallet(wallet);
      
      const p2wpkhAddress = wallet.getReceivingAddress(0, SdkAddressType.P2WPKH);
      const p2trAddress = wallet.getReceivingAddress(0, SdkAddressType.P2TR);
      
      setAddresses({
        p2wpkh: p2wpkhAddress,
        p2tr: p2trAddress,
      });
      setAddress(p2wpkhAddress);
      
      const addressInfo = wallet.deriveAddress(SdkAddressType.P2WPKH, 0, 0);
      setPublicKey(addressInfo.publicKey);
      
      setNetwork(selectedNetwork);
      setWalletType('keystore');
      setIsConnected(true);
      
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error connecting keystore:', error);
      throw error;
    }
  };

  const connectBrowserWallet = async (walletId: string) => {
    try {
      let provider: any;
      let connectedAddress: string;
      let connectedPublicKey: string;

      switch (walletId) {
        case 'unisat':
          if (!(window as any).unisat) {
            throw new Error('Unisat wallet not detected');
          }
          provider = (window as any).unisat;
          const unisatAccounts = await provider.requestAccounts();
          connectedAddress = unisatAccounts[0];
          connectedPublicKey = await provider.getPublicKey();
          setAddresses({ p2tr: connectedAddress });
          break;

        case 'xverse':
          if (!(window as any).XverseProviders) {
            throw new Error('Xverse wallet not detected');
          }
          provider = (window as any).XverseProviders;
          throw new Error('Xverse integration not yet implemented');

        case 'phantom':
          if (!(window as any).phantom?.bitcoin) {
            throw new Error('Phantom wallet not detected');
          }
          provider = (window as any).phantom.bitcoin;
          throw new Error('Phantom integration not yet implemented');

        case 'okx':
          if (!(window as any).okxwallet) {
            throw new Error('OKX wallet not detected');
          }
          provider = (window as any).okxwallet;
          throw new Error('OKX integration not yet implemented');

        default:
          throw new Error(`Unknown wallet: ${walletId}`);
      }

      setBrowserWalletProvider(provider);
      setAddress(connectedAddress);
      setPublicKey(connectedPublicKey);
      setWalletType('browser');
      setIsConnected(true);
      
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error(`Error connecting ${walletId}:`, error);
      throw error;
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

  const signPsbt = async (psbt: string): Promise<string> => {
    if (walletType === 'keystore' && alkanesWallet) {
      return alkanesWallet.signPsbt(psbt);
    } else if (walletType === 'browser' && browserWalletProvider) {
      if (browserWalletProvider.signPsbt) {
        return await browserWalletProvider.signPsbt(psbt);
      }
      throw new Error('Browser wallet does not support signPsbt');
    }
    throw new Error('No wallet connected');
  };

  const signMessage = async (message: string): Promise<string> => {
    if (walletType === 'keystore' && alkanesWallet) {
      return alkanesWallet.signMessage(message, 0);
    } else if (walletType === 'browser' && browserWalletProvider) {
      if (browserWalletProvider.signMessage) {
        return await browserWalletProvider.signMessage(message);
      }
      throw new Error('Browser wallet does not support signMessage');
    }
    throw new Error('No wallet connected');
  };

  const disconnect = () => {
    setIsConnected(false);
    setAddress(null);
    setAddresses({});
    setPublicKey(null);
    setWalletType(null);
    setAlkanesWallet(null);
    setBrowserWalletProvider(null);
  };

  return (
    <WalletContext.Provider
      value={{
        isConnectModalOpen,
        getUtxos,
        getSpendableUtxos,
        getSpendableTotalBalance,
        address,
        addresses,
        publicKey,
        account,
        network,
        walletType,
        onConnectModalOpenChange: (isOpen) => setIsConnectModalOpen(isOpen),
        connectKeystore,
        connectBrowserWallet,
        isConnected,
        signPsbt,
        signMessage,
        provider: walletType === 'keystore' ? 'Alkanes Keystore' : walletType === 'browser' ? 'Browser Wallet' : 'None',
        disconnect,
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
