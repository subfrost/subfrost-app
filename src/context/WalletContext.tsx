'use client';

import {
  useLaserEyes,
  type LaserEyesContextType,
  type ProviderType,
} from '@omnisat/lasereyes-react';
import { type Account, getAddressType, AddressType } from '@oyl/sdk';
import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect } from 'react';

import { NetworkMap } from '../utils/constants';
import type { Network, utxo } from '@oyl/sdk';

import { getApiProvider } from '../utils/oylProvider';
import { Loader2 } from 'lucide-react';

type WalletContextType = {
  isConnectModalOpen: boolean;
  onConnectModalOpenChange: (isOpen: boolean) => void;
  isConnected: boolean;
  address?: string;
  publicKey?: string;
  finalizeConnect: (walletName: ProviderType) => void;
  disconnect: () => void;
  getUtxos?: () => Promise<utxo.FormattedUtxo[]>;
  getSpendableUtxos?: () => Promise<utxo.FormattedUtxo[]>;
  getSpendableTotalBalance?: () => Promise<number>;
  account?: Account;
  network?: Network;
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
