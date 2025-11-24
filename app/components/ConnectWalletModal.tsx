'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import KeystoreModal from './KeystoreModal';
import CreateKeystoreModal from './CreateKeystoreModal';
import ImportKeystoreModal from './ImportKeystoreModal';
import NetworkConfigModal from './NetworkConfigModal';
import type { NetworkType } from '@/ts-sdk/src/types';

interface BrowserWallet {
  id: string;
  name: string;
  icon: string;
  detected: boolean;
}

export default function ConnectWalletModal() {
  const {
    network,
    isConnectModalOpen,
    onConnectModalOpenChange,
    connectKeystore,
    connectBrowserWallet,
  } = useWallet();

  const [showKeystoreModal, setShowKeystoreModal] = useState(false);
  const [showCreateKeystore, setShowCreateKeystore] = useState(false);
  const [showImportKeystore, setShowImportKeystore] = useState(false);
  const [showNetworkConfig, setShowNetworkConfig] = useState(false);
  const [keystoreMode, setKeystoreMode] = useState<'create' | 'import' | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>(network);
  const [selectedDerivationPath, setSelectedDerivationPath] = useState<string | undefined>(undefined);
  const [pendingKeystoreData, setPendingKeystoreData] = useState<{
    keystoreJson: string;
    mnemonic: string;
    network: NetworkType;
  } | null>(null);

  if (!isConnectModalOpen) return null;

  const browserWallets: BrowserWallet[] = [
    {
      id: 'unisat',
      name: 'Unisat Wallet',
      icon: '🦄',
      detected: typeof window !== 'undefined' && !!(window as any).unisat,
    },
    {
      id: 'xverse',
      name: 'Xverse Wallet',
      icon: '✖️',
      detected: typeof window !== 'undefined' && !!(window as any).XverseProviders,
    },
    {
      id: 'phantom',
      name: 'Phantom Wallet',
      icon: '👻',
      detected: typeof window !== 'undefined' && !!(window as any).phantom?.bitcoin,
    },
    {
      id: 'okx',
      name: 'OKX Wallet',
      icon: '⭕',
      detected: typeof window !== 'undefined' && !!(window as any).okxwallet,
    },
  ];

  const handleKeystoreClick = () => {
    setShowKeystoreModal(true);
  };

  const handleCreateKeystore = () => {
    setShowKeystoreModal(false);
    setKeystoreMode('create');
    setShowCreateKeystore(true);
  };

  const handleImportKeystore = () => {
    setShowKeystoreModal(false);
    setKeystoreMode('import');
    setShowImportKeystore(true);
  };

  const handleNetworkConfigured = (
    configNetwork: NetworkType,
    customRpcUrl?: string,
    derivationPath?: string
  ) => {
    setShowNetworkConfig(false);
    setSelectedNetwork(configNetwork);
    setSelectedDerivationPath(derivationPath);
    
    if (pendingKeystoreData) {
      // Complete the keystore connection with network config
      connectKeystore(
        pendingKeystoreData.keystoreJson,
        pendingKeystoreData.mnemonic,
        configNetwork,
        derivationPath
      );
      setPendingKeystoreData(null);
      onConnectModalOpenChange(false);
    }
  };

  const handleKeystoreCreated = (
    keystoreJson: string,
    mnemonic: string,
    createdNetwork: NetworkType
  ) => {
    setShowCreateKeystore(false);
    connectKeystore(keystoreJson, mnemonic, createdNetwork);
    onConnectModalOpenChange(false);
  };

  const handleKeystoreImported = (
    keystoreJson: string,
    mnemonic: string,
    importedNetwork: NetworkType
  ) => {
    setShowImportKeystore(false);
    connectKeystore(keystoreJson, mnemonic, importedNetwork);
    onConnectModalOpenChange(false);
  };

  const handleBrowserWalletClick = async (walletId: string) => {
    try {
      await connectBrowserWallet(walletId);
      onConnectModalOpenChange(false);
    } catch (error) {
      console.error(`Failed to connect ${walletId}:`, error);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
        onClick={() => onConnectModalOpenChange(false)}
      >
        <div
          className="w-[400px] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-[#1a1f2e]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative px-6 pt-6 pb-4">
            <button
              onClick={() => onConnectModalOpenChange(false)}
              className="absolute right-4 top-4 text-white/60 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={24} />
            </button>
            <h2 className="text-xl font-medium text-white text-center">
              Connect a Wallet
            </h2>
          </div>

          <div className="px-6 pb-6">
            <button
              onClick={handleKeystoreClick}
              className="w-full rounded-xl bg-[#5b7cff] hover:bg-[#4d6de8] transition-colors px-6 py-4 text-white font-semibold mb-4"
            >
              Keystore
            </button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#1a1f2e] px-2 text-white/50">or connect with</span>
              </div>
            </div>

            <div className="space-y-2">
              {browserWallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => handleBrowserWalletClick(wallet.id)}
                  disabled={!wallet.detected}
                  className={`w-full rounded-xl px-6 py-4 text-white font-semibold flex items-center justify-between transition-colors ${
                    wallet.detected
                      ? 'bg-[#2a3142] hover:bg-[#343d52]'
                      : 'bg-[#2a3142]/50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{wallet.icon}</span>
                    <span>{wallet.name}</span>
                  </div>
                  {!wallet.detected && (
                    <span className="text-xs text-white/40">Not Detected</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <KeystoreModal
        isOpen={showKeystoreModal}
        onClose={() => setShowKeystoreModal(false)}
        onCreateKeystore={handleCreateKeystore}
        onImportKeystore={handleImportKeystore}
      />

      <CreateKeystoreModal
        isOpen={showCreateKeystore}
        onClose={() => {
          setShowCreateKeystore(false);
          setKeystoreMode(null);
        }}
        onKeystoreCreated={handleKeystoreCreated}
        network={selectedNetwork}
      />

      <ImportKeystoreModal
        isOpen={showImportKeystore}
        onClose={() => {
          setShowImportKeystore(false);
          setKeystoreMode(null);
        }}
        onKeystoreImported={handleKeystoreImported}
        network={selectedNetwork}
      />

      <NetworkConfigModal
        isOpen={showNetworkConfig}
        onClose={() => {
          setShowNetworkConfig(false);
          setKeystoreMode(null);
        }}
        onConfigure={handleNetworkConfigured}
        defaultNetwork={network}
      />
    </>
  );
}
