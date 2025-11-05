'use client';

import { ChevronRight } from 'lucide-react';
import {
  LaserEyesLogo,
  MAGIC_EDEN,
  SUPPORTED_WALLETS,
  WalletIcon,
} from '@omnisat/lasereyes-react';
import type { Network } from '@oyl/sdk';

import { useWallet } from '@/context/WalletContext';

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
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
      onClick={() => onConnectModalOpenChange(false)}
    >
      <div
        className="h-[80vh] max-h-[720px] w-[560px] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-4 pb-2">
          <div className="ml-1 text-center text-xl font-medium leading-10">
            Select your wallet
          </div>
        </div>

        <div className="scrollbar-hide relative z-0 h-[calc(80vh-96px)] w-full overflow-y-auto px-6 pb-20">
          <div className="flex w-full flex-col gap-2">
            {Object.values(WALLETS).map((wallet) => {
              // @ts-ignore
              const isMissingWallet = !hasWallet[wallet.name];
              return (
                <button
                  key={wallet.name}
                  onClick={
                    isMissingWallet ? undefined : () => finalizeConnect(wallet.name)
                  }
                  className="group flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-4 py-4 text-left transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-[32px] min-h-[32px] min-w-[32px] items-center justify-center">
                      <WalletIcon
                        size={32}
                        // @ts-ignore
                        walletName={wallet.name}
                        className="!h-[32px] !w-[32px]"
                      />
                    </div>
                    <span className="retro-text text-sm">
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

                  {isMissingWallet ? (
                    <a
                      // @ts-ignore
                      href={wallet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-800 hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-sm">Install</span>
                      <ChevronRight className="size-4" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Connect</span>
                      <ChevronRight className="size-4" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="group fixed bottom-3 left-1/2 -translate-x-1/2 text-[8px]">
          <div className="retro-text text-center text-xs text-blue-500 opacity-100 transition-opacity duration-300 ease-in-out group-hover:opacity-0 dark:text-gray-400">
            <a href="https://www.lasereyes.build/" target="_blank" rel="noopener noreferrer">
              Powered by LaserEyes
            </a>
          </div>
          <div className="absolute left-1/2 mt-1 -translate-x-1/2 opacity-0 transition-opacity duration-500 ease-in-out group-hover:opacity-100">
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
  );
}


