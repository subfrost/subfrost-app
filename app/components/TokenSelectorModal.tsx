'use client';

import { useState, useMemo } from 'react';
import TokenIcon from './TokenIcon';
import { Search, X } from 'lucide-react';

// Import Network type from constants
import type { Network } from '@/utils/constants';

export type TokenOption = {
  id: string;
  symbol: string;
  name?: string;
  iconUrl?: string;
  balance?: string;
  price?: number;
  isAvailable?: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenOption[];
  onSelectToken: (tokenId: string) => void;
  selectedTokenId?: string;
  title?: string;
  network?: Network;
  excludedTokenIds?: string[];
  mode?: 'from' | 'to' | 'pool0' | 'pool1' | null;
  onBridgeTokenSelect?: (token: string) => void;
  selectedBridgeTokenFromOther?: string; // Bridge token selected in the opposite selector
};

// Bridge token definitions
const BRIDGE_TOKENS = [
  { symbol: 'USDT', name: 'USDT', enabled: true },
  { symbol: 'ETH', name: 'ETH', enabled: false },
  { symbol: 'SOL', name: 'SOL', enabled: false },
  { symbol: 'ZEC', name: 'ZEC', enabled: false },
] as const;

export default function TokenSelectorModal({
  isOpen,
  onClose,
  tokens,
  onSelectToken,
  selectedTokenId,
  title = 'Select a token',
  network = 'mainnet',
  excludedTokenIds = [],
  mode,
  onBridgeTokenSelect,
  selectedBridgeTokenFromOther,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showAlreadySelected, setShowAlreadySelected] = useState(false);

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;
    const query = searchQuery.toLowerCase();
    return tokens.filter((token) => {
      return (
        token.symbol.toLowerCase().includes(query) ||
        token.name?.toLowerCase().includes(query) ||
        token.id.toLowerCase().includes(query)
      );
    });
  }, [tokens, searchQuery]);

  const handleSelect = (tokenId: string) => {
    onSelectToken(tokenId);
    onClose();
    setSearchQuery('');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] max-h-[600px] w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40 px-6 py-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/80 text-[color:var(--sf-text)]/70 transition-all hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/30 focus:outline-none"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-xs font-medium text-[color:var(--sf-text)]/60">
            We only support trades of high-volume assets.
          </p>
        </div>

        {/* Bridge Section - Shown in FROM and TO modes */}
        {(mode === 'from' || mode === 'to') && (
          <div className="border-b border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/20 px-6 py-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
                  Cross-chain Swap:
                </span>
                {showComingSoon && (
                  <span className="text-xs font-bold text-[color:var(--sf-primary)] animate-pulse">
                    Coming soon!
                  </span>
                )}
                {showAlreadySelected && (
                  <span className="text-xs font-bold text-[color:var(--sf-primary)] animate-pulse">
                    Token already selected!
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {BRIDGE_TOKENS.map((token) => {
                  const isSelectedInOther = selectedBridgeTokenFromOther === token.symbol;

                  return (
                    <button
                      key={token.symbol}
                      type="button"
                      onClick={() => {
                        if (isSelectedInOther) {
                          if (!showAlreadySelected) {
                            setShowAlreadySelected(true);
                            setTimeout(() => setShowAlreadySelected(false), 1000);
                          }
                        } else if (token.enabled) {
                          onBridgeTokenSelect?.(token.symbol);
                        } else {
                          if (!showComingSoon) {
                            setShowComingSoon(true);
                            setTimeout(() => setShowComingSoon(false), 1000);
                          }
                        }
                      }}
                      className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 transition-all focus:outline-none ${
                        isSelectedInOther
                          ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 cursor-not-allowed'
                          : token.enabled
                          ? 'border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-surface)] hover:shadow-md cursor-pointer'
                          : 'border-[color:var(--sf-outline)]/50 bg-[color:var(--sf-surface)]/40 cursor-not-allowed'
                      }`}
                    >
                      <img
                        src={`/tokens/${token.symbol.toLowerCase()}.svg`}
                        alt={token.symbol}
                        className={`w-5 h-5 rounded-full flex-shrink-0 ${!token.enabled && !isSelectedInOther ? 'opacity-40 grayscale' : ''}`}
                      />
                      <span className={`font-bold text-sm whitespace-nowrap ${
                        isSelectedInOther
                          ? 'text-[color:var(--sf-text)]'
                          : token.enabled
                          ? 'text-[color:var(--sf-text)]'
                          : 'text-[color:var(--sf-text)]/40'
                      }`}>
                        {token.symbol}
                      </span>
                      {isSelectedInOther && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[color:var(--sf-primary)] text-white">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-[color:var(--sf-surface)]/20 px-6 py-4">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40"
            />
            <input
              type="text"
              placeholder="Search bitcoin-native assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 py-3 pl-10 pr-4 text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:border-[color:var(--sf-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--sf-primary)]/50 transition-all"
            />
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filteredTokens.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm font-medium text-[color:var(--sf-text)]/50">
                No tokens found
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTokens.map((token) => {
                const isSelected = token.id === selectedTokenId;
                const isAvailable = token.isAvailable !== false;
                const balanceNum = token.balance ? parseFloat(token.balance) / 1e8 : 0;
                const valueUsd = token.price && token.balance 
                  ? (balanceNum * token.price).toFixed(2) 
                  : null;

                return (
                  <button
                    key={token.id}
                    onClick={() => handleSelect(token.id)}
                    className={`group relative w-full rounded-xl border-2 p-4 text-left transition-all focus:outline-none ${
                      !isAvailable
                        ? 'border-transparent bg-gray-300/50 opacity-50 cursor-not-allowed'
                        : isSelected
                        ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 hover:shadow-md'
                        : 'border-transparent bg-[color:var(--sf-surface)]/40 hover:border-[color:var(--sf-primary)]/30 hover:bg-[color:var(--sf-surface)]/60 hover:shadow-md'
                    }`}
                    disabled={!isAvailable}
                  >
                    <div className="flex items-center gap-3">
                      <TokenIcon
                        symbol={token.symbol}
                        id={token.id}
                        iconUrl={token.iconUrl}
                        size="lg"
                        network={network}
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-colors">
                            {token.symbol}
                          </span>
                          {isSelected && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--sf-primary)] text-white">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-[color:var(--sf-text)]/60 truncate">
                          {token.id}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        {token.balance && (
                          <>
                            <span className="text-sm font-bold text-[color:var(--sf-text)]">
                              {balanceNum.toFixed(6)}
                            </span>
                            {valueUsd && (
                              <span className="text-xs font-medium text-[color:var(--sf-text)]/50">
                                ${valueUsd}
                              </span>
                            )}
                          </>
                        )}
                        {token.price && !token.balance && (
                          <span className="text-xs font-medium text-[color:var(--sf-text)]/60">
                            ${token.price.toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
