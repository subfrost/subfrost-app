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
import { VIRTUAL_TOKEN_IDS, BRIDGE_TOKEN_META } from "@/constants/bridge";
import { useBridgeMintMutation } from "@/hooks/useBridgeMintMutation";
import { useBridgeRedeemMutation } from "@/hooks/useBridgeRedeemMutation";
import { useEthereumWallet } from "@/context/EthereumWalletContext";
import { useEthereumTokenBalance } from "@/hooks/useEthereumTokenBalance";
import BridgeDepositModal from "@/app/components/BridgeDepositModal";
import { usePendingSwapQueue } from "@/hooks/usePendingSwapQueue";
import { useSwapRouting } from "@/hooks/useSwapRouting";

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
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
  const [bridgeModalConfig, setBridgeModalConfig] = useState<{
    tokenType: 'USDT' | 'USDC';
    amount: string;
    targetToken?: string;
  } | null>(null);

  // Pending swap queue for auto-chaining
  const { 
    readySwaps, 
    addPendingSwap, 
    removePendingSwap, 
    updateSwapStatus 
  } = usePendingSwapQueue();

  // Calculate routing for current pair
  const swapRoute = useSwapRouting(
    fromToken?.id,
    toToken?.id,
    fromToken?.symbol,
    toToken?.symbol
  );

  const sellId = fromToken?.id ?? '';
  const buyId = toToken?.id ?? '';
  
  // Wallet/config
  const { address, network } = useWallet();
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = getConfig(network);
  const { isConnected: isEthConnected, connect: connectEth, address: ethAddress } = useEthereumWallet();
  
  // Bridge detection helper
  const isBridgeToken = (tokenId?: string) => 
    tokenId === VIRTUAL_TOKEN_IDS.USDT || tokenId === VIRTUAL_TOKEN_IDS.USDC;
  
  // Skip quote API for bridge pairs (1:1 conversion for bridge, no AMM involved)
  const shouldSkipQuote = isBridgeToken(fromToken?.id) || isBridgeToken(toToken?.id);
  
  const { data: quote, isFetching: isCalculating } = useSwapQuotes(
    shouldSkipQuote ? '' : sellId,
    shouldSkipQuote ? '' : buyId,
    shouldSkipQuote ? '' : (direction === 'sell' ? fromAmount : toAmount),
    direction,
    maxSlippage,
  );
  const swapMutation = useSwapMutation();
  const wrapMutation = useWrapMutation();
  const unwrapMutation = useUnwrapMutation();
  const bridgeMintMutation = useBridgeMintMutation();
  const bridgeRedeemMutation = useBridgeRedeemMutation();

  // User tokens (for FROM selector)
  const { data: userCurrencies = [], isFetching: isFetchingUserCurrencies } = useSellableCurrencies(address);
  const idToUserCurrency = useMemo(() => {
    const map = new Map<string, any>();
    userCurrencies.forEach((c: any) => map.set(c.id, c));
    return map;
  }, [userCurrencies]);

  // Default from/to tokens: BTC → USDT
  useEffect(() => {
    if (!fromToken) setFromToken({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
  }, [fromToken]);
  const toInitializedRef = useRef(false);
  useEffect(() => {
    if (!toInitializedRef.current && !toToken) {
      setToToken({ 
        id: VIRTUAL_TOKEN_IDS.USDT, 
        symbol: 'USDT', 
        name: 'Tether USD',
        iconUrl: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].iconUrl,
      });
      toInitializedRef.current = true;
    }
  }, [toToken, BUSD_ALKANE_ID]);

  // Auto-execute ready swaps (after bUSD arrives from bridge)
  useEffect(() => {
    if (!address || readySwaps.length === 0) return;

    readySwaps.forEach(async (swap) => {
      try {
        console.log('Auto-executing swap:', swap);
        updateSwapStatus(swap.id, 'swapping');

        // Execute bUSD → Target Token swap
        const result = await swapMutation.mutateAsync({
          sellCurrency: BUSD_ALKANE_ID,
          buyCurrency: swap.targetToken,
          sellAmount: swap.expectedBusdAmount,
          buyAmount: '0', // Will be calculated by AMM
          direction: 'sell',
          maxSlippage: String(swap.maxSlippage),
          feeRate: swap.feeRate,
        });

        if (result.success && result.transactionId) {
          updateSwapStatus(swap.id, 'completed');
          setSuccessTxId(result.transactionId);
          window.alert(
            `Auto-swap completed!\n\nSwapped bUSD → ${swap.targetSymbol}\n\nTX: ${result.transactionId}`
          );
          removePendingSwap(swap.id);
        } else {
          throw new Error('Swap failed: no transaction ID');
        }
      } catch (err: any) {
        console.error('Auto-swap failed:', err);
        updateSwapStatus(swap.id, 'failed');
        window.alert(
          `Auto-swap failed: ${err.message}\n\nYou have bUSD in your wallet. You can manually swap bUSD → ${swap.targetSymbol}.`
        );
      }
    });
  }, [readySwaps, address, BUSD_ALKANE_ID, swapMutation, updateSwapStatus, removePendingSwap, maxSlippage, fee]);

  // Build FROM options: BTC, USDC, USDT first, then user-held tokens
  const fromOptions: TokenMeta[] = useMemo(() => {
    const opts: TokenMeta[] = [];
    
    // Top 3: BTC, USDC, USDT
    opts.push({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
    opts.push({
      id: VIRTUAL_TOKEN_IDS.USDC,
      symbol: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].symbol,
      name: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].name,
      iconUrl: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].iconUrl,
    });
    opts.push({
      id: VIRTUAL_TOKEN_IDS.USDT,
      symbol: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].symbol,
      name: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].name,
      iconUrl: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].iconUrl,
    });
    
    // Then all user-held tokens
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
  const normalizedFromId = useMemo(() => {
    // Bridge tokens normalize to bUSD for routing
    if (isBridgeToken(fromToken?.id)) return BUSD_ALKANE_ID;
    // BTC normalizes to frBTC
    if (fromToken?.id === 'btc') return FRBTC_ALKANE_ID;
    return fromToken?.id || FRBTC_ALKANE_ID;
  }, [fromToken?.id, BUSD_ALKANE_ID, FRBTC_ALKANE_ID]);
  
  const { data: fromPairs } = useAlkanesTokenPairs(normalizedFromId);
  
  // Fetch BUSD pairs for bridge routing (always fetch for bridge token support)
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
      if (/^\d+:\d+/.test(tokenId)) {
        const urlSafeId = tokenId.replace(/:/g, '-');
        iconUrl = `https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`;
      }
      
      return { id: tokenId, symbol, name, iconUrl };
    };
    
    // Helper to add USDT/USDC options
    const addBridgeTokens = () => {
      opts.push({
        id: VIRTUAL_TOKEN_IDS.USDT,
        symbol: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].symbol,
        name: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].name,
        iconUrl: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].iconUrl,
      });
      opts.push({
        id: VIRTUAL_TOKEN_IDS.USDC,
        symbol: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].symbol,
        name: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].name,
        iconUrl: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].iconUrl,
      });
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
    
    // Case 2: FROM is USDT/USDC - show all tokens reachable via bUSD
    if (isBridgeToken(fromToken.id)) {
      // Top: BTC, USDC/USDT (the other one)
      const hasFrbtc = busdPairs?.some(p => 
        p.token0.id === FRBTC_ALKANE_ID || p.token1.id === FRBTC_ALKANE_ID
      );
      if (hasFrbtc) {
        opts.push({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
      }
      // Add the OTHER bridge token (if FROM is USDT, show USDC)
      if (fromToken.id === VIRTUAL_TOKEN_IDS.USDT) {
        opts.push({
          id: VIRTUAL_TOKEN_IDS.USDC,
          symbol: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].symbol,
          name: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].name,
          iconUrl: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDC].iconUrl,
        });
      } else {
        opts.push({
          id: VIRTUAL_TOKEN_IDS.USDT,
          symbol: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].symbol,
          name: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].name,
          iconUrl: BRIDGE_TOKEN_META[VIRTUAL_TOKEN_IDS.USDT].iconUrl,
        });
      }
      
      // Show bUSD directly
      opts.push(createTokenMeta(BUSD_ALKANE_ID));
      
      // Show all tokens that pair with bUSD
      busdPairs?.forEach((p) => {
        const other = p.token0.id === BUSD_ALKANE_ID ? p.token1.id : p.token0.id;
        opts.push(createTokenMeta(other));
      });
      
      const seen = new Set<string>();
      return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
    }
    
    // Case 3: Selling BTC or frBTC - show all frBTC pairs + USDT/USDC
    if (fromToken.id === 'btc' || normalizedFromId === FRBTC_ALKANE_ID) {
      // Top items: BTC (if selling frBTC), USDC, USDT
      if (fromToken.id !== 'btc') {
        opts.push({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
      }
      
      // Check if bUSD is reachable
      const hasBusd = frbtcPairs?.some(p => 
        p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID
      );
      if (hasBusd) {
        addBridgeTokens(); // USDC, USDT
      }
      
      // Always show frBTC as an option when selling BTC
      if (fromToken.id === 'btc') {
        const frbtcUrlSafe = FRBTC_ALKANE_ID.replace(/:/g, '-');
        opts.push({
          id: FRBTC_ALKANE_ID,
          symbol: 'frBTC',
          name: 'frBTC',
          iconUrl: `https://asset.oyl.gg/alkanes/${network}/${frbtcUrlSafe}.png`
        });
      }
      
      // Add all frBTC pairs
      frbtcPairs?.forEach((p) => {
        const other = p.token0.id === FRBTC_ALKANE_ID ? p.token1.id : p.token0.id;
        if (other !== FRBTC_ALKANE_ID) {
          opts.push(createTokenMeta(other));
        }
      });
      
      const seen = new Set<string>();
      return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
    }
    
    // Case 4: Selling other alkane - show all reachable tokens
    // Check if we can reach bUSD (directly or via frBTC)
    const hasBusdDirect = fromPairs?.some(p => 
      p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID
    );
    const hasFrbtcBridge = fromPairs?.some(p => 
      p.token0.id === FRBTC_ALKANE_ID || p.token1.id === FRBTC_ALKANE_ID
    );
    const canReachBusd = hasBusdDirect || (hasFrbtcBridge && frbtcPairs?.some(p =>
      p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID
    ));
    
    // Top items: BTC (if reachable), USDC, USDT
    if (hasFrbtcBridge) {
      opts.push({ id: 'btc', symbol: 'BTC', name: 'Bitcoin' });
    }
    if (canReachBusd) {
      addBridgeTokens(); // USDC, USDT
    }
    
    // Direct pairs
    fromPairs?.forEach((p) => {
      const other = p.token0.id === normalizedFromId ? p.token1.id : p.token0.id;
      opts.push(createTokenMeta(other));
    });
    
    // If we can reach bUSD, add all bUSD pairs
    if (canReachBusd) {
      busdPairs?.forEach((p) => {
        const other = p.token0.id === BUSD_ALKANE_ID ? p.token1.id : p.token0.id;
        if (other !== normalizedFromId) {
          opts.push(createTokenMeta(other));
        }
      });
    }
    
    // Add frBTC-reachable tokens
    if (hasFrbtcBridge) {
      frbtcPairs?.forEach((p) => {
        const other = p.token0.id === FRBTC_ALKANE_ID ? p.token1.id : p.token0.id;
        if (other !== normalizedFromId) {
          opts.push(createTokenMeta(other));
        }
      });
    }
    
    // Unique by id
    const seen = new Set<string>();
    return opts.filter((t) => (seen.has(t.id) ? false : seen.add(t.id) || true));
  }, [fromPairs, busdPairs, frbtcPairs, idToUserCurrency, normalizedFromId, fromToken, BUSD_ALKANE_ID, FRBTC_ALKANE_ID, tokenDisplayMap, network]);

  // Balances
  const { data: btcBalanceSats, isFetching: isFetchingBtc } = useBtcBalance();
  const { data: usdtBalance } = useEthereumTokenBalance('USDT');
  const { data: usdcBalance } = useEthereumTokenBalance('USDC');
  const isBalancesLoading = Boolean(isFetchingUserCurrencies || isFetchingBtc);
  
  const formatBalance = (id?: string): string => {
    if (!id) return 'Balance 0';
    if (id === 'btc') {
      const sats = Number(btcBalanceSats || 0);
      const btc = sats / 1e8;
      return `Balance ${btc.toFixed(6)}`;
    }
    // Handle USDT/USDC balances from Ethereum (show 0 if not connected)
    if (id === VIRTUAL_TOKEN_IDS.USDT) {
      const balance = parseFloat(usdtBalance || '0');
      return `Balance ${balance.toFixed(6)}`;
    }
    if (id === VIRTUAL_TOKEN_IDS.USDC) {
      const balance = parseFloat(usdcBalance || '0');
      return `Balance ${balance.toFixed(6)}`;
    }
    const cur = idToUserCurrency.get(id);
    if (!cur?.balance) return 'Balance 0';
    const amt = Number(cur.balance) / 1e8;
    return `Balance ${amt.toFixed(6)}`;
  };

  const isWrapPair = useMemo(() => fromToken?.id === 'btc' && toToken?.id === FRBTC_ALKANE_ID, [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]);
  const isUnwrapPair = useMemo(() => fromToken?.id === FRBTC_ALKANE_ID && toToken?.id === 'btc', [fromToken?.id, toToken?.id, FRBTC_ALKANE_ID]);

  // Bridge scenario detection
  const isDirectBridgeIn = useMemo(() => 
    isBridgeToken(fromToken?.id) && toToken?.id === BUSD_ALKANE_ID,
  [fromToken?.id, toToken?.id, BUSD_ALKANE_ID]);
  
  const isDirectBridgeOut = useMemo(() => 
    fromToken?.id === BUSD_ALKANE_ID && isBridgeToken(toToken?.id),
  [fromToken?.id, toToken?.id, BUSD_ALKANE_ID]);
  
  const isBridgeInWithSwap = useMemo(() => 
    isBridgeToken(fromToken?.id) && toToken?.id !== BUSD_ALKANE_ID && !!toToken?.id,
  [fromToken?.id, toToken?.id, BUSD_ALKANE_ID]);
  
  const isBridgeOutWithSwap = useMemo(() => 
    !isBridgeToken(fromToken?.id) && fromToken?.id !== BUSD_ALKANE_ID && isBridgeToken(toToken?.id),
  [fromToken?.id, toToken?.id, BUSD_ALKANE_ID]);

  const handleSwap = async () => {
    if (!fromToken || !toToken) return;

    try {
      // SCENARIO 1: Wrap BTC -> frBTC
      if (isWrapPair) {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await wrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success) {
          setSuccessTxId(res.transactionId ?? 'unknown');
        }
        return;
      }

      // SCENARIO 2: Unwrap frBTC -> BTC
      if (isUnwrapPair) {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const res = await unwrapMutation.mutateAsync({ amount: amountDisplay, feeRate: fee.feeRate });
        if (res?.success) {
          setSuccessTxId(res.transactionId ?? 'unknown');
        }
        return;
      }

      // SCENARIO 3: Bridge In - USDT/USDC -> bUSD (direct) OR multi-hop to other token
      if (isDirectBridgeIn || isBridgeInWithSwap) {
        const tokenType = fromToken.id === VIRTUAL_TOKEN_IDS.USDT ? 'USDT' : 'USDC';
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        
        // Open modal with QR code and transfer options
        setBridgeModalConfig({
          tokenType,
          amount: amountDisplay,
          targetToken: isBridgeInWithSwap ? toToken?.symbol || toToken?.name : undefined,
        });
        setIsBridgeModalOpen(true);
        return;
      }

      // SCENARIO 4: Bridge Out - bUSD -> USDT/USDC (direct)
      if (isDirectBridgeOut) {
        // Prompt for Ethereum destination address if not connected
        let destinationAddress = ethAddress;
        if (!destinationAddress) {
          destinationAddress = window.prompt(
            'Enter your Ethereum address to receive ' + toToken.symbol + ':',
            ''
          );
          if (!destinationAddress || !/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
            window.alert('Invalid Ethereum address');
            return;
          }
        }

        const tokenType = toToken.id === VIRTUAL_TOKEN_IDS.USDT ? 'USDT' : 'USDC';
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        // Convert to sats (bUSD uses 8 decimals)
        const amountSats = String(Math.floor(parseFloat(amountDisplay) * 1e8));
        
        const res = await bridgeRedeemMutation.mutateAsync({
          amount: amountSats,
          destinationAddress,
          tokenType,
          feeRate: fee.feeRate,
        });
        
        if (res?.success) {
          setSuccessTxId(res.transactionId ?? 'unknown');
        }
        return;
      }

      // SCENARIO 5: Multi-hop swaps are now handled above in scenario 3
      // No separate handling needed - the modal shows appropriate messaging

      // SCENARIO 6: Swap + Bridge Out - Other Token -> USDT/USDC  
      if (isBridgeOutWithSwap) {
        const amountDisplay = direction === 'sell' ? fromAmount : toAmount;
        const tokenType = toToken.id === VIRTUAL_TOKEN_IDS.USDT ? 'USDT' : 'USDC';
        
        // Confirm multi-step flow
        const confirmed = window.confirm(
          `Multi-step swap: ${fromToken.symbol} → ${toToken.symbol}\n\n` +
          `This requires two transactions:\n` +
          `1. Swap ${fromToken.symbol} → bUSD (Bitcoin)\n` +
          `2. Bridge bUSD → ${tokenType} (Ethereum)\n\n` +
          `Click OK to proceed with step 1.`
        );
        
        if (!confirmed) return;

        // Step 1: Execute Token → bUSD swap
        try {
          // Get quote for Token → bUSD
          const swapQuote = await fetch(
            `/api/swap-quote?` +
            `sellId=${encodeURIComponent(fromToken.id)}&` +
            `buyId=${encodeURIComponent(BUSD_ALKANE_ID)}&` +
            `amount=${encodeURIComponent(amountDisplay)}&` +
            `direction=sell&` +
            `maxSlippage=${maxSlippage}`
          ).then(r => r.json());

          if (!swapQuote) {
            throw new Error('Unable to get quote for Token → bUSD');
          }

          // Execute the swap
          const swapResult = await swapMutation.mutateAsync({
            sellCurrency: fromToken.id,
            buyCurrency: BUSD_ALKANE_ID,
            sellAmount: amountDisplay,
            buyAmount: '0', // Will be calculated by AMM
            direction: 'sell',
            maxSlippage,
            feeRate: fee.feeRate,
          });

          if (!swapResult.success || !swapResult.transactionId) {
            throw new Error('Swap failed: no transaction ID');
          }

          setSuccessTxId(swapResult.transactionId);

          // Step 2: Prompt for Ethereum address and execute bridge
          const proceedToBridge = window.confirm(
            `Step 1 completed! Swapped ${fromToken.symbol} → bUSD\n\n` +
            `TX: ${swapResult.transactionId}\n\n` +
            `Click OK to proceed with step 2: Bridge bUSD → ${tokenType}`
          );

          if (proceedToBridge) {
            const destinationAddress = window.prompt(
              `Enter your Ethereum address to receive ${tokenType}:`,
              ethAddress || ''
            );

            if (!destinationAddress || !/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
              window.alert('Invalid Ethereum address. You can bridge manually: Swap bUSD → ' + tokenType);
              return;
            }

            // Get expected bUSD amount from swap result
            // Use the input amount as estimate (1:1 for bridge calculation)
            const busdAmountSats = String(Math.floor(parseFloat(amountDisplay) * 1e8));

            // Execute bridge
            const bridgeResult = await bridgeRedeemMutation.mutateAsync({
              amount: busdAmountSats,
              destinationAddress,
              tokenType,
              feeRate: fee.feeRate,
            });

            if (bridgeResult?.success) {
              window.alert(
                `Multi-step swap completed!\n\n` +
                `Step 1: ${swapResult.transactionId}\n` +
                `Step 2: ${bridgeResult.transactionId}\n\n` +
                `Your ${tokenType} will arrive on Ethereum in ~15-30 minutes.`
              );
              setFromAmount('');
              setToAmount('');
            }
          }
        } catch (err: any) {
          console.error('Multi-step swap failed:', err);
          window.alert(`Step failed: ${err.message}\n\nYou may need to complete the remaining steps manually.`);
        }
        return;
      }

      // SCENARIO 7: Regular AMM swap
      if (!quote) {
        window.alert('No quote available. Please try adjusting the amounts.');
        return;
      }
      
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
      
      const res = await swapMutation.mutateAsync(payload as any);
      if (res?.success) {
        setSuccessTxId(res.transactionId ?? 'unknown');
      }
    } catch (e: any) {
      console.error('Swap/Bridge failed:', e);
      window.alert(e?.message || 'Transaction failed. See console for details.');
    }
  };

  // Update amounts from quote (for AMM swaps)
  useEffect(() => {
    if (!quote) return;
    if (direction === 'sell') {
      setToAmount(quote.displayBuyAmount);
    } else {
      setFromAmount(quote.displaySellAmount);
    }
  }, [quote?.displayBuyAmount, quote?.displaySellAmount, direction]);

  // For bridge pairs, calculate conversion through bUSD
  useEffect(() => {
    if (!shouldSkipQuote) return; // Only for bridge pairs
    if (!fromAmount && !toAmount) return;
    if (!fromToken || !toToken) return;
    
    // Direct bridge: USDT/USDC <-> bUSD is 1:1
    const isDirectBridge = 
      (isBridgeToken(fromToken.id) && toToken.id === BUSD_ALKANE_ID) ||
      (fromToken.id === BUSD_ALKANE_ID && isBridgeToken(toToken.id));
    
    if (isDirectBridge) {
      if (direction === 'sell' && fromAmount) {
        setToAmount(fromAmount);
      } else if (direction === 'buy' && toAmount) {
        setFromAmount(toAmount);
      }
    }
    
    // Multi-hop routing: USDT/USDC -> Other or Other -> USDT/USDC
    // For now, we'll need a quote from the AMM for the alkane side
    // The bridge side is always 1:1, but we need to query the alkane swap
    // This will be handled by computing quotes for each leg separately
    
  }, [fromAmount, toAmount, direction, shouldSkipQuote, fromToken, toToken, BUSD_ALKANE_ID]);

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
      if (token) setToToken(token);
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
    } else if (fromToken.id === VIRTUAL_TOKEN_IDS.USDT) {
      const balance = parseFloat(usdtBalance || '0');
      setDirection('sell');
      setFromAmount(balance.toFixed(6));
    } else if (fromToken.id === VIRTUAL_TOKEN_IDS.USDC) {
      const balance = parseFloat(usdcBalance || '0');
      setDirection('sell');
      setFromAmount(balance.toFixed(6));
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
    } else if (fromToken.id === VIRTUAL_TOKEN_IDS.USDT) {
      const balance = parseFloat(usdtBalance || '0');
      setDirection('sell');
      setFromAmount((balance * percent).toFixed(6));
    } else if (fromToken.id === VIRTUAL_TOKEN_IDS.USDC) {
      const balance = parseFloat(usdcBalance || '0');
      setDirection('sell');
      setFromAmount((balance * percent).toFixed(6));
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

      {/* Bridge Deposit Modal */}
      {bridgeModalConfig && (
        <BridgeDepositModal
          isOpen={isBridgeModalOpen}
          onClose={() => {
            setIsBridgeModalOpen(false);
            setBridgeModalConfig(null);
          }}
          tokenType={bridgeModalConfig.tokenType}
          amount={bridgeModalConfig.amount}
          targetToken={bridgeModalConfig.targetToken}
          onSuccess={(txHash) => {
            // If this is a multi-hop swap, add to pending queue
            if (bridgeModalConfig.targetToken && toToken) {
              const pendingSwapId = addPendingSwap({
                fromToken: bridgeModalConfig.tokenType,
                toToken: toToken.id,
                expectedBusdAmount: bridgeModalConfig.amount,
                targetToken: toToken.id,
                targetSymbol: (toToken.symbol || toToken.name) ?? toToken.id,
                bridgeEthTxHash: txHash,
                maxSlippage: parseFloat(maxSlippage),
                feeRate: fee.feeRate || 1,
              });
              console.log('Added pending swap:', pendingSwapId);
            }

            setIsBridgeModalOpen(false);
            setBridgeModalConfig(null);
            setFromAmount('');
            setToAmount('');
            const message = bridgeModalConfig.targetToken
              ? `Bridge transaction submitted!\n\nTX: ${txHash}\n\nYour ${bridgeModalConfig.tokenType} will bridge to bUSD (~15-30 min), then automatically swap to ${bridgeModalConfig.targetToken}. Check the Activity page to monitor progress.`
              : `Bridge transaction submitted!\n\nTX: ${txHash}\n\nYour bUSD will arrive in ~15-30 minutes. Check the Activity page to monitor progress.`;
            window.alert(message);
          }}
        />
      )}
      
      <section className="relative mx-auto w-full max-w-[540px] rounded-[24px] border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 sm:p-9 shadow-[0_12px_48px_rgba(40,67,114,0.18)] backdrop-blur-xl">
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

      <PoolDetailsCard pool={selectedPool} />

      <MarketsGrid pools={markets} onSelect={handleSelectPool} />

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
