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
});

export function ModalStore(props: { children: ReactNode }) {
  const [isConnectWalletOpen, setIsConnectWalletOpen] = useState(false);
  const [isTxSettingsOpen, setIsTxSettingsOpen] = useState(false);

  const setConnectWalletOpen = (open: boolean) => setIsConnectWalletOpen(open);
  const openConnectWallet = () => setIsConnectWalletOpen(true);
  const closeConnectWallet = () => setIsConnectWalletOpen(false);
  const setTxSettingsOpen = (open: boolean) => setIsTxSettingsOpen(open);
  const openTxSettings = () => setIsTxSettingsOpen(true);
  const closeTxSettings = () => setIsTxSettingsOpen(false);

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
      }}
    >
      {props.children}
    </ModalContext.Provider>
  );
}

export function useModalStore() {
  return useContext(ModalContext);
}


