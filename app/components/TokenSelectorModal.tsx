'use client';

import { useState, useMemo } from 'react';
import TokenIcon from './TokenIcon';
import { Search, X } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

// Import Network type from constants
import type { Network } from '@/utils/constants';

/**
 * Format alkane token balance for display
 * Handles large numbers with proper decimal precision
 * Matches the formatting logic in BalancesPanel.tsx
 */
function formatAlkaneBalance(balance: string, decimals: number = 8): string {
  if (!balance || balance === '0') return '0';

  try {
    const value = BigInt(balance);

    // Handle NFTs (single unit)
    if (value === BigInt(1)) {
      return '1';
    }

    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const remainder = value % divisor;
    const wholeStr = whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, '0');

    // Determine decimal places based on whole number size
    // 3+ digits (100+): show 2 decimal places
    // 2 or fewer digits: show 4 decimal places
    const decimalPlaces = wholeStr.length >= 3 ? 2 : 4;
    const truncatedRemainder = remainderStr.slice(0, decimalPlaces);

    // Remove trailing zeros for cleaner display
    const trimmedRemainder = truncatedRemainder.replace(/0+$/, '') || '0';

    if (trimmedRemainder === '0' && whole > 0) {
      return wholeStr;
    }

    return `${wholeStr}.${trimmedRemainder}`;
  } catch {
    // Fallback for invalid input
    return '0';
  }
}

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
  // Percentage selection (shown in 'from' mode)
  onPercentFrom?: (percent: number) => void;
  activePercent?: number | null;
};

// Bridge token definitions
const BRIDGE_TOKENS = [
  { symbol: 'USDT', name: 'USDT', enabled: false },
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
  title,
  network = 'mainnet',
  excludedTokenIds = [],
  mode,
  onBridgeTokenSelect,
  selectedBridgeTokenFromOther,
  onPercentFrom,
  activePercent,
}: Props) {
  const { t } = useTranslation();
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
        className="flex h-[80vh] max-h-[600px] w-full max-w-[480px] flex-col overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
              {title || t('tokenSelector.selectToken')}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Percentage Selection - Shown in FROM mode */}
        {mode === 'from' && onPercentFrom && (
          <div className="bg-[color:var(--sf-panel-bg)] mx-4 mt-4 rounded-2xl px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
                {t('tokenSelector.selectAmount')}
              </span>
              <div className="flex items-center gap-2">
                {[
                  { value: 0.25, label: '25%' },
                  { value: 0.5, label: '50%' },
                  { value: 0.75, label: '75%' },
                  { value: 1, label: 'MAX' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onPercentFrom(option.value);
                      onClose();
                    }}
                    className={`flex-1 inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none ${
                      activePercent === option.value
                        ? 'bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]'
                        : 'bg-[color:var(--sf-input-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bridge Section - Shown in FROM and TO modes */}
        {(mode === 'from' || mode === 'to') && (
          <div className="bg-[color:var(--sf-panel-bg)] mx-4 mt-4 rounded-2xl px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
                  {t('tokenSelector.crossChainSwap')}
                </span>
                {showComingSoon && (
                  <span className="text-xs font-bold text-[color:var(--sf-primary)] animate-pulse">
                    {t('tokenSelector.comingSoon')}
                  </span>
                )}
                {showAlreadySelected && (
                  <span className="text-xs font-bold text-[color:var(--sf-primary)] animate-pulse">
                    {t('tokenSelector.alreadySelected')}
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
                        } else if (token.enabled || network?.includes('regtest')) {
                          onBridgeTokenSelect?.(token.symbol);
                        } else {
                          if (!showComingSoon) {
                            setShowComingSoon(true);
                            setTimeout(() => setShowComingSoon(false), 1000);
                          }
                        }
                      }}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none ${
                        isSelectedInOther
                          ? 'bg-[color:var(--sf-primary)]/10 cursor-not-allowed'
                          : (token.enabled || network?.includes('regtest'))
                          ? 'bg-[color:var(--sf-input-bg)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] cursor-pointer'
                          : 'bg-[color:var(--sf-input-bg)]/50 cursor-not-allowed'
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
        <div className="px-4 py-4">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40"
            />
            <input
              type="text"
              placeholder={t('tokenSelector.searchAssets')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] py-3 pl-10 pr-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            />
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filteredTokens.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm font-medium text-[color:var(--sf-text)]/50">
                {t('tokenSelector.noTokens')}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTokens.map((token) => {
                const isSelected = token.id === selectedTokenId;
                const isAvailable = token.isAvailable !== false;
                // Use proper alkane balance formatting with BigInt math
                const formattedBalance = token.balance ? formatAlkaneBalance(token.balance) : null;
                // For USD value calculation, parse the raw balance and divide by 1e8
                const balanceNum = token.balance ? parseFloat(token.balance) / 1e8 : 0;
                const valueUsd = token.price && token.balance
                  ? (balanceNum * token.price).toFixed(2)
                  : null;

                return (
                  <button
                    key={token.id}
                    onClick={() => handleSelect(token.id)}
                    className={`group relative w-full rounded-xl p-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none ${
                      isSelected
                        ? 'bg-[color:var(--sf-primary)]/10 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                        : 'bg-[color:var(--sf-input-bg)] hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                    }`}
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
                          <span className="font-bold text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
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
                        {formattedBalance && (
                          <>
                            <span className="text-sm font-bold text-[color:var(--sf-text)]">
                              {formattedBalance}
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
                        {!isAvailable && mode === 'from' && (
                          <span className="text-xs font-medium text-[color:var(--sf-text)]/50">
                            {t('tokenSelector.notAvailable')}
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
