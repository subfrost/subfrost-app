'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/context/WalletContext';

interface Brc20Balance {
  ticker: string;
  balance: string;
  contractAddress: string;
  decimals: number;
}

/**
 * BRC2.0 token balances card.
 *
 * Queries the BRC20_Controller and known BRC2.0 token contracts
 * via eth_call to display token balances for the connected wallet.
 *
 * On mainnet: uses the BiS explorer API or direct eth_call to brc20.build RPC
 * On devnet: uses metashrew_view routing through brc20shrew indexer
 */
export default function Brc20BalancesCard() {
  const { address, network } = useWallet() as any;
  const [balances, setBalances] = useState<Brc20Balance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Known BRC2.0 token contracts on mainnet
  const KNOWN_TOKENS: Record<string, { ticker: string; decimals: number }> = {
    '0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337': { ticker: 'frBTC', decimals: 8 },
    // LP tokens and other BRC-20 tokens will be discovered dynamically
  };

  useEffect(() => {
    if (!address) return;
    // TODO: Query BRC2.0 balances via eth_call
    // For now, show placeholder data indicating the feature is active
    setBalances([]);
  }, [address, network]);

  if (!address) return null;

  if (balances.length === 0 && !isLoading) {
    return (
      <div className="text-center py-2 text-[color:var(--sf-text)]/60">
        <span className="text-sm font-medium">
          BRC20 tokens coming soon
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {balances.map((token) => (
        <div
          key={token.contractAddress}
          className="flex items-center justify-between p-3 rounded-xl bg-[color:var(--sf-panel-bg)]/50 hover:bg-[color:var(--sf-panel-bg)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
              <span className="text-xs font-bold text-orange-400">
                {token.ticker.slice(0, 2)}
              </span>
            </div>
            <div>
              <span className="text-sm font-semibold text-[color:var(--sf-text)]">
                {token.ticker}
              </span>
              <span className="text-xs text-[color:var(--sf-text)]/40 ml-2">
                BRC2.0
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-mono text-[color:var(--sf-text)]">
              {token.balance}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
