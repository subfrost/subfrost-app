'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

interface Props {
  baseToken: string;
  quoteToken: string;
  selectedPrice?: string;
}

export default function LimitOrderPanel({ baseToken, quoteToken, selectedPrice }: Props) {
  const { isConnected } = useWallet();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync price from orderbook click
  useEffect(() => {
    if (selectedPrice) setPrice(selectedPrice);
  }, [selectedPrice]);

  const total = useMemo(() => {
    if (!price || !amount) return '';
    const p = parseFloat(price);
    const a = parseFloat(amount);
    if (isNaN(p) || isNaN(a)) return '';
    return (p * a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [price, amount]);

  const handleSubmit = async () => {
    if (!price || !amount) return;
    setIsSubmitting(true);
    // TODO: call carbine controller PlaceLimitOrder (opcode 20)
    setTimeout(() => setIsSubmitting(false), 1000);
  };

  const percentButtons = [25, 50, 75, 100];

  return (
    <div className="flex flex-col h-full p-4">
      {/* Buy/Sell toggle */}
      <div className="flex gap-1 p-1 bg-[color:var(--sf-surface)] rounded-lg mb-3">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all ${
            side === 'buy'
              ? 'bg-green-600 text-white shadow-sm shadow-green-900/30'
              : 'text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/70'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          BUY
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all ${
            side === 'sell'
              ? 'bg-red-600 text-white shadow-sm shadow-red-900/30'
              : 'text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/70'
          }`}
        >
          <TrendingDown className="h-3.5 w-3.5" />
          SELL
        </button>
      </div>

      {/* Price input */}
      <div className="mb-2">
        <div className="flex justify-between mb-1">
          <label className="text-[10px] text-[color:var(--sf-text)]/40 uppercase tracking-wider">Price</label>
          <button className="text-[10px] text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary)]/80 transition-colors">
            Last
          </button>
        </div>
        <div className="flex rounded-lg overflow-hidden bg-[color:var(--sf-surface)] border border-transparent focus-within:border-[color:var(--sf-primary)]/30 transition-colors">
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="flex-1 px-3 py-2.5 bg-transparent text-base font-medium text-[color:var(--sf-text)] outline-none tabular-nums min-w-0 placeholder:text-[color:var(--sf-text)]/20 font-mono"
          />
          <span className="flex items-center pr-3 text-[10px] text-[color:var(--sf-text)]/30 font-semibold uppercase">
            {quoteToken}
          </span>
        </div>
      </div>

      {/* Amount input */}
      <div className="mb-2">
        <div className="flex justify-between mb-1">
          <label className="text-[10px] text-[color:var(--sf-text)]/40 uppercase tracking-wider">Amount</label>
          <span className="text-[10px] text-[color:var(--sf-text)]/30">
            Avail: <span className="text-[color:var(--sf-text)]/50 font-mono">--</span>
          </span>
        </div>
        <div className="flex rounded-lg overflow-hidden bg-[color:var(--sf-surface)] border border-transparent focus-within:border-[color:var(--sf-primary)]/30 transition-colors">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="flex-1 px-3 py-2.5 bg-transparent text-base font-medium text-[color:var(--sf-text)] outline-none tabular-nums min-w-0 placeholder:text-[color:var(--sf-text)]/20 font-mono"
          />
          <span className="flex items-center pr-3 text-[10px] text-[color:var(--sf-text)]/30 font-semibold uppercase">
            {baseToken}
          </span>
        </div>
        <div className="flex gap-1 mt-1.5">
          {percentButtons.map(pct => (
            <button
              key={pct}
              className="flex-1 py-1 text-[10px] font-semibold rounded bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/40 hover:bg-white/[0.08] hover:text-[color:var(--sf-text)]/60 transition-colors"
            >
              {pct === 100 ? 'MAX' : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="mb-3">
        <label className="text-[10px] text-[color:var(--sf-text)]/40 uppercase tracking-wider mb-1 block">Total</label>
        <div className="flex rounded-lg overflow-hidden bg-[color:var(--sf-surface)]/60">
          <input
            type="text"
            value={total}
            readOnly
            placeholder="0.00"
            className="flex-1 px-3 py-2.5 bg-transparent text-base font-medium text-[color:var(--sf-text)]/50 outline-none tabular-nums min-w-0 placeholder:text-[color:var(--sf-text)]/15 font-mono"
          />
          <span className="flex items-center pr-3 text-[10px] text-[color:var(--sf-text)]/30 font-semibold uppercase">
            {quoteToken}
          </span>
        </div>
      </div>

      {/* Order details (animated) */}
      <div className={`transition-all duration-200 ${price && amount ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden'}`}>
        <div className="p-2.5 mb-3 bg-[color:var(--sf-surface)]/50 rounded-lg space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-[color:var(--sf-text)]/35">Type</span>
            <span className="text-[color:var(--sf-text)]/70 font-medium">Limit {side.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[color:var(--sf-text)]/35">Execution</span>
            <span className="text-[color:var(--sf-text)]/70">Fill-or-Rest</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[color:var(--sf-text)]/35">{side === 'buy' ? 'Pay' : 'Sell'}</span>
            <span className="text-[color:var(--sf-text)]/80 font-mono tabular-nums">
              {side === 'buy' ? `${total} ${quoteToken}` : `${amount} ${baseToken}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[color:var(--sf-text)]/35">Receive</span>
            <span className={`font-mono tabular-nums ${side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {side === 'buy' ? `${amount} ${baseToken}` : `${total} ${quoteToken}`}
            </span>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isConnected || !price || !amount || isSubmitting}
        className={`w-full py-3 text-sm font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          side === 'buy'
            ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'
            : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20'
        }`}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : !isConnected ? (
          'Connect Wallet'
        ) : !price || !amount ? (
          'Enter Price & Amount'
        ) : (
          `${side === 'buy' ? 'Buy' : 'Sell'} ${baseToken}`
        )}
      </button>

      <p className="text-[9px] text-[color:var(--sf-text)]/20 text-center mt-2">
        Unfilled orders rest as immutable carbine alkanes
      </p>
    </div>
  );
}
