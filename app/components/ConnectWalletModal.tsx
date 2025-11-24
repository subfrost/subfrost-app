'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react'; // Added ReactNode import
import { useState } from 'react'; // Added useState import

import { useWallet } from '@/context/WalletContext';
import type { Network } from '@/utils/types'; // Using local Network type

// TODO: Re-integrate actual wallet connection logic using @alkanes/ts-sdk.
// The previous implementation relied on lasereyes, which is being removed.


function getWallets(network: Network): any { // Temporarily set return type to any
  // TODO: Re-integrate actual wallet connection logic using @alkanes/ts-sdk.
  // For now, return an empty object as a placeholder.
  return {};
}

export default function ConnectWalletModal() {
  const {
    network,
    isConnectModalOpen,
    onConnectModalOpenChange,
    finalizeConnect,
  } = useWallet();

  if (!isConnectModalOpen) return null;

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
            {/* TODO: Re-integrate actual wallet buttons using @alkanes/ts-sdk. */}
            {/* Current implementation removed due to lasereyes deprecation. */}
            {/* Object.values(WALLETS).map((wallet) => { ... }) */}
          </div>
        </div>

        {/* Removed "Powered by LaserEyes" section */}
      </div>
    </div>
  );
}
