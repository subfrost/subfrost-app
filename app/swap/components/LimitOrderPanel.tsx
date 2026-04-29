/**
 * LimitOrderPanel.tsx
 *
 * UI panel for placing limit orders on the Carbine CLOB. Handles the buy/sell
 * toggle, price/amount inputs, fee selection, and transaction submission via
 * useLimitOrderMutation.
 *
 * =============================================================================
 * ARCHITECTURE: useLimitOrderMutation (DO NOT bypass)
 * =============================================================================
 * All order placement routes through useLimitOrderMutation → useSandshrewProvider
 * → execute.ts. This is critical for devnet: execute.ts detects localhost:18888
 * and switches to alkanesExecuteFull (primary indexer, always complete). The raw
 * SDK provider uses quspo (stale on devnet) and causes "Insufficient alkanes: have 0".
 *
 * =============================================================================
 * CARBINE CLOB — PlaceLimitOrder (opcode 20) call format
 * =============================================================================
 *   protostone: [cBlock, cTx, 20, aBlock, aTx, 32, 0, sideNum, priceScaled, amountScaled]
 *   side: 0=buy, 1=sell
 *   priceScaled  = Math.floor(parseFloat(price)  * 1e8)
 *   amountScaled = Math.floor(parseFloat(amount) * 1e8)
 *
 *   For sell: inputReqs = '2:0:{amountScaled}'  (send DIESEL, the base token)
 *   For buy:  inputReqs = '32:0:{priceScaled * amountScaled / 1e8}'  (send frBTC)
 *
 * =============================================================================
 * KNOWN ISSUE (2026-04-01): Sell orders show corrupted amounts in orderbook
 * =============================================================================
 * Buy orders (side=0) display correctly. Sell orders (side=1) confirmed on-chain
 * (opcode 25 count increments) but depth query returns 10 entries all with
 * U128_MAX amounts. Root cause investigation (2026-04-01):
 *
 * CONFIRMED from carbine-controller/src/lib.rs:
 *   - _get_orderbook_depth does NOT pad — uses break, returns real count
 *   - Ask prices ARE un-inverted by contract (line 760: real_price = MAX - token_id)
 *   - 10 all-0xff ask entries = trie has 10 real keys but level amounts = MAX
 *   - Most likely cause: devnet OOM crash mid-write corrupted level storage
 *
 * FIXES APPLIED in useOrderbook.ts:
 *   1. Removed double-un-inversion of ask prices (was inverting already-real prices)
 *   2. Replaced U128_MAX filter with MAX_SANE_AMOUNT guard (1e18) + warning
 *   3. Removed wrong deduplication (bids/asks in separate trie halves, no echo)
 *   4. Added [QA] bestBid/bestAsk diagnostics for BOTH pair orderings
 *   5. Parallel depth queries with better pair selection logic
 *
 * DIAGNOSIS: After fresh devnet reset + sell order placement, observe:
 *   [QA] pair X/Y bestAsk: price=N, amount=M  ← sell IS in trie
 *   [QA] depth pair X/Y: numBids=0 numAsks=1  ← correct
 * If all [QA] bestAsk still shows corrupted data → devnet reset needed
 * =============================================================================
 */

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTheme } from '@/context/ThemeContext';
import { useModalStore } from '@/stores/modals';
import { TrendingUp, TrendingDown, Loader2, ChevronDown, Settings } from 'lucide-react';
import NumberField from '@/app/components/NumberField';
import TokenIcon from '@/app/components/TokenIcon';
import { useGlobalStore } from '@/stores/global';
import { useFeeRate, type FeeSelection } from '@/hooks/useFeeRate';
import { useNotification } from '@/context/NotificationContext';
import { useLimitOrderMutation } from '@/hooks/useLimitOrderMutation';
import { useOrderbook } from '@/hooks/useOrderbook';
import { useTranslation } from '@/hooks/useTranslation';
import { getConfig } from '@/utils/getConfig';
import type { TokenMeta } from '../types';
import type { Network } from '@/utils/constants';

interface Props {
  baseToken: string;
  quoteToken: string;
  selectedPrice?: string;
  fromToken?: TokenMeta;
  toToken?: TokenMeta;
  fromBalanceText?: string;
  fromFiatText?: string;
  calculateUsdValue?: (tokenId?: string, amount?: string) => string;
  onPercentFrom?: (percent: number) => void;
  onMaxFrom?: () => void;
  network?: Network;
}

export default function LimitOrderPanel({
  baseToken,
  quoteToken,
  selectedPrice,
  fromToken,
  toToken,
  fromBalanceText,
  fromFiatText = '$0.00',
  calculateUsdValue,
  onPercentFrom,
  onMaxFrom,
  network,
}: Props) {
  const { isConnected, onConnectModalOpenChange } = useWallet();
  const { theme } = useTheme();
  const { openTokenSelector } = useModalStore();
  const { deadlineBlocks, setDeadlineBlocks } = useGlobalStore();
  const fee = useFeeRate();
  const { t } = useTranslation();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [priceFocused, setPriceFocused] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deadlineLocal, setDeadlineLocal] = useState(String(deadlineBlocks));
  const priceInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Sync price from orderbook click
  useEffect(() => {
    if (selectedPrice) setPrice(selectedPrice);
  }, [selectedPrice]);

  // Last traded price source — orderbook midpoint (best bid/ask average).
  const { data: orderbook } = useOrderbook(fromToken?.id, toToken?.id);
  const lastPrice = useMemo(() => {
    const raw = orderbook?.midPrice?.replace(/,/g, '') ?? '';
    const n = parseFloat(raw);
    return isFinite(n) && n > 0 ? raw : '';
  }, [orderbook?.midPrice]);

  const total = useMemo(() => {
    if (!price || !amount) return '';
    const p = parseFloat(price);
    const a = parseFloat(amount);
    if (isNaN(p) || isNaN(a)) return '';
    return (p * a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [price, amount]);

  const amountFiatText = useMemo(() => {
    if (calculateUsdValue) return calculateUsdValue(fromToken?.id, amount);
    return fromFiatText;
  }, [calculateUsdValue, fromToken?.id, amount, fromFiatText]);

  const priceFiatText = useMemo(() => {
    if (!calculateUsdValue) return '$0.00';
    const p = parseFloat(price);
    const a = parseFloat(amount);
    if (!isFinite(p) || !isFinite(a) || p <= 0 || a <= 0) return '$0.00';
    return calculateUsdValue(toToken?.id, String(p * a));
  }, [calculateUsdValue, toToken?.id, price, amount]);

  const limitOrderMutation = useLimitOrderMutation();
  const isSubmitting = limitOrderMutation.isPending;
  const { showNotification } = useNotification();

  const handleSubmit = async () => {
    console.log('[QA] handleSubmit called:', { price, amount, isConnected, side, network });
    if (!price || !amount || !isConnected) {
      console.log('[QA] handleSubmit blocked — missing:', { price: !price, amount: !amount, isConnected: !isConnected });
      return;
    }
    try {
      const effectiveNetwork = network || 'devnet';
      const config = getConfig(effectiveNetwork);
      const controllerId = (config as any).CARBINE_CONTROLLER_ID;
      if (!controllerId) throw new Error('Carbine controller not configured for this network');

      const baseTokenId = fromToken?.id || '2:0';
      const quoteTokenId = '32:0';
      const priceScaled = Math.floor(parseFloat(price) * 1e8).toString();
      const amountScaled = Math.floor(parseFloat(amount) * 1e8).toString();

      console.log('[QA] handleSubmit params:', { controllerId, baseTokenId, quoteTokenId, side, priceScaled, amountScaled, network: effectiveNetwork });

      const result = await limitOrderMutation.mutateAsync({
        controllerId,
        baseTokenId,
        quoteTokenId,
        side: side === 'buy' ? 0 : 1,
        price: priceScaled,
        amount: amountScaled,
        feeRate: Math.round(fee.feeRate),
      });

      if (result.transactionId) {
        // Limit order: side='buy' wants base for quote; side='sell' gives base for quote.
        const fromSym = side === 'sell' ? (fromToken?.symbol || '') : (toToken?.symbol || '');
        const toSym = side === 'sell' ? (toToken?.symbol || '') : (fromToken?.symbol || '');
        const fromId = side === 'sell' ? fromToken?.id : toToken?.id;
        const toId = side === 'sell' ? toToken?.id : fromToken?.id;
        showNotification(result.transactionId, 'swap' as any, undefined, {
          fromSymbol: fromSym, toSymbol: toSym,
          fromId, toId,
          fromAmount: amount, toAmount: total.replace(/,/g, ''),
        });
      }
    } catch (e: any) {
      console.error('[LimitOrder] Failed:', e);
      window.alert?.(`Limit order failed: ${e?.message || 'Unknown error'}`);
    }
  };

  const resolvedBalanceText = fromBalanceText ?? 'Balance --';

  const activePercent = useMemo((): number | null => {
    if (!amount || !resolvedBalanceText) return null;
    const balanceMatch = resolvedBalanceText.match(/[\d.]+/);
    if (!balanceMatch) return null;
    const balance = parseFloat(balanceMatch[0]);
    const amt = parseFloat(amount);
    if (!balance || balance === 0 || !amt) return null;
    const tolerance = 0.0001;
    if (Math.abs(amt - balance * 0.25) < tolerance) return 0.25;
    if (Math.abs(amt - balance * 0.5) < tolerance) return 0.5;
    if (Math.abs(amt - balance * 0.75) < tolerance) return 0.75;
    if (Math.abs(amt - balance) < tolerance) return 1;
    return null;
  }, [amount, resolvedBalanceText]);

  return (
    <div className="flex flex-col h-full p-4">
      {/* Buy/Sell toggle */}
      <div className="sf-tab-group w-full mb-3">
        <button
          onClick={() => setSide('buy')}
          className={`sf-tab-btn flex-1 flex items-center justify-center gap-1.5 ${
            side === 'buy' ? 'sf-tab-btn--active' : ''
          }`}
          style={side === 'buy' ? { '--sf-tab-active-bg': '#16a34a' } as React.CSSProperties : undefined}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          BUY
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`sf-tab-btn flex-1 flex items-center justify-center gap-1.5 ${
            side === 'sell' ? 'sf-tab-btn--active' : ''
          }`}
          style={side === 'sell' ? { '--sf-tab-active-bg': '#dc2626' } as React.CSSProperties : undefined}
        >
          <TrendingDown className="h-3.5 w-3.5" />
          SELL
        </button>
      </div>

      {/* AMOUNT — matches market swap input card */}
      <div className={`relative mb-1 ${amountFocused ? 'z-30' : ''}`}>
        <div
          className="sf-input group relative z-20 px-4 pt-4 pb-3 cursor-text"
          onClick={() => amountInputRef.current?.focus()}
        >
          {/* Token Selector - floating top-right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTokenSelector('from');
            }}
            className="sf-tile absolute right-4 top-4 inline-flex items-center gap-2 px-3 py-2 !rounded-[0.375rem] focus:outline-none z-10"
          >
            {fromToken && (
              <TokenIcon
                key={`limit-from-${fromToken.id}-${fromToken.symbol}`}
                symbol={fromToken.symbol}
                id={fromToken.id}
                iconUrl={fromToken.iconUrl}
                size="sm"
                network={network}
              />
            )}
            <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
              {fromToken?.name || fromToken?.symbol || baseToken}
            </span>
            <ChevronDown size={16} className="text-[color:var(--sf-text)]/60 flex-shrink-0" />
          </button>

          {/* Main content area */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">
              AMOUNT
            </span>

            <div className="pr-32">
              <NumberField
                ref={amountInputRef}
                placeholder="0.00"
                align="left"
                value={amount}
                onChange={(v) => setAmount(v)}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
              />
            </div>

            {/* Fiat value + Balance */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-[color:var(--sf-text)]/50">
                Market: {amountFiatText}
              </div>
              <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                {resolvedBalanceText}
              </div>
            </div>

            {/* Percentage Buttons (sell only) */}
            {side === 'sell' && (
              <div
                className="flex items-center justify-end w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${
                  amountFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  {[0.25, 0.5, 0.75].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        const balanceMatch = resolvedBalanceText.match(/[\d.]+/);
                        if (balanceMatch) {
                          const bal = parseFloat(balanceMatch[0]);
                          if (bal > 0) setAmount(String(bal * pct));
                        }
                      }}
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                        activePercent === pct
                          ? 'bg-[color:var(--sf-primary)]/20'
                          : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`
                      }`}
                    >
                      {pct * 100}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const balanceMatch = resolvedBalanceText.match(/[\d.]+/);
                      if (balanceMatch) {
                        const bal = parseFloat(balanceMatch[0]);
                        if (bal > 0) setAmount(String(bal));
                      }
                    }}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                      activePercent === 1
                        ? 'bg-[color:var(--sf-primary)]/20'
                        : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`
                    }`}
                  >
                    MAX
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>

      {/* Price input — sf-input card style */}
      <div className={`relative mb-3 ${priceFocused ? 'z-30' : ''}`}>
        <div
          className="sf-input group relative z-20 px-4 pt-4 pb-3 cursor-text"
          onClick={() => priceInputRef.current?.focus()}
        >
          {/* "Last" button - floating top-right */}
          <button
            type="button"
            disabled={!lastPrice}
            onClick={(e) => {
              e.stopPropagation();
              if (lastPrice) setPrice(lastPrice);
            }}
            className="absolute right-4 top-4 text-[10px] font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary)]/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Last
          </button>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
              PRICE
            </span>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <NumberField
                  ref={priceInputRef}
                  placeholder="0.00"
                  align="left"
                  value={price}
                  onChange={(v) => setPrice(v)}
                  onFocus={() => setPriceFocused(true)}
                  onBlur={() => setPriceFocused(false)}
                />
              </div>
              <span className="text-xs font-medium text-[color:var(--sf-text)]/40 uppercase whitespace-nowrap">
                {quoteToken} per {baseToken}
              </span>
            </div>

            <div className="text-xs font-medium text-[color:var(--sf-text)]/50">
              {priceFiatText}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Details — collapsible panel matching SwapSummary */}
      <div className="sf-panel overflow-visible mt-3 mb-6">
        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="sf-collapsible-trigger"
        >
          <span>{t('vaultDeposit.transactionDetails')}</span>
          <Settings
            size={14}
            className={`transition-transform duration-300 ${detailsOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Collapsible details content */}
        <div className={`transition-all duration-300 ease-in-out ${detailsOpen ? 'max-h-[500px] opacity-100 pb-4 overflow-visible' : 'max-h-0 opacity-0 pb-0 overflow-hidden'}`}>
          <div className="flex flex-col gap-2.5 px-4 pt-3">
            {/* Deadline (blocks) */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                {t('swapSummary.deadlineBlocks')}
              </span>
              <div className="relative">
                <input
                  aria-label="Transaction deadline in blocks"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={deadlineLocal}
                  onChange={(e) => setDeadlineLocal(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(deadlineLocal, 10);
                    if (!deadlineLocal || isNaN(val) || val < 1) {
                      setDeadlineLocal('3');
                      setDeadlineBlocks(3);
                    } else {
                      setDeadlineBlocks(Math.min(100, val));
                    }
                  }}
                  placeholder="3"
                  className="sf-pill-input"
                />
              </div>
            </div>

            {/* Miner Fee Rate */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                {t('swapSummary.minerFeeRate')}
              </span>
              <div className="flex items-center gap-2">
                {fee.selection === 'custom' ? (
                  <div className="relative">
                    <input
                      aria-label="Custom miner fee rate"
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={fee.custom}
                      onChange={(e) => fee.setCustom(e.target.value)}
                      onBlur={() => {
                        if (!fee.custom) {
                          fee.setCustom(String(fee.presets.medium));
                        }
                      }}
                      placeholder="0"
                      className="sf-pill-input"
                    />
                  </div>
                ) : (
                  <span className="font-semibold text-[color:var(--sf-text)]">
                    {Math.round(fee.feeRate)}
                  </span>
                )}
                <MinerFeeDropdown
                  selection={fee.selection}
                  setSelection={fee.setSelection}
                  presets={fee.presets}
                />
              </div>
            </div>

            {/* Pay / Sell */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                {side === 'buy' ? 'Pay' : 'Sell'}
              </span>
              <span className="font-semibold text-[color:var(--sf-text)] font-mono tabular-nums">
                {total
                  ? (side === 'buy' ? `${total} ${quoteToken}` : `${amount} ${baseToken}`)
                  : '--'}
              </span>
            </div>

            {/* Receive */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                Receive
              </span>
              <span className={`font-semibold font-mono tabular-nums ${side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                {total
                  ? (side === 'buy' ? `${amount} ${baseToken}` : `${total} ${quoteToken}`)
                  : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={() => {
          if (isSubmitting) return;
          if (!isConnected) {
            onConnectModalOpenChange(true);
            return;
          }
          handleSubmit();
        }}
        disabled={isSubmitting || (isConnected && (!price || !amount))}
        className={
          !isConnected
            ? `mt-2 h-12 w-full rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                side === 'sell'
                  ? 'bg-gradient-to-r from-[#ef4444] to-[#b91c1c]'
                  : 'bg-gradient-to-r from-[#22c55e] to-[#15803d]'
              }`
            : `mt-2 w-full py-3 text-sm font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white ${
                side === 'buy'
                  ? 'bg-[#22c55e] hover:bg-[#16a34a] shadow-lg shadow-green-900/20'
                  : 'bg-[#ef4444] hover:bg-[#dc2626] shadow-lg shadow-red-900/20'
              }`
        }
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : !isConnected ? (
          t('swap.connectWallet')
        ) : !price || !amount ? (
          'Enter Amount & Price'
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

/* ── Miner Fee Dropdown (matches SwapSummary's MinerFeeButton) ── */

function MinerFeeDropdown({
  selection,
  setSelection,
  presets,
}: {
  selection: FeeSelection;
  setSelection: (s: FeeSelection) => void;
  presets: { slow: number; medium: number; fast: number };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const labels: Record<string, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast', custom: 'Custom' };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`sf-dropdown-trigger ${isOpen ? 'sf-dropdown-trigger--open' : ''}`}
      >
        <span>{labels[selection]}</span>
        <ChevronDown size={12} className={`transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="sf-dropdown absolute right-0 mt-1 z-50 w-32">
          {(['slow', 'medium', 'fast', 'custom'] as FeeSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { setSelection(option); setIsOpen(false); }}
              className={`w-full px-3 py-2 text-left text-xs font-semibold transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{labels[option]}</span>
                {option !== 'custom' && (
                  <span className="text-[10px] text-[color:var(--sf-text)]/50">
                    {presets[option as keyof typeof presets]}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
