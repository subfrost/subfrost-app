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
};

export default function SwapSummary({ sellId, buyId, sellName, buyName, direction, quote, isCalculating, feeRate, network: networkProp }: Props) {
  const { network: walletNetwork } = useWallet();
  const network = networkProp || walletNetwork;
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = getConfig(network);
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
    (p) =>
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
    poolFeeText = `${formatAlks(feeAmount.toString())} ${sellName ?? sellId}`;
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

  const hasHighSlippage = slippagePercent !== null && slippagePercent > 5;
  const hasWarningSlippage = slippagePercent !== null && slippagePercent > 1 && slippagePercent <= 5;

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
        { id: 'btc', symbol: 'BTC', label: 'Bitcoin' },
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
    
    return null;
  };

  const swapRoute = getSwapRoute();
  const isMultiHop = swapRoute && swapRoute.length > 2;

  const isDirectWrap = quote?.route && quote.route.length === 1 && quote.route[0] === 'wrap';
  const isDirectUnwrap = quote?.route && quote.route.length === 1 && quote.route[0] === 'unwrap';

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-[color:var(--sf-outline)] bg-white/60 p-4 text-sm backdrop-blur-sm transition-all">
      {isCalculating ? (
        <SkeletonLines />
      ) : quote ? (
        <>
          {(isDirectWrap || isDirectUnwrap) && (
            <div className="mb-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-900 mb-1">Swap Route</div>
              <div className="text-xs font-semibold text-blue-900">
                {isDirectWrap && 'Wrap BTC → frBTC'}
                {isDirectUnwrap && 'Unwrap frBTC → BTC'}
              </div>
            </div>
          )}
          {swapRoute && (
            <div className="mb-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-900 mb-2">
                {quote?.hops === 2 ? 'Multi-Hop Swap Route' : 'Swap Route'}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {swapRoute.map((step, index) => (
                  <div key={`${step.id}-${index}`} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                        {index + 1}
                      </div>
                      <span className="text-xs font-semibold text-blue-900">{step.symbol}</span>
                    </div>
                    {index < swapRoute.length - 1 && (
                      <svg className="h-3 w-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] text-blue-700">
                {quote?.hops === 2 && swapRoute.length === 3 && (
                  <>
                    {swapRoute[1].id === BUSD_ALKANE_ID && '⚡ Using bUSD as bridge token'}
                    {swapRoute[1].id === FRBTC_ALKANE_ID && '⚡ Using frBTC as bridge token'}
                  </>
                )}
                {sellId === 'btc' && buyId !== 'frbtc' && '🔄 BTC will be wrapped to frBTC before swap'}
                {buyId === 'btc' && sellId !== 'frbtc' && '🔄 frBTC will be unwrapped to BTC after swap'}
                {quote?.hops === 2 && ' • Higher fees apply for multi-hop swaps'}
              </div>
            </div>
          )}
          <Row 
            label="Exchange Rate" 
            value={`1 ${sellName ?? sellId} = ${formatRate(quote.exchangeRate)} ${buyName ?? buyId}`}
            highlight
          />
          {direction === 'sell' ? (
            <Row label="Minimum Received" value={`${formatAlks(quote.minimumReceived)} ${buyName ?? buyId}`} />
          ) : (
            <Row label="Maximum Sent" value={`${formatAlks(quote.maximumSent)} ${sellName ?? sellId}`} />
          )}
          {slippagePercent !== null && (
            <Row 
              label="Slippage Tolerance" 
              value={`${slippagePercent.toFixed(2)}%`}
              warning={hasWarningSlippage}
              danger={hasHighSlippage}
            />
          )}
          <Row label="Miner Fee Rate" value={`${feeRate} sats/vB`} />
          {poolFeeText && <Row label="Pool Fee" value={poolFeeText} />}
          
          {hasHighSlippage && slippagePercent !== null && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
              <svg className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-xs font-bold text-red-900 mb-1">High Slippage Warning</p>
                <p className="text-xs text-red-700">This swap has high slippage ({slippagePercent.toFixed(2)}%). You may receive significantly less than expected.</p>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, highlight, warning, danger }: { label: string; value: string; highlight?: boolean; warning?: boolean; danger?: boolean }) {
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
    <div className="flex items-center justify-between">
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
    <div className="flex flex-col gap-2.5 animate-in fade-in duration-300">
      <div className="h-4 w-full animate-pulse rounded-lg bg-[color:var(--sf-primary)]/10" />
      <div className="h-4 w-3/4 animate-pulse rounded-lg bg-[color:var(--sf-primary)]/10" />
      <div className="h-4 w-2/3 animate-pulse rounded-lg bg-[color:var(--sf-primary)]/10" />
    </div>
  );
}

function formatRate(v: string) {
  try {
    return new BigNumber(v || '0').toFixed(8);
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


