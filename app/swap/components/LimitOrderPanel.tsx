'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { TrendingUp, TrendingDown, Loader2, Clock, X } from 'lucide-react';

type OrderType = 'limit' | 'market';

interface OpenOrder {
  id: string;
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  filled: string;
  total: string;
  timestamp: number;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
}

interface Props {
  baseToken: string;
  quoteToken: string;
  selectedPrice?: string;
}

export default function LimitOrderPanel({ baseToken, quoteToken, selectedPrice }: Props) {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState<'order' | 'open' | 'history'>('order');

  // Sync price from orderbook click
  useEffect(() => {
    if (selectedPrice) {
      setPrice(selectedPrice);
    }
  }, [selectedPrice]);

  const total = useMemo(() => {
    if (!price || !amount) return '';
    const p = parseFloat(price);
    const a = parseFloat(amount);
    if (isNaN(p) || isNaN(a)) return '';
    return (p * a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [price, amount]);

  // Mock open orders (will connect to carbine controller)
  const openOrders: OpenOrder[] = useMemo(() => [
    { id: 'ord-1', side: 'buy', price: '99500.00', amount: '0.25', filled: '0.10', total: '24,875.00', timestamp: Date.now() - 3600000, status: 'partial' },
    { id: 'ord-2', side: 'sell', price: '100500.00', amount: '0.50', filled: '0.00', total: '50,250.00', timestamp: Date.now() - 7200000, status: 'open' },
  ], []);

  const handleSubmit = async () => {
    if (!price || !amount) return;
    setIsSubmitting(true);
    // TODO: call carbine controller PlaceLimitOrder (opcode 20)
    setTimeout(() => setIsSubmitting(false), 1000);
  };

  const handleCancel = async (orderId: string) => {
    // TODO: call carbine controller CancelOrder (opcode 21)
    console.log('Cancel order:', orderId);
  };

  const percentButtons = [25, 50, 75, 100];

  return (
    <div className="flex flex-col h-full rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm overflow-hidden">
      {/* Section tabs */}
      <div className="flex border-b border-[color:var(--sf-glass-border)]">
        {(['order', 'open', 'history'] as const).map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              activeSection === section
                ? 'text-[color:var(--sf-text)] border-b-2 border-[color:var(--sf-primary)]'
                : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/60'
            }`}
          >
            {section === 'order' ? 'Place Order' : section === 'open' ? `Open (${openOrders.length})` : 'History'}
          </button>
        ))}
      </div>

      {activeSection === 'order' ? (
        <div className="flex-1 p-4 flex flex-col">
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

          {/* Order type toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setOrderType('limit')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                orderType === 'limit'
                  ? 'bg-[color:var(--sf-primary)]/15 text-[color:var(--sf-primary)] border border-[color:var(--sf-primary)]/30'
                  : 'text-[color:var(--sf-text)]/40 border border-transparent hover:text-[color:var(--sf-text)]/60'
              }`}
            >
              Limit
            </button>
            <button
              onClick={() => setOrderType('market')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                orderType === 'market'
                  ? 'bg-[color:var(--sf-primary)]/15 text-[color:var(--sf-primary)] border border-[color:var(--sf-primary)]/30'
                  : 'text-[color:var(--sf-text)]/40 border border-transparent hover:text-[color:var(--sf-text)]/60'
              }`}
            >
              Market
            </button>
          </div>

          {/* Price input (hidden for market orders) */}
          {orderType === 'limit' && (
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
          )}

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
            {/* Percent buttons */}
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

          {/* Total (read-only) */}
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

          {/* Order details */}
          <div className={`transition-all duration-200 ${price && amount ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden'}`}>
            <div className="p-2.5 mb-3 bg-[color:var(--sf-surface)]/50 rounded-lg space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/35">Type</span>
                <span className="text-[color:var(--sf-text)]/70 font-medium">{orderType === 'limit' ? 'Limit' : 'Market'} {side.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/35">Execution</span>
                <span className="text-[color:var(--sf-text)]/70">{orderType === 'limit' ? 'Fill-or-Rest' : 'Immediate'}</span>
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
            disabled={!isConnected || (!price && orderType === 'limit') || !amount || isSubmitting}
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
            ) : (!price && orderType === 'limit') || !amount ? (
              `Enter ${!price && orderType === 'limit' ? 'Price' : 'Amount'}`
            ) : (
              `${side === 'buy' ? 'Buy' : 'Sell'} ${baseToken}`
            )}
          </button>

          <p className="text-[9px] text-[color:var(--sf-text)]/20 text-center mt-2">
            Unfilled orders rest as immutable carbine alkanes
          </p>
        </div>
      ) : activeSection === 'open' ? (
        /* Open Orders Section */
        <div className="flex-1 overflow-y-auto">
          {openOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[color:var(--sf-text)]/20">
              <Clock className="h-8 w-8 mb-2" />
              <span className="text-xs">No open orders</span>
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--sf-glass-border)]/30">
              {openOrders.map(order => {
                const filledPct = parseFloat(order.filled) / parseFloat(order.amount) * 100;
                return (
                  <div key={order.id} className="p-3 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          order.side === 'buy' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {order.side.toUpperCase()}
                        </span>
                        <span className="text-[11px] text-[color:var(--sf-text)]/70 font-mono">
                          {baseToken}/{quoteToken}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCancel(order.id)}
                        className="p-1 rounded hover:bg-red-500/10 text-[color:var(--sf-text)]/30 hover:text-red-400 transition-colors"
                        title="Cancel order"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-[color:var(--sf-text)]/30 block">Price</span>
                        <span className="text-[color:var(--sf-text)]/70 font-mono tabular-nums">{order.price}</span>
                      </div>
                      <div>
                        <span className="text-[color:var(--sf-text)]/30 block">Amount</span>
                        <span className="text-[color:var(--sf-text)]/70 font-mono tabular-nums">{order.amount}</span>
                      </div>
                      <div>
                        <span className="text-[color:var(--sf-text)]/30 block">Filled</span>
                        <span className="text-[color:var(--sf-text)]/70 font-mono tabular-nums">{filledPct.toFixed(0)}%</span>
                      </div>
                    </div>
                    {/* Fill progress bar */}
                    <div className="mt-1.5 h-1 bg-[color:var(--sf-surface)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${order.side === 'buy' ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                        style={{ width: `${filledPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Trade History Section */
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center justify-center py-12 text-[color:var(--sf-text)]/20">
            <Clock className="h-8 w-8 mb-2" />
            <span className="text-xs">No trade history</span>
          </div>
        </div>
      )}
    </div>
  );
}
