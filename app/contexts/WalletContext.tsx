'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  useLaserEyes,
  type LaserEyesContextType,
  type ProviderType,
} from '@omnisat/lasereyes-react';
import { type Account, getAddressType, AddressType, type utxo } from '@oyl/sdk';
import type { Network } from '../utils/constants';
import { NetworkMap } from '../utils/constants';
import { getApiProvider } from '../utils/oylProvider';
import { Loader2 } from 'lucide-react';

type WalletContextType = {
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  address: string;
  publicKey: string;
  paymentAddress: string;
  finalizeConnect: (walletName: ProviderType) => Promise<void>;
  disconnect: () => Promise<void>;
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
  const laser = useLaserEyes();
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  const network: Network = (process.env.NEXT_PUBLIC_NETWORK as Network) || 'mainnet';

  const finalizeConnect = async (walletName: ProviderType) => {
    try {
      if (laser.provider === walletName) {
        await (laser as any).disconnect();
      } else {
        setIsConnectModalOpen(false);
        await (laser as any).connect(walletName);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  // @ts-ignore
  const account: Account = (() => {
    const mainAddr = (laser as any).address || '';
    const payAddr = (laser as any).paymentAddress || '';

    let addressType: AddressType | undefined = undefined;
    let paymentAddressType: AddressType | undefined = undefined;
    try { addressType = mainAddr ? (getAddressType(mainAddr) || undefined) : undefined; } catch {}
    try { paymentAddressType = payAddr ? (getAddressType(payAddr) || undefined) : undefined; } catch {}

    let taprootAddress: string | undefined;
    let taprootPubkey: string | undefined;
    let nativeSegwitAddress: string | undefined;
    let nativeSegwitPubkey: string | undefined;

    if (addressType === AddressType.P2TR) {
      taprootAddress = (laser as any).address;
      taprootPubkey = (laser as any).publicKey;
    } else if (paymentAddressType === AddressType.P2TR) {
      taprootAddress = (laser as any).paymentAddress;
      taprootPubkey = (laser as any).paymentPublicKey as any;
    }

    if (addressType === AddressType.P2WPKH) {
      nativeSegwitAddress = (laser as any).address;
      nativeSegwitPubkey = (laser as any).publicKey;
    } else if (paymentAddressType === AddressType.P2WPKH) {
      nativeSegwitAddress = (laser as any).paymentAddress;
      nativeSegwitPubkey = (laser as any).paymentPublicKey as any;
    }

    const accountStructure: any = {
      spendStrategy: {
        addressOrder: ['nativeSegwit', 'taproot'],
        utxoSortGreatestToLeast: true,
        changeAddress: 'nativeSegwit',
      },
      network: NetworkMap[network],
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

    if (!taprootAddress && !nativeSegwitAddress && (laser as any).address) {
      accountStructure.nativeSegwit = {
        address: (laser as any).address,
        pubkey: (laser as any).publicKey,
        hdPath: '',
      };
    }

    const availableTypes: string[] = [];
    if (accountStructure.nativeSegwit) availableTypes.push('nativeSegwit');
    if (accountStructure.taproot) availableTypes.push('taproot');
    if (availableTypes.length > 0) {
      accountStructure.spendStrategy.addressOrder = availableTypes;
      accountStructure.spendStrategy.changeAddress = availableTypes[0];
    }

    return accountStructure;
  })();

  const getUtxos = async (): Promise<utxo.FormattedUtxo[]> => {
    const api = getApiProvider(network);
    const promises: Promise<any>[] = [];

    if ((account as any).taproot) {
      promises.push(api.getAddressUtxos((account as any).taproot.address, account.spendStrategy));
    }
    if ((account as any).nativeSegwit) {
      promises.push(
        api.getAddressUtxos((account as any).nativeSegwit.address, account.spendStrategy),
      );
    }
    if (promises.length === 0) return [];
    const results = await Promise.all(promises);
    return results.flatMap((r) => r.utxos) as utxo.FormattedUtxo[];
  };

  const getSpendableUtxos = async (): Promise<utxo.FormattedUtxo[]> => {
    const api = getApiProvider(network);
    const { spendableUtxos } = await api.getAddressUtxos((laser as any).paymentAddress, account.spendStrategy);
    spendableUtxos.sort((a: any, b: any) =>
      account.spendStrategy.utxoSortGreatestToLeast ? b.satoshis - a.satoshis : a.satoshis - b.satoshis,
    );
    return spendableUtxos as utxo.FormattedUtxo[];
  };

  const getSpendableTotalBalance = async (): Promise<number> => {
    const api = getApiProvider(network);
    const { spendableTotalBalance } = await api.getAddressUtxos(
      (laser as any).paymentAddress,
      account.spendStrategy,
    );
    return spendableTotalBalance;
  };

  if ((laser as any).isInitializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 size={32} color="#449CFF" className="animate-spin" />
      </div>
    );
  }

  return (
    <WalletContext.Provider
      value={{
        ...(laser as any),
        isConnectModalOpen,
        getUtxos,
        getSpendableUtxos,
        getSpendableTotalBalance,
        account,
        network,
        onConnectModalOpenChange: (isOpen) => setIsConnectModalOpen(isOpen),
        finalizeConnect,
        isConnected: (laser as any).connected,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

