import { useMemo } from 'react';
import { getConfig } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';
import { VIRTUAL_TOKEN_IDS } from '@/constants/bridge';

/**
 * Routing step types for multi-hop swaps
 */
export type RouteStepType = 'wrap' | 'unwrap' | 'bridge-in' | 'bridge-out' | 'swap';

export interface RouteStep {
  type: RouteStepType;
  from: string;
  to: string;
  fromSymbol: string;
  toSymbol: string;
  description: string;
  requiresEthereum?: boolean; // Bridge in
  requiresBitcoin?: boolean;  // All others
}

export interface SwapRoute {
  fromToken: string;
  toToken: string;
  steps: RouteStep[];
  isDirectSwap: boolean;
  requiresBridge: boolean;
  requiresMultipleTransactions: boolean;
}

/**
 * Hook to calculate optimal routing path for any token pair
 */
export function useSwapRouting(
  fromTokenId?: string,
  toTokenId?: string,
  fromSymbol?: string,
  toSymbol?: string
): SwapRoute | null {
  const { network } = useWallet();
  const config = getConfig(network);
  const { FRBTC_ALKANE_ID, BUSD_ALKANE_ID } = config;

  return useMemo(() => {
    if (!fromTokenId || !toTokenId) return null;

    const isBridgeToken = (id: string) =>
      id === VIRTUAL_TOKEN_IDS.USDT || id === VIRTUAL_TOKEN_IDS.USDC;

    const steps: RouteStep[] = [];

    // SCENARIO 1: BTC -> frBTC (Wrap)
    if (fromTokenId === 'btc' && toTokenId === FRBTC_ALKANE_ID) {
      steps.push({
        type: 'wrap',
        from: 'btc',
        to: FRBTC_ALKANE_ID,
        fromSymbol: 'BTC',
        toSymbol: 'frBTC',
        description: 'Wrap BTC to frBTC',
        requiresBitcoin: true,
      });
      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: true,
        requiresBridge: false,
        requiresMultipleTransactions: false,
      };
    }

    // SCENARIO 2: frBTC -> BTC (Unwrap)
    if (fromTokenId === FRBTC_ALKANE_ID && toTokenId === 'btc') {
      steps.push({
        type: 'unwrap',
        from: FRBTC_ALKANE_ID,
        to: 'btc',
        fromSymbol: 'frBTC',
        toSymbol: 'BTC',
        description: 'Unwrap frBTC to BTC',
        requiresBitcoin: true,
      });
      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: true,
        requiresBridge: false,
        requiresMultipleTransactions: false,
      };
    }

    // SCENARIO 3: USDT/USDC -> bUSD (Direct Bridge In)
    if (isBridgeToken(fromTokenId) && toTokenId === BUSD_ALKANE_ID) {
      steps.push({
        type: 'bridge-in',
        from: fromTokenId,
        to: BUSD_ALKANE_ID,
        fromSymbol: fromSymbol || 'USDT/USDC',
        toSymbol: 'bUSD',
        description: `Bridge ${fromSymbol} to bUSD (Ethereum → Bitcoin)`,
        requiresEthereum: true,
      });
      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: false,
        requiresBridge: true,
        requiresMultipleTransactions: false,
      };
    }

    // SCENARIO 4: bUSD -> USDT/USDC (Direct Bridge Out)
    if (fromTokenId === BUSD_ALKANE_ID && isBridgeToken(toTokenId)) {
      steps.push({
        type: 'bridge-out',
        from: BUSD_ALKANE_ID,
        to: toTokenId,
        fromSymbol: 'bUSD',
        toSymbol: toSymbol || 'USDT/USDC',
        description: `Bridge bUSD to ${toSymbol} (Bitcoin → Ethereum)`,
        requiresBitcoin: true,
      });
      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: false,
        requiresBridge: true,
        requiresMultipleTransactions: false,
      };
    }

    // SCENARIO 5: USDT/USDC -> Other Token (Bridge + Swap)
    if (isBridgeToken(fromTokenId) && !isBridgeToken(toTokenId) && toTokenId !== BUSD_ALKANE_ID) {
      // Step 1: Bridge to bUSD
      steps.push({
        type: 'bridge-in',
        from: fromTokenId,
        to: BUSD_ALKANE_ID,
        fromSymbol: fromSymbol || 'USDT/USDC',
        toSymbol: 'bUSD',
        description: `Bridge ${fromSymbol} to bUSD`,
        requiresEthereum: true,
      });

      // Step 2: Handle final destination
      if (toTokenId === 'btc') {
        // bUSD -> frBTC -> BTC
        steps.push({
          type: 'swap',
          from: BUSD_ALKANE_ID,
          to: FRBTC_ALKANE_ID,
          fromSymbol: 'bUSD',
          toSymbol: 'frBTC',
          description: 'Swap bUSD to frBTC',
          requiresBitcoin: true,
        });
        steps.push({
          type: 'unwrap',
          from: FRBTC_ALKANE_ID,
          to: 'btc',
          fromSymbol: 'frBTC',
          toSymbol: 'BTC',
          description: 'Unwrap frBTC to BTC',
          requiresBitcoin: true,
        });
      } else if (toTokenId === FRBTC_ALKANE_ID) {
        // bUSD -> frBTC
        steps.push({
          type: 'swap',
          from: BUSD_ALKANE_ID,
          to: FRBTC_ALKANE_ID,
          fromSymbol: 'bUSD',
          toSymbol: 'frBTC',
          description: 'Swap bUSD to frBTC',
          requiresBitcoin: true,
        });
      } else {
        // bUSD -> Token
        steps.push({
          type: 'swap',
          from: BUSD_ALKANE_ID,
          to: toTokenId,
          fromSymbol: 'bUSD',
          toSymbol: toSymbol || 'Token',
          description: `Swap bUSD to ${toSymbol}`,
          requiresBitcoin: true,
        });
      }

      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: false,
        requiresBridge: true,
        requiresMultipleTransactions: true,
      };
    }

    // SCENARIO 6: Other Token -> USDT/USDC (Swap + Bridge)
    if (!isBridgeToken(fromTokenId) && fromTokenId !== BUSD_ALKANE_ID && isBridgeToken(toTokenId)) {
      // Step 1: Get to bUSD
      if (fromTokenId === 'btc') {
        // BTC -> frBTC -> bUSD
        steps.push({
          type: 'wrap',
          from: 'btc',
          to: FRBTC_ALKANE_ID,
          fromSymbol: 'BTC',
          toSymbol: 'frBTC',
          description: 'Wrap BTC to frBTC',
          requiresBitcoin: true,
        });
        steps.push({
          type: 'swap',
          from: FRBTC_ALKANE_ID,
          to: BUSD_ALKANE_ID,
          fromSymbol: 'frBTC',
          toSymbol: 'bUSD',
          description: 'Swap frBTC to bUSD',
          requiresBitcoin: true,
        });
      } else if (fromTokenId === FRBTC_ALKANE_ID) {
        // frBTC -> bUSD
        steps.push({
          type: 'swap',
          from: FRBTC_ALKANE_ID,
          to: BUSD_ALKANE_ID,
          fromSymbol: 'frBTC',
          toSymbol: 'bUSD',
          description: 'Swap frBTC to bUSD',
          requiresBitcoin: true,
        });
      } else {
        // Token -> bUSD (may route through frBTC if needed)
        steps.push({
          type: 'swap',
          from: fromTokenId,
          to: BUSD_ALKANE_ID,
          fromSymbol: fromSymbol || 'Token',
          toSymbol: 'bUSD',
          description: `Swap ${fromSymbol} to bUSD`,
          requiresBitcoin: true,
        });
      }

      // Step 2: Bridge out
      steps.push({
        type: 'bridge-out',
        from: BUSD_ALKANE_ID,
        to: toTokenId,
        fromSymbol: 'bUSD',
        toSymbol: toSymbol || 'USDT/USDC',
        description: `Bridge bUSD to ${toSymbol}`,
        requiresBitcoin: true,
      });

      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: false,
        requiresBridge: true,
        requiresMultipleTransactions: true,
      };
    }

    // SCENARIO 7: Token -> BTC (via frBTC)
    if (!isBridgeToken(fromTokenId) && fromTokenId !== 'btc' && toTokenId === 'btc') {
      // Step 1: Token -> frBTC
      if (fromTokenId !== FRBTC_ALKANE_ID) {
        steps.push({
          type: 'swap',
          from: fromTokenId,
          to: FRBTC_ALKANE_ID,
          fromSymbol: fromSymbol || 'Token',
          toSymbol: 'frBTC',
          description: `Swap ${fromSymbol} to frBTC`,
          requiresBitcoin: true,
        });
      }

      // Step 2: frBTC -> BTC
      steps.push({
        type: 'unwrap',
        from: FRBTC_ALKANE_ID,
        to: 'btc',
        fromSymbol: 'frBTC',
        toSymbol: 'BTC',
        description: 'Unwrap frBTC to BTC',
        requiresBitcoin: true,
      });

      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: false,
        requiresBridge: false,
        requiresMultipleTransactions: steps.length > 1,
      };
    }

    // SCENARIO 8: BTC -> Token (via frBTC)
    if (fromTokenId === 'btc' && !isBridgeToken(toTokenId) && toTokenId !== FRBTC_ALKANE_ID) {
      // Step 1: BTC -> frBTC
      steps.push({
        type: 'wrap',
        from: 'btc',
        to: FRBTC_ALKANE_ID,
        fromSymbol: 'BTC',
        toSymbol: 'frBTC',
        description: 'Wrap BTC to frBTC',
        requiresBitcoin: true,
      });

      // Step 2: frBTC -> Token
      steps.push({
        type: 'swap',
        from: FRBTC_ALKANE_ID,
        to: toTokenId,
        fromSymbol: 'frBTC',
        toSymbol: toSymbol || 'Token',
        description: `Swap frBTC to ${toSymbol}`,
        requiresBitcoin: true,
      });

      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: false,
        requiresBridge: false,
        requiresMultipleTransactions: true,
      };
    }

    // SCENARIO 9: Regular Token <-> Token Swap
    // This could be direct or routed through bUSD/frBTC
    if (!isBridgeToken(fromTokenId) && !isBridgeToken(toTokenId) &&
        fromTokenId !== 'btc' && toTokenId !== 'btc') {
      steps.push({
        type: 'swap',
        from: fromTokenId,
        to: toTokenId,
        fromSymbol: fromSymbol || 'Token A',
        toSymbol: toSymbol || 'Token B',
        description: `Swap ${fromSymbol} to ${toSymbol}`,
        requiresBitcoin: true,
      });

      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        steps,
        isDirectSwap: true,
        requiresBridge: false,
        requiresMultipleTransactions: false,
      };
    }

    // Fallback: couldn't determine route
    return null;
  }, [fromTokenId, toTokenId, fromSymbol, toSymbol, FRBTC_ALKANE_ID, BUSD_ALKANE_ID]);
}
