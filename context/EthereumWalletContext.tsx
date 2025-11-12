'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ethers, BrowserProvider, JsonRpcSigner } from 'ethers';
import { ETHEREUM_CONTRACTS } from '@/utils/getConfig';

type ConnectionMethod = 'metamask' | 'walletconnect';

interface EthereumWalletContextType {
  // Connection state
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  connectionMethod: ConnectionMethod | null;
  
  // Actions
  connect: (method?: ConnectionMethod) => Promise<void>;
  disconnect: () => void;
  
  // Provider access
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  
  // Status
  isConnecting: boolean;
  error: string | null;
}

const EthereumWalletContext = createContext<EthereumWalletContextType | undefined>(undefined);

interface EthereumWalletProviderProps {
  children: ReactNode;
  ethereumNetwork: 'mainnet' | 'sepolia' | 'regtest';
}

export function EthereumWalletProvider({ children, ethereumNetwork }: EthereumWalletProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod | null>(null);
  const [walletConnectProvider, setWalletConnectProvider] = useState<any>(null);

  const expectedChainId = ETHEREUM_CONTRACTS[ethereumNetwork].CHAIN_ID;

  // Check if MetaMask/window.ethereum is available
  const hasEthereum = typeof window !== 'undefined' && window.ethereum;

  // Initialize provider on mount and check if already connected
  useEffect(() => {
    if (!hasEthereum) return;

    const initProvider = async () => {
      try {
        const ethProvider = new BrowserProvider(window.ethereum);
        setProvider(ethProvider);

        // Check if already connected
        const accounts = await ethProvider.listAccounts();
        if (accounts.length > 0) {
          const account = accounts[0];
          setAddress(account.address);
          const network = await ethProvider.getNetwork();
          setChainId(Number(network.chainId));
          const ethSigner = await ethProvider.getSigner();
          setSigner(ethSigner);
          setIsConnected(true);
        }
      } catch (err) {
        console.error('Failed to initialize Ethereum provider:', err);
      }
    };

    initProvider();
  }, [hasEthereum]);

  // Listen for account changes
  useEffect(() => {
    if (!hasEthereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected
        disconnect();
      } else {
        // Account switched
        setAddress(accounts[0]);
        if (provider) {
          provider.getSigner().then(setSigner);
        }
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      setChainId(newChainId);
      
      // Reload page on chain change (recommended by MetaMask)
      window.location.reload();
    };

    window.ethereum?.on('accountsChanged', handleAccountsChanged);
    window.ethereum?.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, [hasEthereum, provider]);

  const connect = useCallback(async (method: ConnectionMethod = 'metamask') => {
    setIsConnecting(true);
    setError(null);

    try {
      if (method === 'walletconnect') {
        // WalletConnect is currently not fully configured
        // This feature requires additional setup with a WalletConnect project ID
        throw new Error('WalletConnect is not yet configured. Please use MetaMask or manual transfer for now.');
      } else {
        // MetaMask integration
        if (!hasEthereum) {
          setError('Please install MetaMask or another Web3 wallet');
          return;
        }

        const ethProvider = new BrowserProvider(window.ethereum);
        
        // Request account access
        const accounts = await ethProvider.send('eth_requestAccounts', []);
        
        if (accounts.length === 0) {
          throw new Error('No accounts found');
        }

        const account = accounts[0];
        const network = await ethProvider.getNetwork();
        const currentChainId = Number(network.chainId);

        // Check if on correct network
        if (currentChainId !== expectedChainId) {
          // Try to switch network
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${expectedChainId.toString(16)}` }],
            });
            
            // Re-fetch network after switch
            const updatedNetwork = await ethProvider.getNetwork();
            setChainId(Number(updatedNetwork.chainId));
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              // Network not added, need to add it
              setError(`Please add ${ethereumNetwork} network to your wallet`);
            } else {
              throw switchError;
            }
          }
        } else {
          setChainId(currentChainId);
        }

        const ethSigner = await ethProvider.getSigner();
        
        setProvider(ethProvider);
        setSigner(ethSigner);
        setAddress(account);
        setConnectionMethod('metamask');
        setIsConnected(true);
      }
    } catch (err: any) {
      console.error('Failed to connect Ethereum wallet:', err);
      setError(err.message || 'Failed to connect wallet');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [hasEthereum, expectedChainId, ethereumNetwork]);

  const disconnect = useCallback(async () => {
    // Disconnect WalletConnect if active
    if (walletConnectProvider) {
      try {
        await walletConnectProvider.disconnect();
      } catch (err) {
        console.error('Failed to disconnect WalletConnect:', err);
      }
      setWalletConnectProvider(null);
    }

    setIsConnected(false);
    setAddress(null);
    setChainId(null);
    setProvider(null);
    setSigner(null);
    setError(null);
    setConnectionMethod(null);
  }, [walletConnectProvider]);

  const value: EthereumWalletContextType = {
    isConnected,
    address,
    chainId,
    connectionMethod,
    connect,
    disconnect,
    provider,
    signer,
    isConnecting,
    error,
  };

  return (
    <EthereumWalletContext.Provider value={value}>
      {children}
    </EthereumWalletContext.Provider>
  );
}

export function useEthereumWallet() {
  const context = useContext(EthereumWalletContext);
  if (context === undefined) {
    throw new Error('useEthereumWallet must be used within an EthereumWalletProvider');
  }
  return context;
}

// TypeScript augmentation for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
