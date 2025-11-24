// hooks/useAlkanesWallet.ts
// This hook provides functionality to interact with the Alkanes Wallet from the @alkanes/ts-sdk.

import { useState, useEffect, useCallback } from 'react';
import { createKeystore, unlockKeystore, KeystoreManager } from '../ts-sdk/src/keystore';
import { AlkanesWallet, createWallet, AddressType } from '../ts-sdk/src/wallet';
import type { NetworkType, Keystore, EncryptedKeystore } from '../ts-sdk/src/types';

interface WalletState {
  wallet: AlkanesWallet | null;
  address: string | null;
  loading: boolean;
  error: string | null;
  keystoreJson: string | null; // Store encrypted keystore as string
  mnemonic: string | null;
}

export function useAlkanesWallet(password: string, initialMnemonic?: string, network: NetworkType = 'regtest') {
  const [walletState, setWalletState] = useState<WalletState>({
    wallet: null,
    address: null,
    loading: true,
    error: null,
    keystoreJson: null,
    mnemonic: null,
  });

  const initializeWallet = useCallback(async () => {
    setWalletState(prev => ({ ...prev, loading: true, error: null }));
    try {
      let walletKeystore: Keystore;
      let encryptedKeystoreString: string; // Will store the JSON string
      let usedMnemonic: string;
      const manager = new KeystoreManager(); // Instantiate KeystoreManager for direct calls

      if (initialMnemonic) {
        // If mnemonic is provided, create a keystore from it using KeystoreManager's method
        const keystoreObject = manager.createKeystore(initialMnemonic, { network }); // Returns Keystore
        usedMnemonic = initialMnemonic; // Mnemonic is provided directly
        const exported = await manager.exportKeystore(keystoreObject, password, { format: 'string' }); // Ensure string format
        encryptedKeystoreString = exported as string;
        walletKeystore = keystoreObject; // The keystoreObject is already decrypted
      } else {
        // If no mnemonic, create a new random one and its keystore using the convenience functions
        const { keystore, mnemonic } = await createKeystore(password, { network }); // createKeystore returns {keystore: string, mnemonic: string}
        walletKeystore = await unlockKeystore(keystore, password); // unlockKeystore returns Keystore object
        encryptedKeystoreString = keystore; // Assign the string directly
        usedMnemonic = mnemonic;
      }

      const wallet = createWallet(walletKeystore);
      const address = wallet.getReceivingAddress(0); // Get the first receiving address

      setWalletState({
        wallet,
        address,
        loading: false,
        error: null,
        keystoreJson: encryptedKeystoreString,
        mnemonic: usedMnemonic,
      });
    } catch (err: any) {
      console.error("Failed to initialize Alkanes wallet:", err);
      setWalletState(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to initialize Alkanes wallet',
      }));
    }
  }, [password, initialMnemonic, network]);

  useEffect(() => {
    initializeWallet();
  }, [initializeWallet]);

  const getAddress = useCallback((index: number = 0, type: AddressType = AddressType.P2WPKH) => {
    if (!walletState.wallet) {
      throw new Error("Wallet not initialized.");
    }
    return walletState.wallet.deriveAddress(type, index);
  }, [walletState.wallet]);

  const signMessage = useCallback(async (message: string, index: number = 0) => {
    if (!walletState.wallet) {
      throw new Error("Wallet not initialized.");
    }
    return walletState.wallet.signMessage(message, index);
  }, [walletState.wallet]);

  // Expose other wallet functionalities as needed
  // For example:
  // const createPsbt = useCallback(async (options: PsbtOptions) => { ... }, [walletState.wallet]);
  // const signPsbt = useCallback(async (psbtBase64: string) => { ... }, [walletState.wallet]);

  return { ...walletState, getAddress, signMessage };
}
