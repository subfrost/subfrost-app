/**
 * React hook for Alkanes wallet integration
 * 
 * Provides access to Alkanes keystore functionality within React components
 */

import { useState, useCallback, useEffect } from 'react';
import type { NetworkType, AlkaneId } from '@alkanes/ts-sdk/types'; // Import AlkaneId and NetworkType from types submodule
import { 
  createKeystore, 
  unlockKeystore, 
  createWallet, 
  createWalletFromMnemonic,
  AlkanesWallet, // Import AlkanesWallet as a value
  AlkanesProvider, // Import AlkanesProvider as a value
} from '@alkanes/ts-sdk'; // Direct imports from the new SDK

// Temporary storage functions, to be moved to a dedicated storage utility
const LOCAL_STORAGE_KEY = 'alkanes_keystore';

const saveKeystoreToStorage = (keystore: string, network: NetworkType) => {
  localStorage.setItem(`${LOCAL_STORAGE_KEY}-${network}`, keystore);
};

const loadKeystoreFromStorage = (network: NetworkType) => {
  return localStorage.getItem(`${LOCAL_STORAGE_KEY}-${network}`);
};

const clearKeystoreFromStorage = (network: NetworkType) => {
  localStorage.removeItem(`${LOCAL_STORAGE_KEY}-${network}`);
};

const hasStoredKeystore = (network: NetworkType) => {
  return localStorage.getItem(`${LOCAL_STORAGE_KEY}-${network}`) !== null;
};


export type AlkanesWalletState = {
  wallet: AlkanesWallet | null;
  provider: AlkanesProvider | null;
  address: string | null;
  taprootAddress: string | null; // This might be handled differently in the new SDK
  isLoading: boolean;
  error: string | null;
  isUnlocked: boolean;
  hasKeystore: boolean;
};

export function useAlkanesWallet(network: NetworkType = 'mainnet') {
  const [state, setState] = useState<AlkanesWalletState>({
    wallet: null,
    provider: null,
    address: null,
    taprootAddress: null,
    isLoading: false,
    error: null,
    isUnlocked: false,
    hasKeystore: false,
  });

  // Check for stored keystore on mount
  useEffect(() => {
    const hasStored = hasStoredKeystore(network); // Pass network to storage functions
    setState((prev) => ({ ...prev, hasKeystore: hasStored }));
  }, [network]);

  /**
   * Create a new wallet
   */
  const createNewWallet = useCallback( // Renamed to avoid conflict with imported createWallet
    async (password: string, saveToStorage = true) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // createKeystore from @alkanes/ts-sdk now returns { keystore, mnemonic, wallet, provider }
        const { keystore, mnemonic, wallet: alkanesWallet, provider: alkanesProvider } = await createKeystore(password);
        const address = alkanesWallet.getReceivingAddress(0);
        const taprootAddress = alkanesWallet.getReceivingAddress(0, 'p2tr'); // Assuming p2tr is an option

        if (saveToStorage) {
          saveKeystoreToStorage(keystore, network);
        }

        setState({
          wallet: alkanesWallet,
          provider: alkanesProvider,
          address: address,
          taprootAddress: taprootAddress,
          isLoading: false,
          error: null,
          isUnlocked: true,
          hasKeystore: true,
        });

        return {
          mnemonic,
          keystore,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to create wallet';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [network]
  );

  /**
   * Restore wallet from keystore
   */
  const restoreWallet = useCallback(
    async (keystoreJson: string, password: string, saveToStorage = true) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // unlockKeystore from @alkanes/ts-sdk now returns { wallet, provider }
        const { wallet: alkanesWallet, provider: alkanesProvider } = await unlockKeystore(keystoreJson, password);
        const address = alkanesWallet.getReceivingAddress(0);
        const taprootAddress = alkanesWallet.getReceivingAddress(0, 'p2tr');

        if (saveToStorage) {
          saveKeystoreToStorage(keystoreJson, network);
        }

        setState({
          wallet: alkanesWallet,
          provider: alkanesProvider,
          address: address,
          taprootAddress: taprootAddress,
          isLoading: false,
          error: null,
          isUnlocked: true,
          hasKeystore: true,
        });

        return { wallet: alkanesWallet, provider: alkanesProvider, address, taprootAddress };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to restore wallet';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [network]
  );

  /**
   * Restore wallet from mnemonic phrase
   */
  const restoreFromMnemonicPhrase = useCallback(
    async (mnemonic: string, password: string, saveToStorage = true) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // createWalletFromMnemonic from @alkanes/ts-sdk now returns { keystore, wallet, provider }
        const { keystore, wallet: alkanesWallet, provider: alkanesProvider } = await createWalletFromMnemonic(mnemonic, password);
        const address = alkanesWallet.getReceivingAddress(0);
        const taprootAddress = alkanesWallet.getReceivingAddress(0, 'p2tr');

        if (saveToStorage) {
          saveKeystoreToStorage(keystore, network);
        }

        setState({
          wallet: alkanesWallet,
          provider: alkanesProvider,
          address: address,
          taprootAddress: taprootAddress,
          isLoading: false,
          error: null,
          isUnlocked: true,
          hasKeystore: true,
        });

        return { keystore, wallet: alkanesWallet, provider: alkanesProvider, address, taprootAddress };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to restore from mnemonic';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [network]
  );

  /**
   * Unlock stored keystore
   */
  const unlockStoredWallet = useCallback(
    async (password: string) => {
      const stored = loadKeystoreFromStorage(network); // Pass network to storage functions
      if (!stored) {
        throw new Error('No stored keystore found');
      }

      return restoreWallet(stored, password, false);
    },
    [restoreWallet, network]
  );

  /**
   * Lock wallet (clear from memory)
   */
  const lockWallet = useCallback(() => {
    setState((prev) => ({
      ...prev,
      wallet: null,
      provider: null,
      address: null,
      taprootAddress: null,
      isUnlocked: false,
    }));
  }, []);

  /**
   * Delete wallet from storage
   */
  const deleteWallet = useCallback(() => {
    clearKeystoreFromStorage(network); // Pass network to storage functions
    setState({
      wallet: null,
      provider: null,
      address: null,
      taprootAddress: null,
      isLoading: false,
      error: null,
      isUnlocked: false,
      hasKeystore: false,
    });
  }, [network]);

  /**
   * Sign a PSBT
   */
  const signTransactionPsbt = useCallback( // Renamed to avoid conflict with imported signPsbt
    async (psbtBase64: string) => {
      if (!state.wallet) {
        throw new Error('Wallet not unlocked');
      }
      return state.wallet.signPsbt(psbtBase64);
    },
    [state.wallet]
  );

  /**
   * Get alkane token balance
   */
  const getTokenBalance = useCallback(
    async (alkaneId: AlkaneId) => { // Use AlkaneId from ts-sdk types
      if (!state.provider || !state.address) {
        throw new Error('Wallet not initialized');
      }
      // Assuming getAlkaneBalance is a method on AlkanesProvider.alkanes
      return state.provider.alkanes.getAlkaneBalance(state.address, alkaneId);
    },
    [state.provider, state.address]
  );

  return {
    ...state,
    createWallet: createNewWallet, // Use the renamed local function
    restoreWallet,
    restoreFromMnemonicPhrase,
    unlockStoredWallet,
    lockWallet,
    deleteWallet,
    signPsbt: signTransactionPsbt, // Use the renamed local function
    getTokenBalance,
  };
}
