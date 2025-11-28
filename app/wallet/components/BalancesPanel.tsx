'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { Bitcoin, Coins } from 'lucide-react';

interface AlkaneBalance {
  name: string;
  symbol: string;
  balance: string;
  decimals: number;
}

export default function BalancesPanel() {
  const { address } = useWallet() as any;
  const [btcBalance, setBtcBalance] = useState<string>('0');
  const [alkaneBalances, setAlkaneBalances] = useState<AlkaneBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBalances() {
      setLoading(true);
      try {
        // TODO: Implement actual balance fetching using ts-sdk
        // For now, show placeholder data
        setBtcBalance('0.05234567');
        setAlkaneBalances([
          { name: 'Alkane Token', symbol: 'ALK', balance: '1000.50', decimals: 8 },
          { name: 'Example Asset', symbol: 'EXA', balance: '500.25', decimals: 8 },
        ]);
      } catch (error) {
        console.error('Failed to fetch balances:', error);
      } finally {
        setLoading(false);
      }
    }

    if (address) {
      fetchBalances();
    }
  }, [address]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-white/60">Loading balances...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bitcoin Balance */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <Bitcoin size={24} className="text-orange-400" />
            </div>
            <div>
              <div className="text-sm text-white/60">Bitcoin Balance</div>
              <div className="text-2xl font-bold">{btcBalance} BTC</div>
            </div>
          </div>
        </div>
      </div>

      {/* Alkanes Balances */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Coins size={24} className="text-blue-400" />
          <h3 className="text-xl font-bold">Alkane Balances</h3>
        </div>

        {alkaneBalances.length > 0 ? (
          <div className="space-y-3">
            {alkaneBalances.map((alkane) => (
              <div
                key={alkane.symbol}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10"
              >
                <div>
                  <div className="font-medium">{alkane.name}</div>
                  <div className="text-sm text-white/60">{alkane.symbol}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{alkane.balance}</div>
                  <div className="text-xs text-white/60">{alkane.symbol}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-white/60">
            No alkane balances found
          </div>
        )}
      </div>
    </div>
  );
}
