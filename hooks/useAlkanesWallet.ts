/**
 * React hook for Alkanes wallet integration
 *
 * Provides access to Alkanes keystore functionality within React components
 */

import { useState, useCallback, useEffect } from 'react';
import {
  setupAlkanesWallet,
  restoreAlkanesWallet,
  restoreFromMnemonic,
  signPsbtWithAlkanes,
  getAlkaneBalance,
  saveKeystoreToStorage,
  loadKeystoreFromStorage,
  clearKeystoreFromStorage,
  hasStoredKeystore,
  type AlkanesWalletInstance,
} from '@/lib/oyl/alkanes/wallet-integration';

// Define Network type locally to avoid import issues with ts-sdk
import type { Network } from '@/utils/constants';

export type AlkanesWalletState = {
  wallet: AlkanesWalletInstance | null;
  provider: any | null;
  address: string | null;
  taprootAddress: string | null;
  isLoading: boolean;
  error: string | null;
  isUnlocked: boolean;
  hasKeystore: boolean;
};

export function useAlkanesWallet(network: Network = 'mainnet') {
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
    const hasStored = hasStoredKeystore();
    setState((prev) => ({ ...prev, hasKeystore: hasStored }));
  }, []);

  /**
   * Create a new wallet
   */
  const createWallet = useCallback(
    async (password: string, saveToStorage = true) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await setupAlkanesWallet(password, network);

        if (saveToStorage) {
          saveKeystoreToStorage(result.keystore, network);
        }

        setState({
          wallet: result.wallet,
          provider: result.provider,
          address: result.address,
          taprootAddress: result.taprootAddress,
          isLoading: false,
          error: null,
          isUnlocked: true,
          hasKeystore: true,
        });

        return {
          mnemonic: result.mnemonic,
          keystore: result.keystore,
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
        const result = await restoreAlkanesWallet(keystoreJson, password, network);

        if (saveToStorage) {
          saveKeystoreToStorage(keystoreJson, network);
        }

        setState({
          wallet: result.wallet,
          provider: result.provider,
          address: result.address,
          taprootAddress: result.taprootAddress,
          isLoading: false,
          error: null,
          isUnlocked: true,
          hasKeystore: true,
        });

        return result;
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
        const result = await restoreFromMnemonic(mnemonic, password, network);

        if (saveToStorage) {
          saveKeystoreToStorage(result.keystore, network);
        }

        setState({
          wallet: result.wallet,
          provider: result.provider,
          address: result.address,
          taprootAddress: result.taprootAddress,
          isLoading: false,
          error: null,
          isUnlocked: true,
          hasKeystore: true,
        });

        return result;
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
      const stored = loadKeystoreFromStorage();
      if (!stored) {
        throw new Error('No stored keystore found');
      }

      return restoreWallet(stored.keystore, password, false);
    },
    [restoreWallet]
  );

  /**
   * Lock wallet (clear from memory)
   */
  const lockWallet = useCallback(() => {
    setState({
      wallet: null,
      provider: null,
      address: null,
      taprootAddress: null,
      isLoading: false,
      error: null,
      isUnlocked: false,
      hasKeystore: state.hasKeystore,
    });
  }, [state.hasKeystore]);

  /**
   * Delete wallet from storage
   */
  const deleteWallet = useCallback(() => {
    clearKeystoreFromStorage();
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
  }, []);

  /**
   * Sign a PSBT
   */
  const signPsbt = useCallback(
    (psbtBase64: string) => {
      if (!state.wallet) {
        throw new Error('Wallet not unlocked');
      }
      return signPsbtWithAlkanes(state.wallet, psbtBase64);
    },
    [state.wallet]
  );

  /**
   * Get alkane token balance
   */
  const getTokenBalance = useCallback(
    async (alkaneId: { block: number; tx: number }) => {
      if (!state.provider || !state.address) {
        throw new Error('Wallet not initialized');
      }
      return getAlkaneBalance(state.provider, state.address, alkaneId);
    },
    [state.provider, state.address]
  );

  return {
    ...state,
    createWallet,
    restoreWallet,
    restoreFromMnemonicPhrase,
    unlockStoredWallet,
    lockWallet,
    deleteWallet,
    signPsbt,
    getTokenBalance,
  };
}
