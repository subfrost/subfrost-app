'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { Bitcoin, Coins, DollarSign, RefreshCw, Loader2, ExternalLink } from 'lucide-react';

export default function BalancesPanel() {
  const { account } = useWallet() as any;
  const { bitcoinPrice } = useAlkanesSDK();
  const { balances, utxos, isLoading, error, refresh } = useEnrichedWalletData();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        new Promise(resolve => setTimeout(resolve, 500)) // minimum 500ms spin
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBTC = (sats: number) => {
    return (sats / 100000000).toFixed(8);
  };

  const formatUSD = (sats: number) => {
    if (!bitcoinPrice) return null;
    const btc = sats / 100000000;
    return (btc * bitcoinPrice.usd).toFixed(2);
  };

  const formatAlkaneBalance = (balance: string, decimals: number = 8): string => {
    const value = BigInt(balance);

    // Check for NFT: exactly 1 unit (0.00000001 with 8 decimals)
    if (value === BigInt(1)) {
      return '1 NFT';
    }

    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const remainder = value % divisor;
    const wholeStr = whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, '0');

    // Determine decimal places based on whole number digits
    // 3+ digits (100+): show 2 decimal places
    // 2 or fewer digits: show 4 decimal places
    const decimalPlaces = wholeStr.length >= 3 ? 2 : 4;
    const truncatedRemainder = remainderStr.slice(0, decimalPlaces);

    return `${wholeStr}.${truncatedRemainder}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-[color:var(--sf-text)]/60" size={32} />
        <div className="ml-3 text-[color:var(--sf-text)]/60">Loading wallet data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <button
          onClick={refresh}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white"
        >
          Try Again
        </button>
      </div>
    );
  }

  const totalBTC = formatBTC(balances.bitcoin.total);
  const totalUSD = bitcoinPrice ? formatUSD(balances.bitcoin.total) : null;

  return (
    <div className="space-y-6">
      {/* Bitcoin Balance */}
      <div className="rounded-xl border border-[color:var(--sf-outline)] bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-500/20 border border-orange-500/30">
              <Bitcoin size={28} className="text-orange-400" />
            </div>
            <div>
              <div className="text-sm text-[color:var(--sf-text)]/60 mb-1">Bitcoin Balance</div>
              <div className="text-3xl font-bold text-[color:var(--sf-text)]">{totalBTC} BTC</div>
              {totalUSD && (
                <div className="text-sm text-[color:var(--sf-text)]/60 mt-1">
                  ${totalUSD} USD
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 disabled:opacity-50"
            title="Refresh balances"
          >
            <RefreshCw size={20} className={isLoading || isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Balance Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-[color:var(--sf-outline)]">
          <div className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3">
            <div className="text-xs text-[color:var(--sf-info-green-title)] mb-1">Spendable BTC</div>
            <div className="font-mono text-sm text-[color:var(--sf-info-green-text)]">
              {formatBTC(balances.bitcoin.spendable)} BTC {formatUSD(balances.bitcoin.spendable) && `($${formatUSD(balances.bitcoin.spendable)})`}
            </div>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3">
            <div className="text-xs text-[color:var(--sf-info-yellow-title)] mb-1">Unspendable (with Assets)</div>
            <div className="font-mono text-sm text-[color:var(--sf-info-yellow-text)]">
              {formatBTC(balances.bitcoin.withAssets)} BTC {formatUSD(balances.bitcoin.withAssets) && `($${formatUSD(balances.bitcoin.withAssets)})`}
            </div>
          </div>
        </div>

        {/* Address Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[color:var(--sf-outline)] mt-4">
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-3">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Native SegWit (P2WPKH)</div>
            <div className="font-mono text-sm text-[color:var(--sf-text)]">
              {formatBTC(balances.bitcoin.p2wpkh)} BTC
            </div>
            <a
              href={account?.nativeSegwit?.address ? `https://mempool.space/address/${account.nativeSegwit.address}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--sf-text)]/40 mt-1 hover:text-[#5b9cff] transition-colors cursor-pointer flex items-center gap-1"
              title={account?.nativeSegwit?.address ? `View ${account.nativeSegwit.address} on mempool.space` : 'No address'}
            >
              <span className="truncate">{account?.nativeSegwit?.address ? `${account.nativeSegwit.address.slice(0, 6)}...${account.nativeSegwit.address.slice(-4)}` : 'Not Found'}</span>
              <ExternalLink size={10} className="shrink-0" />
            </a>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-3">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Taproot (P2TR)</div>
            <div className="font-mono text-sm text-[color:var(--sf-text)]">
              {formatBTC(balances.bitcoin.p2tr)} BTC
            </div>
            <a
              href={account?.taproot?.address ? `https://mempool.space/address/${account.taproot.address}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--sf-text)]/40 mt-1 hover:text-[#5b9cff] transition-colors cursor-pointer flex items-center gap-1"
              title={account?.taproot?.address ? `View ${account.taproot.address} on mempool.space` : 'No address'}
            >
              <span className="truncate">{account?.taproot?.address ? `${account.taproot.address.slice(0, 6)}...${account.taproot.address.slice(-4)}` : 'Not Found'}</span>
              <ExternalLink size={10} className="shrink-0" />
            </a>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-3">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Pending Transactions</div>
            <div className="font-mono text-sm text-[color:var(--sf-text)] flex items-center gap-1">
              <a
                href={account?.nativeSegwit?.address ? `https://mempool.space/address/${account.nativeSegwit.address}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#5b9cff] transition-colors cursor-pointer"
                title={account?.nativeSegwit?.address ? `View ${account.nativeSegwit.address} on mempool.space` : 'No address'}
              >
                +{balances.pendingTxCount.p2wpkh}
              </a>
              <span className="text-[color:var(--sf-text)]/40">/</span>
              <a
                href={account?.taproot?.address ? `https://mempool.space/address/${account.taproot.address}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#5b9cff] transition-colors cursor-pointer"
                title={account?.taproot?.address ? `View ${account.taproot.address} on mempool.space` : 'No address'}
              >
                +{balances.pendingTxCount.p2tr}
              </a>
            </div>
            <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">bc1q / bc1p</div>
          </div>
        </div>
      </div>

      {/* Token Assets - 2 column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Protorune Assets (like Alkanes) */}
        <div className="rounded-xl border border-[color:var(--sf-outline)] bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Coins size={24} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Protorune Assets (like Alkanes)</h3>
          </div>

          {balances.alkanes.length > 0 ? (
            <div className="space-y-3">
              {balances.alkanes.map((alkane) => (
                <div
                  key={alkane.alkaneId}
                  className="flex items-center justify-between p-4 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] hover:bg-[color:var(--sf-primary)]/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Token Logo */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {alkane.symbol?.slice(0, 2).toUpperCase() || '??'}
                    </div>
                    <div>
                      <div className="font-medium text-[color:var(--sf-text)]">{alkane.symbol}</div>
                      <div className="text-xs text-[color:var(--sf-text)]/40">ID: {alkane.alkaneId}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[color:var(--sf-text)] font-mono">
                      {formatAlkaneBalance(alkane.balance, alkane.decimals)}
                    </div>
                    <div className="text-xs text-[color:var(--sf-text)]/60">$X.XX</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[color:var(--sf-text)]/60">
              No protorune assets found
              <div className="text-xs text-[color:var(--sf-text)]/40 mt-2">
                Protorune assets (like Alkanes) will appear here once detected
              </div>
            </div>
          )}
        </div>

        {/* Inscription Assets (like BRC20) */}
        <div className="rounded-xl border border-[color:var(--sf-outline)] bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
              <Coins size={24} className="text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Inscription Assets (like BRC20)</h3>
          </div>

          <div className="text-center py-8 text-[color:var(--sf-text)]/60">
            No inscription assets found
            <div className="text-xs text-[color:var(--sf-text)]/40 mt-2">
              Inscription assets (like BRC20) will appear here once detected
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
