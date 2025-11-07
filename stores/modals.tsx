import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

export type ModalStoreShape = {
  isConnectWalletOpen: boolean;
  setConnectWalletOpen: (open: boolean) => void;
  openConnectWallet: () => void;
  closeConnectWallet: () => void;
  isTxSettingsOpen: boolean;
  setTxSettingsOpen: (open: boolean) => void;
  openTxSettings: () => void;
  closeTxSettings: () => void;
  isTokenSelectorOpen: boolean;
  tokenSelectorMode: 'from' | 'to' | 'lp0' | 'lp1' | null;
  setTokenSelectorOpen: (open: boolean, mode?: 'from' | 'to' | 'lp0' | 'lp1') => void;
  openTokenSelector: (mode: 'from' | 'to' | 'lp0' | 'lp1') => void;
  closeTokenSelector: () => void;
};

const ModalContext = createContext<ModalStoreShape>({
  isConnectWalletOpen: false,
  setConnectWalletOpen: () => {},
  openConnectWallet: () => {},
  closeConnectWallet: () => {},
  isTxSettingsOpen: false,
  setTxSettingsOpen: () => {},
  openTxSettings: () => {},
  closeTxSettings: () => {},
  isTokenSelectorOpen: false,
  tokenSelectorMode: null,
  setTokenSelectorOpen: () => {},
  openTokenSelector: () => {},
  closeTokenSelector: () => {},
});

export function ModalStore(props: { children: ReactNode }) {
  const [isConnectWalletOpen, setIsConnectWalletOpen] = useState(false);
  const [isTxSettingsOpen, setIsTxSettingsOpen] = useState(false);
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false);
  const [tokenSelectorMode, setTokenSelectorMode] = useState<'from' | 'to' | 'lp0' | 'lp1' | null>(null);

  const setConnectWalletOpen = (open: boolean) => setIsConnectWalletOpen(open);
  const openConnectWallet = () => setIsConnectWalletOpen(true);
  const closeConnectWallet = () => setIsConnectWalletOpen(false);
  const setTxSettingsOpen = (open: boolean) => setIsTxSettingsOpen(open);
  const openTxSettings = () => setIsTxSettingsOpen(true);
  const closeTxSettings = () => setIsTxSettingsOpen(false);
  const setTokenSelectorOpen = (open: boolean, mode?: 'from' | 'to' | 'lp0' | 'lp1') => {
    setIsTokenSelectorOpen(open);
    if (mode) setTokenSelectorMode(mode);
    if (!open) setTokenSelectorMode(null);
  };
  const openTokenSelector = (mode: 'from' | 'to' | 'lp0' | 'lp1') => {
    setTokenSelectorMode(mode);
    setIsTokenSelectorOpen(true);
  };
  const closeTokenSelector = () => {
    setIsTokenSelectorOpen(false);
    setTokenSelectorMode(null);
  };

  return (
    <ModalContext.Provider
      value={{
        isConnectWalletOpen,
        setConnectWalletOpen,
        openConnectWallet,
        closeConnectWallet,
        isTxSettingsOpen,
        setTxSettingsOpen,
        openTxSettings,
        closeTxSettings,
        isTokenSelectorOpen,
        tokenSelectorMode,
        setTokenSelectorOpen,
        openTokenSelector,
        closeTokenSelector,
      }}
    >
      {props.children}
    </ModalContext.Provider>
  );
}

export function useModalStore() {
  return useContext(ModalContext);
}


