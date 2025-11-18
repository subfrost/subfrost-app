"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import SwapInputs from "./components/SwapInputs";
import MarketsGrid from "./components/MarketsGrid";
import PoolDetailsCard from "./components/PoolDetailsCard";
import type { PoolSummary, TokenMeta } from "./types";
import SwapHeaderTabs from "./components/SwapHeaderTabs";
import { useSwapQuotes } from "@/hooks/useSwapQuotes";
import { useSwapMutation } from "@/hooks/useSwapMutation";
import { useWallet } from "@/context/WalletContext";
import { getConfig } from "@/utils/getConfig";
import { useAlkanesTokenPairs } from "@/hooks/useAlkanesTokenPairs";
import { useSellableCurrencies } from "@/hooks/useSellableCurrencies";
import { useBtcBalance } from "@/hooks/useBtcBalance";
import { useTokenDisplayMap } from "@/hooks/useTokenDisplayMap";
import { useGlobalStore } from "@/stores/global";
import { useFeeRate } from "@/hooks/useFeeRate";
import SwapSummary from "./components/SwapSummary";
import TransactionSettingsModal from "@/app/components/TransactionSettingsModal";
import TokenSelectorModal from "@/app/components/TokenSelectorModal";
import type { TokenOption } from "@/app/components/TokenSelectorModal";
import LoadingOverlay from "@/app/components/LoadingOverlay";
import { usePools } from "@/hooks/usePools";
import { useModalStore } from "@/stores/modals";
import { useWrapMutation } from "@/hooks/useWrapMutation";
import { useUnwrapMutation } from "@/hooks/useUnwrapMutation";
import SwapSuccessNotification from "@/app/components/SwapSuccessNotification";

export default function SwapShell() {
  // Markets from API: all pools sorted by TVL desc
  const { data: poolsData } = usePools({ sortBy: 'tvl', order: 'desc', limit: 200 });
  const markets = useMemo<PoolSummary[]>(() => (poolsData?.items ?? []), [poolsData?.items]);

  const [selectedPool, setSelectedPool] = useState<PoolSummary | undefined>();
  const [fromToken, setFromToken] = useState<TokenMeta | undefined>();
  const [toToken, setToToken] = useState<TokenMeta | undefined>();
  const [fromAmount, setFromAmount] = useState<string>("");
  const [toAmount, setToAmount] = useState<string>("");
  const [direction, setDirection] = useState<'sell' | 'buy'>('sell');
  const { maxSlippage, deadlineBlocks } = useGlobalStore();
  const fee = useFeeRate();
  const { isTokenSelectorOpen, tokenSelectorMode, closeTokenSelector } = useModalStore();
  const [successTxId, setSuccessTxId] = useState<string | null>(null);

  const sellId = fromToken?.id ?? '';
  const buyId = toToken?.id ?? '';
  const { data: quote, isFetching: isCalculating } = useSwapQuotes(
    sellId,
    buyId,
    direction === 'sell' ? fromAmount : toAmount,
    direction,
    maxSlippage,
  );
  const swapMutation = useSwapMutation();
  const wrapMutation = useWrapMutation();
  const unwrapMutation = useUnwrapMutation();

  // Wallet/config
  const { address, network } = useWallet();
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = getConfig(network);

  // User tokens (for FROM selector)
  const { data: userCurrencies = [], isFetching: isFetchingUserCurrencies } = useSellableCurrencies(address);
  const idToUserCurrency = useMemo(() => {
    const map = new Map<string, any>();
    userCurrencies.forEach((c: any) => map.set(c.id, c));
    return map;
  }, [userCurrencies]);

  // Default from/to tokens: BTC → frBTC
  useEffect(() => {
    if (!fromToken) setFromToken({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
  }, [fromToken]);
  const toInitializedRef = useRef(false);
  useEffect(() => {
    if (!toInitializedRef.current && !toToken) {
      setToToken({ id: BUSD_ALKANE_ID, symbol: 'bUSD', name: 'bUSD' });
      toInitializedRef.current = true;
    }
  }, [toToken, BUSD_ALKANE_ID]);

  // Build FROM options: BTC + all user-held tokens
  const fromOptions: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [{ id: 'btc', symbol: 'BTC', name: 'Bitcoin' }]; // BTC uses local icon
    userCurrencies.forEach((c: any) => {
      // Generate Oyl asset URL for alkane tokens (note: asset.oyl.gg, not assets)
      let iconUrl: string | undefined;
      if (/^\d+:\d+/.test(c.id)) {
        const urlSafeId = c.id.replace(/:/g, '-');
        iconUrl = `https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`;
      }
      
      opts.push({ 
        id: c.id, 
        symbol: c.symbol || (c.name ?? c.id), 
        name: c.name || c.symbol || c.id,
        iconUrl
      });
    });
    const seen = new Set<string>();
    return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
  }, [userCurrencies, network]);

  // Build TO options based on selected FROM: tokens that have pool with FROM
  const normalizedFromId = useMemo(() =>
    (fromToken?.id === 'btc' ? FRBTC_ALKANE_ID : fromToken?.id) || FRBTC_ALKANE_ID,
  [fromToken?.id, FRBTC_ALKANE_ID]);
  const { data: fromPairs } = useAlkanesTokenPairs(normalizedFromId);
  
  // Fetch BUSD pairs for bridge routing
  const { data: busdPairs } = useAlkanesTokenPairs(BUSD_ALKANE_ID);
  
  // Fetch frBTC pairs for bridge routing
  const { data: frbtcPairs } = useAlkanesTokenPairs(FRBTC_ALKANE_ID);
  
  const poolTokenIds = useMemo(() => {
    const ids = new Set<string>();
    fromPairs?.forEach((p) => {
      ids.add(p.token0.id === normalizedFromId ? p.token1.id : p.token0.id);
    });
    // Add bridge-reachable tokens
    busdPairs?.forEach((p) => {
      ids.add(p.token0.id === BUSD_ALKANE_ID ? p.token1.id : p.token0.id);
    });
    frbtcPairs?.forEach((p) => {
      ids.add(p.token0.id === FRBTC_ALKANE_ID ? p.token1.id : p.token0.id);
    });
    return Array.from(ids);
  }, [fromPairs, busdPairs, frbtcPairs, normalizedFromId, BUSD_ALKANE_ID, FRBTC_ALKANE_ID]);
  
  const { data: tokenDisplayMap } = useTokenDisplayMap(poolTokenIds);
  
  const toOptions: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [];
    
    // Helper function to create token meta
    const createTokenMeta = (tokenId: string): TokenMeta => {
      const userMeta = idToUserCurrency.get(tokenId);
      const fetched = tokenDisplayMap?.[tokenId];
      const symbol = userMeta?.symbol || fetched?.symbol || fetched?.name || tokenId;
      const name = userMeta?.name || fetched?.name || symbol;
      
      let iconUrl: string | undefined;
      // Special case: Always use local frBTC icon
      if (tokenId === FRBTC_ALKANE_ID || symbol?.toLowerCase() === 'frbtc') {
        iconUrl = '/tokens/frbtc.svg';
      } else if (/^\d+:\d+/.test(tokenId)) {
        const urlSafeId = tokenId.replace(/:/g, '-');
        iconUrl = `https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`;
      }
      
      return { id: tokenId, symbol, name, iconUrl };
    };
    
    // Case 1: No FROM token selected - show defaults
    if (!fromToken) {
      const busdUrlSafe = BUSD_ALKANE_ID.replace(/:/g, '-');
      opts.push({ 
        id: BUSD_ALKANE_ID, 
        symbol: 'bUSD', 
        name: 'bUSD',
        iconUrl: `https://asset.oyl.gg/alkanes/${network}/${busdUrlSafe}.png`
      });
      return opts;
    }
    
    // Case 2: Selling BUSD - only show direct BUSD pairs
    if (normalizedFromId === BUSD_ALKANE_ID) {
      busdPairs?.forEach((p) => {
        const other = p.token0.id === BUSD_ALKANE_ID ? p.token1.id : p.token0.id;
        opts.push(createTokenMeta(other));
      });
      // Add BTC option (will unwrap from frBTC)
      if (opts.some(t => t.id === FRBTC_ALKANE_ID)) {
        opts.push({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
      }
      const seen = new Set<string>();
      return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
    }
    
    // Case 3: Selling BTC or frBTC - show direct frBTC pairs + BTC
    if (fromToken.id === 'btc' || normalizedFromId === FRBTC_ALKANE_ID) {
      // Always show frBTC as an option when selling BTC
      if (fromToken.id === 'btc') {
        opts.push({
          id: FRBTC_ALKANE_ID,
          symbol: 'frBTC',
          name: 'frBTC',
          iconUrl: '/tokens/frbtc.svg'
        });
      }
      
      if (frbtcPairs && frbtcPairs.length > 0) {
        frbtcPairs.forEach((p) => {
          const other = p.token0.id === FRBTC_ALKANE_ID ? p.token1.id : p.token0.id;
          if (other !== FRBTC_ALKANE_ID) { // Don't duplicate frBTC
            opts.push(createTokenMeta(other));
          }
        });
      }
      // Add BTC as option if selling frBTC
      if (fromToken.id !== 'btc') {
        opts.unshift({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
      }
      const seen = new Set<string>();
      return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
    }
    
    // Case 4: Selling other alkane - show direct + bridge options
    // Direct pairs
    fromPairs?.forEach((p) => {
      const other = p.token0.id === normalizedFromId ? p.token1.id : p.token0.id;
      opts.push(createTokenMeta(other));
    });
    
    // BUSD bridge pairs (if FROM has pool with BUSD)
    const hasBusdBridge = fromPairs?.some(p => 
      p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID
    );
    if (hasBusdBridge) {
      busdPairs?.forEach((p) => {
        const other = p.token0.id === BUSD_ALKANE_ID ? p.token1.id : p.token0.id;
        if (other !== normalizedFromId) { // Don't add self
          opts.push(createTokenMeta(other));
        }
      });
    }
    
    // frBTC bridge pairs (if FROM has pool with frBTC)
    const hasFrbtcBridge = fromPairs?.some(p => 
      p.token0.id === FRBTC_ALKANE_ID || p.token1.id === FRBTC_ALKANE_ID
    );
    if (hasFrbtcBridge) {
      frbtcPairs?.forEach((p) => {
        const other = p.token0.id === FRBTC_ALKANE_ID ? p.token1.id : p.token0.id;
        if (other !== normalizedFromId) { // Don't add self
          opts.push(createTokenMeta(other));
        }
      });
      // Add BTC option since frBTC bridge is available
      opts.push({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
    }
    
    // Unique by id
    const seen = new Set<string>();
    return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
  }, [fromPairs, busdPairs, frbtcPairs, idToUserCurrency, normalizedFromId, fromToken, BUSD_ALKANE_ID, FRBTC_ALKANE_ID, tokenDisplayMap, network]);

  // Balances
  const { data: btcBalanceSats, isFetching: isFetchingBtc } = useBtcBalance();
  const isBalancesLoading = Boolean(isFetchingUserCurrencies || isFetchingBtc);
  const formatBalance = (id?: string): string => {
    if (!id) return 'Balance 0';
    if (id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = sats / 1e8;
      return `Balance ${btc.toFixed(6)}`;
    }
    const cur = idToUserCurrency.get(id);
    if (!cur?.balance) return 'Balance 0';
    const amt = Number(cur.balance) / 1e8;
    return `Balance ${amt.toFixed(6)}`;
  };

  const isWrapPair = useMemo(() => fromToken?.id === 'btc' && toToken?.id === FRBTC_ALKANE_ID, [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]);
  const isUnwrapPair = useMemo(() => fromToken?.id === FRBTC_ALKANE_ID && toToken?.id === 'btc', [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]);

  const handleSwap = async () => {
    if (!fromToken || !toToken) return;

    // Wrap/Unwrap direct pairs
    if (isWrapPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await wrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          setSuccessTxId(res.transactionId);
        }
      } catch (e) {
        console.error(e);
        window.alert('Wrap failed. See console for details.');
      }
      return;
    }

    if (isUnwrapPair) {
      try {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await unwrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success && res.transactionId) {
          setSuccessTxId(res.transactionId);
        }
      } catch (e) {
        console.error(e);
        window.alert('Unwrap failed. See console for details.');
      }
      return;
    }

    // Default AMM swap
    if (!quote) return;
    const payload = {
      sellCurrency: fromToken.id,
      buyCurrency: toToken.id,
      direction,
      sellAmount: quote.sellAmount,
      buyAmount: quote.buyAmount,
      maxSlippage,
      feeRate: fee.feeRate,
      tokenPath: quote.route ?? [fromToken.id, toToken.id],
      deadlineBlocks,
    } as const;
    try {
      const res = await swapMutation.mutateAsync(payload as any);
      if (res?.success && res.transactionId) {
        setSuccessTxId(res.transactionId);
      }
    } catch (e) {
      console.error(e);
      window.alert('Swap failed. See console for details.');
    }
  };

  useEffect(() => {
    if (!quote) return;
    if (direction === 'sell') {
      setToAmount(quote.displayBuyAmount);
    } else {
      setFromAmount(quote.displaySellAmount);
    }
  }, [quote?.displayBuyAmount, quote?.displaySellAmount, direction]);

  const tokenOptions = useMemo<TokenMeta[]>(() => {
    if (selectedPool) return [selectedPool.token0, selectedPool.token1];
    return [
      { id: "btc", symbol: "BTC", name: "Bitcoin" },
      { id: "frbtc", symbol: "frBTC", name: "frBTC" },
      { id: "busd", symbol: "bUSD", name: "bUSD" },
    ];
  }, [selectedPool]);

  const handleSelectPool = (pool: PoolSummary) => {
    setSelectedPool(pool);
    setFromToken(pool.token0);
    setToToken(pool.token1);
  };

  const handleInvert = () => {
    // Swap tokens
    setFromToken((prev) => {
      const next = toToken;
      setToToken(prev);
      return next;
    });
    // Swap amounts
    setFromAmount((prev) => {
      const next = toAmount;
      setToAmount(prev);
      return next ?? "";
    });
  };

  // Prepare token options for modal with balances and prices
  const fromTokenOptions = useMemo<TokenOption[]>(() => {
    return fromOptions.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      return {
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        iconUrl: token.id === 'btc' ? undefined : currency?.iconUrl,
        balance: token.id === 'btc' ? String(btcBalanceSats ?? 0) : currency?.balance,
        price: currency?.priceInfo?.price,
      };
    });
  }, [fromOptions, idToUserCurrency, btcBalanceSats]);

  const toTokenOptions = useMemo<TokenOption[]>(() => {
    return toOptions.map((token) => {
      const currency = idToUserCurrency.get(token.id);
      const fetched = tokenDisplayMap?.[token.id];
      return {
        id: token.id,
        symbol: token.symbol,
        name: token.name || fetched?.name,
        iconUrl: currency?.iconUrl,
        balance: currency?.balance,
        price: currency?.priceInfo?.price,
      };
    });
  }, [toOptions, idToUserCurrency, tokenDisplayMap]);

  const handleTokenSelect = (tokenId: string) => {
    if (tokenSelectorMode === 'from') {
      const token = fromOptions.find((t) => t.id === tokenId);
      if (token) {
        setFromToken(token);
        setToToken(undefined);
        setToAmount("");
      }
    } else if (tokenSelectorMode === 'to') {
      const token = toOptions.find((t) => t.id === tokenId);
      if (token) {
        console.log('[DEBUG] Setting toToken:', token);
        setToToken(token);
      }
    }
  };

  // Handle max balance click
  const handleMaxFrom = () => {
    if (!fromToken) return;
    if (fromToken.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = sats / 1e8;
      setDirection('sell');
      setFromAmount(btc.toFixed(8));
    } else {
      const cur = idToUserCurrency.get(fromToken.id);
      if (cur?.balance) {
        const amt = Number(cur.balance) / 1e8;
        setDirection('sell');
        setFromAmount(amt.toFixed(8));
      }
    }
  };

  // Handle percentage of balance click
  const handlePercentFrom = (percent: number) => {
    if (!fromToken) return;
    if (fromToken.id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = (sats * percent) / 1e8;
      setDirection('sell');
      setFromAmount(btc.toFixed(8));
    } else {
      const cur = idToUserCurrency.get(fromToken.id);
      if (cur?.balance) {
        const amt = (Number(cur.balance) * percent) / 1e8;
        setDirection('sell');
        setFromAmount(amt.toFixed(8));
      }
    }
  };

  return (
    <div className="flex w-full flex-col gap-8">
      {successTxId && (
        <SwapSuccessNotification
          txId={successTxId}
          onClose={() => setSuccessTxId(null)}
        />
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Swap/LP Module */}
        <section className="relative w-full rounded-[24px] border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 sm:p-9 shadow-[0_12px_48px_rgba(40,67,114,0.18)] backdrop-blur-xl">
          {isBalancesLoading && <LoadingOverlay />}
          <div className="mb-6 flex w-full items-center justify-center">
            <SwapHeaderTabs />
          </div>
          <SwapInputs
            from={fromToken}
            to={toToken}
            fromOptions={fromOptions}
            toOptions={toOptions}
            fromAmount={fromAmount}
            toAmount={toAmount}
            onChangeFromAmount={(v) => { setDirection('sell'); setFromAmount(v); }}
            onChangeToAmount={(v) => { setDirection('buy'); setToAmount(v); }}
            onSelectFromToken={(id) => {
              const t = fromOptions.find((x) => x.id === id);
              if (t) {
                setFromToken(t);
                // Reset TO selection when FROM changes
                setToToken(undefined);
                setToAmount("");
              }
            }}
            onSelectToToken={(symbol) => {
              if (!symbol) {
                setToToken(undefined);
                setToAmount("");
                return;
              }
              const t = toOptions.find((x) => x.id === symbol);
              if (t) setToToken(t);
            }}
            onInvert={handleInvert}
            onSwapClick={handleSwap}
            fromBalanceText={formatBalance(fromToken?.id)}
            toBalanceText={formatBalance(toToken?.id)}
            fromFiatText={"$0.00"}
            toFiatText={"$0.00"}
            onMaxFrom={fromToken ? handleMaxFrom : undefined}
            onPercentFrom={fromToken ? handlePercentFrom : undefined}
            summary={
              <SwapSummary
                sellId={fromToken?.id ?? ''}
                buyId={toToken?.id ?? ''}
                sellName={fromToken?.name ?? fromToken?.symbol}
                buyName={toToken?.name ?? toToken?.symbol}
                direction={direction}
                quote={quote}
                isCalculating={!!isCalculating}
                feeRate={fee.feeRate}
              />
            }
          />
        </section>

        {/* Right Column: TVL and Markets */}
        <div className="flex flex-col gap-8">
          <PoolDetailsCard pool={selectedPool} />
          <MarketsGrid pools={markets} onSelect={handleSelectPool} />
        </div>
      </div>

      <TransactionSettingsModal
        selection={fee.selection}
        setSelection={fee.setSelection}
        custom={fee.custom}
        setCustom={fee.setCustom}
        feeRate={fee.feeRate}
      />

      <TokenSelectorModal
        isOpen={isTokenSelectorOpen}
        onClose={closeTokenSelector}
        tokens={tokenSelectorMode === 'from' ? fromTokenOptions : toTokenOptions}
        onSelectToken={handleTokenSelect}
        selectedTokenId={tokenSelectorMode === 'from' ? fromToken?.id : toToken?.id}
        title={tokenSelectorMode === 'from' ? 'Select token to pay' : 'Select token to receive'}
        network={network}
      />
    </div>
  );
}
