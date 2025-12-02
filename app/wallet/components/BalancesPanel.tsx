'use client';

import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { Bitcoin, Coins, DollarSign, RefreshCw, Loader2 } from 'lucide-react';

export default function BalancesPanel() {
  const { account } = useWallet() as any;
  const { bitcoinPrice } = useAlkanesSDK();
  const { balances, utxos, isLoading, error, refresh } = useEnrichedWalletData();

  const formatBTC = (sats: number) => {
    return (sats / 100000000).toFixed(8);
  };

  const formatUSD = (sats: number) => {
    if (!bitcoinPrice) return null;
    const btc = sats / 100000000;
    return (btc * bitcoinPrice.usd).toFixed(2);
  };

  const formatAlkaneBalance = (balance: string, decimals: number = 8) => {
    const value = BigInt(balance);
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const remainder = value % divisor;
    return `${whole}.${remainder.toString().padStart(decimals, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-white/60" size={32} />
        <div className="ml-3 text-white/60">Loading wallet data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <button
          onClick={refresh}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors"
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
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-500/20 border border-orange-500/30">
              <Bitcoin size={28} className="text-orange-400" />
            </div>
            <div>
              <div className="text-sm text-white/60 mb-1">Bitcoin Balance</div>
              <div className="text-3xl font-bold text-white">{totalBTC} BTC</div>
              {totalUSD && (
                <div className="text-sm text-white/60 flex items-center gap-1 mt-1">
                  <DollarSign size={12} />
                  <span>${totalUSD} USD</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors text-white/60 hover:text-white/80 disabled:opacity-50"
            title="Refresh balances"
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Balance Breakdown */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs text-white/60 mb-1">Total Balance</div>
            <div className="font-mono text-sm text-white">{formatBTC(balances.bitcoin.total)} BTC</div>
          </div>
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
            <div className="text-xs text-green-400/80 mb-1">Spendable (Plain BTC)</div>
            <div className="font-mono text-sm text-green-400">
              {(() => {
                // Calculate spendable (UTXOs without inscriptions/runes/alkanes)
                const spendableSats = utxos.all
                  .filter((u: any) => 
                    !u.inscriptions?.length && 
                    !Object.keys(u.runes || {}).length && 
                    !Object.keys(u.alkanes || {}).length
                  )
                  .reduce((sum: number, u: any) => sum + u.value, 0);
                return formatBTC(spendableSats);
              })()} BTC
            </div>
          </div>
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
            <div className="text-xs text-yellow-400/80 mb-1">With Assets</div>
            <div className="font-mono text-sm text-yellow-400">
              {(() => {
                // Calculate UTXOs containing inscriptions/runes/alkanes
                const assetSats = utxos.all
                  .filter((u: any) => 
                    u.inscriptions?.length > 0 || 
                    Object.keys(u.runes || {}).length > 0 || 
                    Object.keys(u.alkanes || {}).length > 0
                  )
                  .reduce((sum: number, u: any) => sum + u.value, 0);
                return formatBTC(assetSats);
              })()} BTC
            </div>
          </div>
        </div>

        {/* Address Breakdown */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10 mt-4">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs text-white/60 mb-1">Native SegWit (P2WPKH)</div>
            <div className="font-mono text-sm text-white">{formatBTC(balances.bitcoin.p2wpkh)} BTC</div>
            {account?.nativeSegwit && (
              <div className="text-xs text-white/40 mt-1 truncate" title={account.nativeSegwit.address}>
                {account.nativeSegwit.address.slice(0, 12)}...
              </div>
            )}
          </div>
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-3">
            <div className="text-xs text-white/60 mb-1">Taproot (P2TR)</div>
            <div className="font-mono text-sm text-white">{formatBTC(balances.bitcoin.p2tr)} BTC</div>
            {account?.taproot && (
              <div className="text-xs text-white/40 mt-1 truncate" title={account.taproot.address}>
                {account.taproot.address.slice(0, 12)}...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alkanes Balances */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
            <Coins size={24} className="text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-white">Alkane Assets</h3>
        </div>

        {balances.alkanes.length > 0 ? (
          <div className="space-y-3">
            {balances.alkanes.map((alkane) => (
              <div
                key={alkane.alkaneId}
                className="flex items-center justify-between p-4 rounded-lg bg-[color:var(--sf-primary)]/5 border border-white/10 hover:bg-[color:var(--sf-primary)]/10 transition-colors"
              >
                <div>
                  <div className="font-medium text-white">{alkane.name}</div>
                  <div className="text-sm text-white/60">{alkane.symbol}</div>
                  {alkane.alkaneId && (
                    <div className="text-xs text-white/40 mt-1">ID: {alkane.alkaneId}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-bold text-white font-mono">
                    {formatAlkaneBalance(alkane.balance, alkane.decimals)}
                  </div>
                  <div className="text-xs text-white/60">{alkane.symbol}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-white/60">
            No alkane assets found
            <div className="text-xs text-white/40 mt-2">
              Alkane balances will appear here once detected
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
