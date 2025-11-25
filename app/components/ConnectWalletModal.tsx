'use client';

import { ChevronRight, X } from 'lucide-react';
import {
  LaserEyesLogo,
  MAGIC_EDEN,
  SUPPORTED_WALLETS,
  WalletIcon,
} from '@omnisat/lasereyes-react';

import { useWallet } from '@/context/WalletContext';

// Define Network type locally to avoid import issues
type Network = 'mainnet' | 'testnet' | 'signet' | 'oylnet' | 'regtest';

type WalletMap = typeof SUPPORTED_WALLETS;
type OptionalWalletMap = { [K in keyof WalletMap]?: WalletMap[K] };

function getWallets(network: Network): Partial<WalletMap> {
  const { oyl, ...others } = SUPPORTED_WALLETS;
  const filtered: OptionalWalletMap = { ...others };
  delete filtered.phantom;
  delete filtered.wizz;
  delete filtered.orange;
  delete filtered.sparrow;
  delete filtered.op_net;
  delete filtered.leather;
  return network === 'oylnet' ? { oyl } : { oyl, ...filtered };
}

export default function ConnectWalletModal() {
  const {
    network,
    isConnectModalOpen,
    onConnectModalOpenChange,
    finalizeConnect,
    hasUnisat,
    hasXverse,
    hasOyl,
    hasMagicEden,
    hasOkx,
    hasOpNet,
    hasLeather,
    hasPhantom,
    hasWizz,
    hasOrange,
  } = useWallet();

  if (!isConnectModalOpen) return null;

  const hasWallet: any = {
    unisat: hasUnisat,
    xverse: hasXverse,
    oyl: hasOyl,
    [MAGIC_EDEN]: hasMagicEden,
    okx: hasOkx,
    op_net: hasOpNet,
    leather: hasLeather,
    phantom: hasPhantom,
    wizz: hasWizz,
    orange: hasOrange,
  };

  const WALLETS = getWallets(network);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={() => onConnectModalOpenChange(false)}
    >
      <div
        className="flex h-[80vh] max-h-[600px] w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(40,67,114,0.4)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[color:var(--sf-glass-border)] bg-white/40 px-6 py-5">
          <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
            Select your wallet
          </h2>
          <button
            onClick={() => onConnectModalOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--sf-outline)] bg-white/80 text-[color:var(--sf-text)]/70 transition-all hover:bg-white hover:text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/30 sf-focus-ring"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Wallet List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-1">
            {Object.values(WALLETS).map((wallet) => {
              // @ts-ignore
              const isMissingWallet = !hasWallet[wallet.name];
              return (
                <button
                  key={wallet.name}
                  onClick={
                    isMissingWallet ? undefined : () => finalizeConnect(wallet.name)
                  }
                  className="group w-full rounded-xl border-2 p-4 text-left transition-all hover:shadow-md sf-focus-ring border-transparent bg-white/40 hover:border-[color:var(--sf-primary)]/30 hover:bg-white/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-[32px] min-h-[32px] min-w-[32px] items-center justify-center flex-shrink-0">
                      <WalletIcon
                        size={32}
                        // @ts-ignore
                        walletName={wallet.name}
                        className="!h-[32px] !w-[32px]"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-colors">
                        {
                          // @ts-ignore
                          String(wallet.name)
                            .replace(/[-_]/g, ' ')
                            .split(' ')
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMissingWallet ? (
                        <a
                          // @ts-ignore
                          href={wallet.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm font-medium text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary)]/80 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>Install</span>
                          <ChevronRight className="size-4" />
                        </a>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-[color:var(--sf-text)]/60">Connect</span>
                          <ChevronRight className="size-4 text-[color:var(--sf-text)]/60" />
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-[color:var(--sf-glass-border)] bg-white/20 px-6 py-4">
          <div className="group relative text-center">
            <div className="text-xs font-medium text-[color:var(--sf-text)]/50 opacity-100 transition-opacity duration-300 ease-in-out group-hover:opacity-0">
              <a href="https://www.lasereyes.build/" target="_blank" rel="noopener noreferrer">
                Powered by LaserEyes
              </a>
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-500 ease-in-out group-hover:opacity-100">
              <a
                href="https://www.lasereyes.build/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-center"
              >
                <LaserEyesLogo width={48} color={'darkBlue'} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


