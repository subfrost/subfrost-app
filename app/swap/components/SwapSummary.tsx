'use client';

import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { usePoolFee } from '@/hooks/usePoolFee';
import { useAlkanesTokenPairs } from '@/hooks/useAlkanesTokenPairs';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import type { SwapQuote } from '../types';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useMemo } from 'react';
import { useGlobalStore } from '@/stores/global';
import type { SlippageSelection } from '@/stores/global';

import type { FeeSelection } from '@/hooks/useFeeRate';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

type Props = {
  sellId: string;
  buyId: string;
  sellName?: string;
  buyName?: string;
  direction: 'sell' | 'buy';
  quote: SwapQuote | null | undefined;
  isCalculating: boolean;
  feeRate: number;
  network?: 'mainnet' | 'testnet';
  isCrossChainFrom?: boolean;
  feeSelection?: FeeSelection;
  setFeeSelection?: (s: FeeSelection) => void;
  customFee?: string;
  setCustomFee?: (v: string) => void;
  feePresets?: { slow: number; medium: number; fast: number };
};

export default function SwapSummary({ sellId, buyId, sellName, buyName, direction, quote, isCalculating, feeRate, network: networkProp, isCrossChainFrom, feeSelection = 'medium', setFeeSelection, customFee = '', setCustomFee, feePresets = { slow: 2, medium: 8, fast: 25 } }: Props) {
  const { network: walletNetwork } = useWallet();
  const network = networkProp || walletNetwork;
  const { t } = useTranslation();
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = getConfig(network);
  const { maxSlippage, setMaxSlippage, slippageSelection, setSlippageSelection, deadlineBlocks, setDeadlineBlocks } = useGlobalStore();

  // Single state to track which settings field is focused (only one can be focused at a time)
  const [focusedField, setFocusedField] = useState<'deadline' | 'slippage' | 'fee' | null>(null);
  // Collapsible details (all screen sizes)
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Local deadline state to allow empty field while typing
  const [deadlineLocal, setDeadlineLocal] = useState(String(deadlineBlocks));
  const normalizedSell = sellId === 'btc' ? FRBTC_ALKANE_ID : sellId;
  const normalizedBuy = buyId === 'btc' ? FRBTC_ALKANE_ID : buyId;
  
  // Fetch dynamic frBTC wrap/unwrap fee
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
  
  // Fetch token display info for route tokens
  const routeTokenIds = useMemo(() => {
    if (!quote?.route) return [];
    return quote.route.filter(id => id !== normalizedSell && id !== normalizedBuy);
  }, [quote?.route, normalizedSell, normalizedBuy]);
  const { data: tokenDisplayMap } = useTokenDisplayMap(routeTokenIds);

  const { data: sellPairs } = useAlkanesTokenPairs(normalizedSell);
  const directPair = sellPairs?.find(
    (p: any) =>
      (p.token0.id === normalizedSell && p.token1.id === normalizedBuy) ||
      (p.token0.id === normalizedBuy && p.token1.id === normalizedSell),
  );
  const { data: poolFee } = usePoolFee(directPair?.poolId);

  let poolFeeText: string | null = null;
  if (quote && poolFee && directPair) {
    const ammSellAmount = sellId === 'btc'
      ? BigNumber(quote.sellAmount)
          .multipliedBy(1000 - wrapFee)
          .dividedBy(1000)
          .integerValue(BigNumber.ROUND_FLOOR)
      : BigNumber(quote.sellAmount);
    const feeAmount = ammSellAmount.multipliedBy(poolFee);
    // Use 8 decimals for BTC/frBTC, 2 for other tokens
    const isBtcToken = sellId === 'btc' || sellId === FRBTC_ALKANE_ID || sellName === 'BTC' || sellName === 'frBTC';
    const decimals = isBtcToken ? 8 : 2;
    poolFeeText = `${formatAlks(feeAmount.toString(), decimals, decimals)} ${sellName ?? sellId}`;
  }

  // Calculate slippage tolerance (difference between quote and minimum/maximum)
  let slippagePercent: number | null = null;
  if (quote) {
    if (direction === 'sell') {
      const buyAmount = BigNumber(quote.buyAmount);
      const minReceived = BigNumber(quote.minimumReceived);
      if (buyAmount.isGreaterThan(0)) {
        slippagePercent = buyAmount.minus(minReceived).dividedBy(buyAmount).multipliedBy(100).toNumber();
      }
    } else {
      const sellAmount = BigNumber(quote.sellAmount);
      const maxSent = BigNumber(quote.maximumSent);
      if (sellAmount.isGreaterThan(0)) {
        slippagePercent = maxSent.minus(sellAmount).dividedBy(sellAmount).multipliedBy(100).toNumber();
      }
    }
  }

  const hasHighSlippage = slippagePercent !== null && slippagePercent > 5.01;
  const hasWarningSlippage = slippagePercent !== null && slippagePercent > 1 && slippagePercent <= 5.01;

  // Get swap route from quote
  const getSwapRoute = () => {
    // Use route from quote if available (multi-hop)
    if (quote?.route && quote.route.length > 2) {
      return quote.route.map((tokenId, index) => {
        let symbol = tokenId;
        let label = tokenId;
        
        if (tokenId === normalizedSell) {
          symbol = sellName || sellId;
          label = sellName || sellId;
        } else if (tokenId === normalizedBuy) {
          symbol = buyName || buyId;
          label = buyName || buyId;
        } else if (tokenId === FRBTC_ALKANE_ID) {
          symbol = 'frBTC';
          label = 'frBTC';
        } else {
          // Try to get display name from tokenDisplayMap
          const displayToken = tokenDisplayMap?.[tokenId];
          if (displayToken) {
            symbol = displayToken.symbol || displayToken.name || tokenId;
            label = displayToken.name || displayToken.symbol || tokenId;
          }
        }
        
        return { id: tokenId, symbol, label };
      });
    }
    
    // Handle BTC wrap/unwrap cases
    if (sellId === 'btc' && buyId !== 'frbtc' && buyId !== FRBTC_ALKANE_ID) {
      return [
        { id: 'btc', symbol: 'BTC', label: 'BTC' },
        { id: 'frbtc', symbol: 'frBTC', label: 'Wrap' },
        { id: buyId, symbol: buyName || buyId, label: buyName || buyId }
      ];
    } else if (buyId === 'btc' && sellId !== 'frbtc' && sellId !== FRBTC_ALKANE_ID) {
      return [
        { id: sellId, symbol: sellName || sellId, label: sellName || sellId },
        { id: 'frbtc', symbol: 'frBTC', label: 'Unwrap' },
        { id: 'btc', symbol: 'BTC', label: 'Bitcoin' }
      ];
    }
    
    // Handle direct swaps - show route for all pairs
    if (sellId && buyId && quote) {
      return [
        { id: sellId, symbol: sellName || sellId, label: sellName || sellId },
        { id: buyId, symbol: buyName || buyId, label: buyName || buyId }
      ];
    }
    
    return null;
  };

  const swapRoute = getSwapRoute();
  const isMultiHop = swapRoute && swapRoute.length > 2;

  const isDirectWrap = quote?.route && quote.route.length === 1 && quote.route[0] === 'wrap';
  const isDirectUnwrap = quote?.route && quote.route.length === 1 && quote.route[0] === 'unwrap';

  // Detect BTC <-> frBTC wrap/unwrap pairs for hardcoded 1:1 rate
  const isWrapPair = sellId === 'btc' && (buyId === 'frbtc' || buyId === FRBTC_ALKANE_ID);
  const isUnwrapPair = (sellId === 'frbtc' || sellId === FRBTC_ALKANE_ID) && buyId === 'btc';

  return (
    <div className="mt-3 flex flex-col gap-2.5 text-sm">
      {isCalculating ? (
        <SkeletonLines />
      ) : quote ? (
        <>
          {/* Panel container with toggle + collapsible content */}
          <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-visible">
          {/* Toggle button */}
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex items-center justify-between w-full p-4 text-xs font-semibold text-[color:var(--sf-text)]/60"
          >
            <span>
              {isWrapPair
                ? '1 BTC = 1 frBTC'
                : isUnwrapPair
                  ? '1 frBTC = 1 BTC'
                  : `1 ${sellName ?? sellId} = ${formatRate(quote.exchangeRate, buyId, buyName)} ${buyName ?? buyId}`}
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-300 ${detailsOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Details content: collapsible on all screen sizes */}
          <div className={`transition-all duration-300 ease-in-out ${detailsOpen ? 'max-h-[1000px] opacity-100 pb-4 overflow-visible' : 'max-h-0 opacity-0 pb-0 overflow-hidden'}`}>
          {swapRoute && (
            <div className="rounded-2xl bg-transparent p-4 pb-0">
              <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-2">
                {quote?.hops === 2 ? t('swapSummary.multiHopRoute') : t('swapSummary.swapRoute')}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {swapRoute.map((step, index) => (
                  <div key={`${step.id}-${index}`} className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--sf-primary)]/20 text-[10px] font-bold text-[color:var(--sf-primary)]">
                        {index + 1}
                      </div>
                      <span className="text-[11px] font-semibold text-[color:var(--sf-text)]">{step.symbol}</span>
                    </div>
                    {index < swapRoute.length - 1 && (
                      <svg className="h-2.5 w-2.5 text-[color:var(--sf-primary)]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
              {(quote?.hops === 2 || sellId === 'btc' || buyId === 'btc') && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[color:var(--sf-text)]/60">
                  <svg className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z"/>
                  </svg>
                  <span>
                    {quote?.hops === 2 && swapRoute.length === 3 && (
                      <>
                        {swapRoute[1].id === BUSD_ALKANE_ID && t('swapSummary.bridgeBusd')}
                        {swapRoute[1].id === FRBTC_ALKANE_ID && t('swapSummary.bridgeFrbtc')}
                      </>
                    )}
                    {sellId === 'btc' && (buyId === 'frbtc' || buyId === FRBTC_ALKANE_ID) && t('swapSummary.wrapNote')}
                    {sellId === 'btc' && buyId !== 'frbtc' && buyId !== FRBTC_ALKANE_ID && t('swapSummary.wrapSwapNote')}
                    {buyId === 'btc' && (sellId === 'frbtc' || sellId === FRBTC_ALKANE_ID) && t('swapSummary.unwrapNote')}
                    {buyId === 'btc' && sellId !== 'frbtc' && sellId !== FRBTC_ALKANE_ID && t('swapSummary.unwrapSwapNote')}
                    {quote?.hops === 2 && ' • Higher fees apply for multi-hop swaps'}
                  </span>
                </div>
              )}
            </div>
          )}
          
          {/* Settings rows - px-4 to align with Swap Route content */}
          <div className="flex flex-col gap-2.5 px-4">
            {direction === 'sell' ? (
              <Row className="mt-3" label={t('swapSummary.minimumReceived')} value={`${(() => {
                const isBtcToken = buyId === 'btc' || buyId === FRBTC_ALKANE_ID || buyName === 'BTC' || buyName === 'frBTC';
                const decimals = isBtcToken ? 8 : 2;
                return formatAlks(quote.minimumReceived, decimals, decimals);
              })()} ${buyName ?? buyId}`} />
            ) : (
              <Row className="mt-3" label="Maximum Sent" value={`${(() => {
                const isBtcToken = sellId === 'btc' || sellId === FRBTC_ALKANE_ID || sellName === 'BTC' || sellName === 'frBTC';
                const decimals = isBtcToken ? 8 : 2;
                return formatAlks(quote.maximumSent, decimals, decimals);
              })()} ${sellName ?? sellId}`} />
            )}
            {/* Deadline (blocks) row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                {t('swapSummary.deadlineBlocks')}
              </span>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    aria-label="Transaction deadline in blocks"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={deadlineLocal}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                    onFocus={() => setFocusedField('deadline')}
                    onBlur={() => {
                      setFocusedField(null);
                      const val = parseInt(deadlineLocal, 10);
                      if (!deadlineLocal || isNaN(val) || val < 1) {
                        setDeadlineLocal('3');
                        setDeadlineBlocks(3);
                      } else {
                        setDeadlineBlocks(Math.min(100, val));
                      }
                    }}
                    placeholder="3"
                    style={{ outline: 'none', border: 'none' }}
                    className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'deadline' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                  />
                </div>
              </div>
            </div>
            {/* Slippage Tolerance row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                {t('swapSummary.slippageTolerance')}
              </span>
              <div className="flex items-center gap-2">
                {(isWrapPair || isUnwrapPair) ? (
                  <span className="font-semibold text-[color:var(--sf-text)]">N/A</span>
                ) : (
                  <>
                    {slippageSelection === 'custom' ? (
                      <div className="relative">
                        <input
                          aria-label="Custom slippage tolerance"
                          type="text"
                          inputMode="numeric"
                          value={maxSlippage}
                          onChange={(e) => {
                            const val = e.target.value;
                            // Allow empty, or valid format: up to 2 digits (whole numbers only)
                            if (val === '' || /^\d{0,2}$/.test(val)) {
                              const num = parseInt(val, 10);
                              if (val === '' || (num >= 0 && num <= 99)) {
                                setMaxSlippage(val);
                              }
                            }
                          }}
                          onFocus={() => setFocusedField('slippage')}
                          onBlur={() => {
                            setFocusedField(null);
                            if (!maxSlippage) {
                              setMaxSlippage('5');
                            }
                          }}
                          placeholder="5"
                          style={{ outline: 'none', border: 'none' }}
                          className={`h-7 w-14 rounded-lg bg-[color:var(--sf-input-bg)] px-2 pr-5 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'slippage' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">%</span>
                      </div>
                    ) : (
                      <span className="font-semibold text-[color:var(--sf-text)]">
                        {maxSlippage}%
                      </span>
                    )}
                    <SlippageButton
                      selection={slippageSelection}
                      setSelection={setSlippageSelection}
                      setValue={setMaxSlippage}
                    />
                  </>
                )}
              </div>
            </div>
            {/* Miner Fee Rate row */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                {isCrossChainFrom ? t('swapSummary.btcAndEthFee') : t('swapSummary.minerFeeRate')}
              </span>
              <div className="flex items-center gap-2">
                {isCrossChainFrom ? (
                  <span className="font-semibold text-[color:var(--sf-text)]">$0.00 USDT</span>
                ) : feeSelection === 'custom' && setCustomFee ? (
                  <div className="relative">
                    <input
                      aria-label="Custom miner fee rate"
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={customFee}
                      onChange={(e) => setCustomFee(e.target.value)}
                      onFocus={() => setFocusedField('fee')}
                      onBlur={() => {
                        setFocusedField(null);
                        if (!customFee) {
                          setCustomFee(String(feePresets.medium));
                        }
                      }}
                      placeholder="0"
                      style={{ outline: 'none', border: 'none' }}
                      className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'fee' ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                    />
                  </div>
                ) : (
                  <span className="font-semibold text-[color:var(--sf-text)]">
                    {Math.round(feeRate)}
                  </span>
                )}
                {!isCrossChainFrom && (
                  <MinerFeeButton
                    selection={feeSelection}
                    setSelection={setFeeSelection}
                    customFee={customFee}
                    setCustomFee={setCustomFee}
                    feeRate={feeRate}
                    presets={feePresets}
                  />
                )}
              </div>
            </div>
            {poolFeeText && <Row label={t('swapSummary.poolFee')} value={poolFeeText} />}
          </div>
          
          {hasHighSlippage && slippagePercent !== null && !isWrapPair && !isUnwrapPair && (
            <div className="mt-2 mx-2 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <svg className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-xs font-bold text-red-500 mb-1">{t('swapSummary.highSlippageWarning')}</p>
                <p className="text-xs text-red-500/80">{t('swapSummary.highSlippageMessage', { percentage: slippagePercent.toFixed(2) })}</p>
              </div>
            </div>
          )}
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, highlight, warning, danger, className }: { label: string; value: string; highlight?: boolean; warning?: boolean; danger?: boolean; className?: string }) {
  let labelColor = 'text-[color:var(--sf-text)]/60';
  let valueColor = 'text-[color:var(--sf-text)]';
  
  if (highlight) {
    labelColor = 'text-[color:var(--sf-primary)]';
    valueColor = 'text-[color:var(--sf-primary)]';
  } else if (danger) {
    labelColor = 'text-red-600';
    valueColor = 'text-red-700 font-bold';
  } else if (warning) {
    labelColor = 'text-orange-600';
    valueColor = 'text-orange-700 font-bold';
  }
  
  return (
    <div className={`flex items-center justify-between ${className ?? ''}`}>
      <span className={`text-xs font-semibold uppercase tracking-wider ${labelColor}`}>
        {label}
      </span>
      <span className={`font-semibold ${valueColor} flex items-center gap-1`}>
        {(warning || danger) && (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )}
        {value}
      </span>
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="flex flex-col gap-2.5 animate-in fade-in duration-[400ms]">
      <div className="h-4 w-full animate-pulse rounded-lg bg-[color:var(--sf-primary)]/10" />
      <div className="h-4 w-3/4 animate-pulse rounded-lg bg-[color:var(--sf-primary)]/10" />
      <div className="h-4 w-2/3 animate-pulse rounded-lg bg-[color:var(--sf-primary)]/10" />
    </div>
  );
}

function formatRate(v: string, tokenId?: string, tokenName?: string) {
  try {
    // Use 8 decimals for BTC/frBTC, 2 for other tokens
    const isBtcToken = tokenId === 'btc' || tokenName === 'BTC' || tokenName === 'frBTC';
    const decimals = isBtcToken ? 8 : 2;
    return new BigNumber(v || '0').toFixed(decimals);
  } catch {
    return '0';
  }
}

function formatAlks(alks: string, min = 2, max = 8) {
  try {
    const n = new BigNumber(alks || '0').dividedBy(1e8);
    return n.toFormat(n.isLessThan(1) ? max : min);
  } catch {
    return '0';
  }
}

type MinerFeeButtonProps = {
  selection: FeeSelection;
  setSelection?: (s: FeeSelection) => void;
  customFee: string;
  setCustomFee?: (v: string) => void;
  feeRate: number;
  presets: { slow: number; medium: number; fast: number };
};

function MinerFeeButton({ selection, setSelection, presets }: MinerFeeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (s: FeeSelection) => {
    if (setSelection) setSelection(s);
    setIsOpen(false);
  };

  const feeDisplayMap: Record<string, string> = {
    slow: t('swapSummary.slow'),
    medium: t('swapSummary.medium'),
    fast: t('swapSummary.fast'),
    custom: t('swapSummary.custom'),
  };

  const getDisplayText = () => {
    return feeDisplayMap[selection] || selection;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all duration-[400ms] focus:outline-none ${isOpen ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
      >
        <span>{getDisplayText()}</span>
        <ChevronDown size={12} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['slow', 'medium', 'fast', 'custom'] as FeeSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{feeDisplayMap[option] || option}</span>
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

const SLIPPAGE_PRESETS: Record<Exclude<SlippageSelection, 'custom'>, string> = {
  low: '1',
  medium: '5',
  high: '10',
};

type SlippageButtonProps = {
  selection: SlippageSelection;
  setSelection: (s: SlippageSelection) => void;
  setValue: (v: string) => void;
};

function SlippageButton({ selection, setSelection, setValue }: SlippageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (s: SlippageSelection) => {
    setSelection(s);
    if (s !== 'custom') {
      setValue(SLIPPAGE_PRESETS[s]);
    }
    setIsOpen(false);
  };

  const slippageDisplayMap: Record<string, string> = {
    low: t('swapSummary.low'),
    medium: t('swapSummary.medium'),
    high: t('swapSummary.high'),
    custom: t('swapSummary.custom'),
  };

  const getDisplayText = () => {
    return slippageDisplayMap[selection] || selection;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all duration-[400ms] focus:outline-none ${isOpen ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
      >
        <span>{getDisplayText()}</span>
        <ChevronDown size={12} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['low', 'medium', 'high', 'custom'] as SlippageSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{slippageDisplayMap[option] || option}</span>
                {option !== 'custom' && (
                  <span className="text-[10px] text-[color:var(--sf-text)]/50">
                    {SLIPPAGE_PRESETS[option]}%
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
