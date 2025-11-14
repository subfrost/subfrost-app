'use client';

import TokenIcon from '@/app/components/TokenIcon';
import type { Transaction } from '../types';
import type { Network } from '@oyl/sdk';
import { ArrowRight, ExternalLink } from 'lucide-react';

type Props = {
  transaction: Transaction;
  network: Network;
};

export default function TransactionCard({ transaction, network }: Props) {
  const { type, txHash, fromToken, toToken, amountFrom, amountTo, timestamp, status } = transaction;

  const formatDate = (ts: number) => {
    const date = new Date(ts);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

  const truncateAddress = (hash: string) => {
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  const getExplorerUrl = (hash: string) => {
    if (network === 'testnet') {
      return `https://mempool.space/testnet/tx/${hash}`;
    }
    return `https://mempool.space/tx/${hash}`;
  };

  const getTypeColor = () => {
    switch (type) {
      case 'Swap':
        return 'bg-blue-100 text-blue-700';
      case 'Wrap':
        return 'bg-purple-100 text-purple-700';
      case 'Unwrap':
        return 'bg-orange-100 text-orange-700';
      case 'Deposit':
        return 'bg-green-100 text-green-700';
      case 'Withdraw':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getTokenIconUrl = (tokenId: string, symbol: string) => {
    // BTC uses local icon
    if (tokenId === 'btc' || symbol === 'BTC') {
      return undefined;
    }
    
    // Alkane tokens use Oyl asset URL
    if (/^\d+:\d+/.test(tokenId)) {
      const urlSafeId = tokenId.replace(/:/g, '-');
      return `https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`;
    }
    
    return undefined;
  };

  return (
    <div className="rounded-xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl p-4 shadow-[0_2px_12px_rgba(40,67,114,0.08)] transition-all hover:shadow-[0_4px_20px_rgba(40,67,114,0.12)] hover:border-[color:var(--sf-primary)]/30">
      {/* Mobile Layout */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${getTypeColor()}`}>
            {type}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TokenIcon
              symbol={fromToken.symbol}
              id={fromToken.id}
              iconUrl={getTokenIconUrl(fromToken.id, fromToken.symbol)}
              size="md"
              network={network}
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--sf-text)]">{fromToken.symbol}</span>
              <span className="text-[10px] font-mono text-[color:var(--sf-text)]/40">{fromToken.id}</span>
            </div>
          </div>
          <ArrowRight size={14} className="text-[color:var(--sf-primary)]" />
          <div className="flex items-center gap-2">
            <TokenIcon
              symbol={toToken.symbol}
              id={toToken.id}
              iconUrl={getTokenIconUrl(toToken.id, toToken.symbol)}
              size="md"
              network={network}
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--sf-text)]">{toToken.symbol}</span>
              <span className="text-[10px] font-mono text-[color:var(--sf-text)]/40">{toToken.id}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[color:var(--sf-outline)]">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-1">Sent</span>
            <span className="text-sm font-bold text-[color:var(--sf-text)]">{amountFrom} {fromToken.symbol}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-1">Received</span>
            <span className="text-sm font-bold text-green-600">{amountTo} {toToken.symbol}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[color:var(--sf-outline)]">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-1">TX Hash</span>
            <span className="text-[11px] font-mono font-semibold text-[color:var(--sf-text)]/70">{truncateAddress(txHash)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-1">Date</span>
            <span className="text-[11px] font-semibold text-[color:var(--sf-text)]/70">{formatDate(timestamp)}</span>
          </div>
          <a
            href={getExplorerUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--sf-outline)] bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] backdrop-blur-sm transition-all hover:bg-white hover:border-[color:var(--sf-primary)]/30 hover:shadow-sm sf-focus-ring"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Desktop Layout - Grid with consistent columns */}
      <div className="hidden lg:grid lg:grid-cols-[100px_minmax(0,1fr)_280px_160px_140px_40px] lg:gap-4 lg:items-center">
        {/* Type */}
        <div>
          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${getTypeColor()}`}>
            {type}
          </span>
        </div>

        {/* Pair */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TokenIcon
              symbol={fromToken.symbol}
              id={fromToken.id}
              iconUrl={getTokenIconUrl(fromToken.id, fromToken.symbol)}
              size="md"
              network={network}
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--sf-text)]">{fromToken.symbol}</span>
              <span className="text-[10px] font-mono text-[color:var(--sf-text)]/40">{fromToken.id}</span>
            </div>
          </div>
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[color:var(--sf-primary)]/10 shrink-0">
            <ArrowRight size={14} className="text-[color:var(--sf-primary)]" />
          </div>
          <div className="flex items-center gap-2">
            <TokenIcon
              symbol={toToken.symbol}
              id={toToken.id}
              iconUrl={getTokenIconUrl(toToken.id, toToken.symbol)}
              size="md"
              network={network}
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--sf-text)]">{toToken.symbol}</span>
              <span className="text-[10px] font-mono text-[color:var(--sf-text)]/40">{toToken.id}</span>
            </div>
          </div>
        </div>

        {/* Amounts */}
        <div className="flex items-center gap-4 pl-4 border-l border-[color:var(--sf-outline)]">
          <div className="flex flex-col flex-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-0.5">Sent</span>
            <span className="text-sm font-bold text-[color:var(--sf-text)] truncate">{amountFrom} {fromToken.symbol}</span>
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-0.5">Received</span>
            <span className="text-sm font-bold text-green-600 truncate">{amountTo} {toToken.symbol}</span>
          </div>
        </div>

        {/* TX Hash */}
        <div className="flex flex-col pl-4 border-l border-[color:var(--sf-outline)]">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-0.5">TX Hash</span>
          <span className="text-[11px] font-mono font-semibold text-[color:var(--sf-text)]/70 truncate">{truncateAddress(txHash)}</span>
        </div>

        {/* Date */}
        <div className="flex flex-col pl-4 border-l border-[color:var(--sf-outline)]">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/50 mb-0.5">Date</span>
          <span className="text-[11px] font-semibold text-[color:var(--sf-text)]/70 truncate">{formatDate(timestamp)}</span>
        </div>

        {/* Explorer Link */}
        <div className="flex justify-center">
          <a
            href={getExplorerUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--sf-outline)] bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] backdrop-blur-sm transition-all hover:bg-white hover:border-[color:var(--sf-primary)]/30 hover:shadow-sm sf-focus-ring"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
