import { useQuery } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useDebounce } from 'use-debounce';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesTokenPairs, type AlkanesTokenPair } from '@/hooks/useAlkanesTokenPairs';
import { queryPoolFee } from '@/hooks/usePoolFee';
import { getSandshrewProvider } from '@/utils/oylProvider';
import { FRBTC_UNWRAP_FEE_PER_1000, FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { calculateMaximumFromSlippage, calculateMinimumFromSlippage } from '@/utils/amm';

type Direction = 'buy' | 'sell';

export type SwapQuote = {
  direction: Direction;
  inputAmount: string; // in display units
  buyAmount: string; // alks
  sellAmount: string; // alks
  exchangeRate: string;
  minimumReceived: string; // alks
  maximumSent: string; // alks
  displayBuyAmount: string; // display units
  displaySellAmount: string; // display units
  displayMinimumReceived: string; // display units
  displayMaximumSent: string; // display units
  error?: string;
  route?: string[];
  hops?: number;
};

const ALKS_DECIMALS = 8;
const toAlks = (amount: string): string => {
  if (!amount) return '0';
  return new BigNumber(amount)
    .multipliedBy(new BigNumber(10).pow(ALKS_DECIMALS))
    .integerValue(BigNumber.ROUND_FLOOR)
    .toString();
};
const fromAlks = (alks: string, displayPlaces = 8): string => {
  if (!alks) return '0';
  return new BigNumber(alks)
    .dividedBy(new BigNumber(10).pow(ALKS_DECIMALS))
    .toFixed(displayPlaces);
};

const swapCalculateOut = ({
  amountIn,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountIn: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number => {
  if (amountIn <= 0) throw new Error('INSUFFICIENT_INPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = amountIn * (1 - feePercentage);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return Math.floor(numerator / denominator);
};

const swapCalculateIn = ({
  amountOut,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountOut: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number => {
  if (amountOut <= 0) throw new Error('INSUFFICIENT_OUTPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  if (amountOut >= reserveOut) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = (amountOut * reserveIn) / (reserveOut - amountOut);
  const amountIn = amountInWithFee / (1 - feePercentage);
  return Math.ceil(amountIn);
};

async function calculateSwapPrice(
  sellCurrency: string,
  buyCurrency: string,
  amount: string,
  direction: Direction,
  maxSlippage: string,
  pool: AlkanesTokenPair,
  network: any,
) {
  const provider = getSandshrewProvider(network);
  const poolFee = await queryPoolFee(provider, pool.poolId);
  let buyAmount: string;
  let sellAmount: string;
  const amountInAlks = toAlks(amount);
  const amountNumeric = parseFloat(amount);
  if (!amount || !Number.isFinite(amountNumeric) || amountNumeric === 0) {
    return {
      direction,
      inputAmount: amount,
      buyAmount: '0',
      sellAmount: '0',
      exchangeRate: '0',
      minimumReceived: '0',
      maximumSent: '0',
      displayBuyAmount: '0',
      displaySellAmount: '0',
      displayMinimumReceived: '0',
      displayMaximumSent: '0',
    } as SwapQuote;
  }

  const isSellToken0 = pool?.token0.id === sellCurrency;
  const reserveIn = isSellToken0 ? Number(pool?.token0.token0Amount) : Number(pool?.token1.token1Amount);
  const reserveOut = isSellToken0 ? Number(pool?.token1.token1Amount) : Number(pool?.token0.token0Amount);

  if (direction === 'sell') {
    let amountIn = Number(amountInAlks);
    if (sellCurrency === 'btc') {
      amountIn = (amountIn * (1000 - FRBTC_WRAP_FEE_PER_1000)) / 1000;
    }
    let calculatedOut = swapCalculateOut({ amountIn, reserveIn, reserveOut, feePercentage: poolFee });
    if (buyCurrency === 'btc') {
      calculatedOut = (calculatedOut * (1000 - FRBTC_UNWRAP_FEE_PER_1000)) / 1000;
    }
    sellAmount = amountInAlks;
    buyAmount = calculatedOut.toString();
  } else {
    let amountOut = Number(amountInAlks);
    if (buyCurrency === 'btc') {
      amountOut = (amountOut * (1000 + FRBTC_UNWRAP_FEE_PER_1000)) / 1000;
    }
    let calculatedIn = swapCalculateIn({ amountOut, reserveIn, reserveOut, feePercentage: poolFee });
    if (sellCurrency === 'btc') {
      calculatedIn = (calculatedIn * (1000 + FRBTC_WRAP_FEE_PER_1000)) / 1000;
    }
    buyAmount = amountInAlks;
    sellAmount = calculatedIn.toString();
  }

  const exchangeRate = new BigNumber(buyAmount || '0').dividedBy(sellAmount || '1').toString();
  const minReceivedInAlks = calculateMinimumFromSlippage({ amount: buyAmount, maxSlippage });
  const maxSentInAlks = calculateMaximumFromSlippage({ amount: sellAmount, maxSlippage });

  return {
    direction,
    inputAmount: amount,
    buyAmount,
    sellAmount: direction !== 'sell' ? maxSentInAlks : sellAmount,
    exchangeRate,
    minimumReceived: minReceivedInAlks,
    maximumSent: maxSentInAlks,
    displayBuyAmount: fromAlks(buyAmount),
    displaySellAmount: direction !== 'sell' ? fromAlks(maxSentInAlks) : fromAlks(sellAmount),
    displayMinimumReceived: fromAlks(minReceivedInAlks),
    displayMaximumSent: fromAlks(maxSentInAlks),
  } as SwapQuote;
}

export function useSwapQuotes(
  sellCurrency: string,
  buyCurrency: string,
  amount: string,
  direction: Direction,
  maxSlippage: string,
) {
  const [debouncedAmount] = useDebounce(amount, 300);
  const { network } = useWallet();
  const { BUSD_ALKANE_ID, FRBTC_ALKANE_ID } = getConfig(network);
  const sellCurrencyId = sellCurrency === 'btc' ? FRBTC_ALKANE_ID : sellCurrency;
  const buyCurrencyId = buyCurrency === 'btc' ? FRBTC_ALKANE_ID : buyCurrency;

  const { data: sellPairs, isFetching: fetchingSell } = useAlkanesTokenPairs(sellCurrencyId);
  const { data: buyPairs, isFetching: fetchingBuy } = useAlkanesTokenPairs(buyCurrencyId);

  return useQuery<SwapQuote>({
    queryKey: [
      'swap-quotes',
      direction,
      sellCurrencyId,
      buyCurrencyId,
      debouncedAmount,
      sellPairs,
      buyPairs,
      maxSlippage,
    ],
    enabled: !!sellCurrencyId && !!buyCurrencyId,
    queryFn: async () => {
      if (fetchingSell || fetchingBuy) {
        return {
          direction,
          inputAmount: amount,
          buyAmount: '0',
          sellAmount: '0',
          exchangeRate: '0',
          minimumReceived: '0',
          maximumSent: '0',
          displayBuyAmount: '0',
          displaySellAmount: '0',
          displayMinimumReceived: '0',
          displayMaximumSent: '0',
        } as SwapQuote;
      }
      if (!sellPairs?.length || !buyPairs?.length) {
        return {
          direction,
          inputAmount: amount,
          buyAmount: '0',
          sellAmount: '0',
          exchangeRate: '0',
          minimumReceived: '0',
          maximumSent: '0',
          displayBuyAmount: '0',
          displaySellAmount: '0',
          displayMinimumReceived: '0',
          displayMaximumSent: '0',
          error: 'POOL_NOT_FOUND',
        } as SwapQuote;
      }

      const direct = sellPairs.find(
        (p) =>
          (p.token0.id === sellCurrencyId && p.token1.id === buyCurrencyId) ||
          (p.token0.id === buyCurrencyId && p.token1.id === sellCurrencyId),
      );
      if (direct) {
        return calculateSwapPrice(
          sellCurrencyId,
          buyCurrencyId,
          debouncedAmount,
          direction,
          maxSlippage,
          direct,
          network,
        );
      }

      const sellToBusd = sellPairs.find(
        (p) => p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID,
      );
      const buyToBusd = buyPairs.find(
        (p) => p.token0.id === BUSD_ALKANE_ID || p.token1.id === BUSD_ALKANE_ID,
      );
      if (sellToBusd && buyToBusd) {
        const mid = BUSD_ALKANE_ID;
        if (direction === 'sell') {
          const firstHop = await calculateSwapPrice(
            sellCurrencyId,
            mid,
            debouncedAmount,
            'sell',
            maxSlippage,
            sellToBusd,
            network,
          );
          const secondHop = await calculateSwapPrice(
            mid,
            buyCurrencyId,
            firstHop.displayBuyAmount,
            'sell',
            maxSlippage,
            buyToBusd,
            network,
          );
          return { ...secondHop, direction: 'sell', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote;
        } else {
          const secondHop = await calculateSwapPrice(
            mid,
            buyCurrencyId,
            debouncedAmount,
            'buy',
            maxSlippage,
            buyToBusd,
            network,
          );
          const firstHop = await calculateSwapPrice(
            sellCurrencyId,
            mid,
            secondHop.displaySellAmount,
            'buy',
            maxSlippage,
            sellToBusd,
            network,
          );
          return { ...firstHop, direction: 'buy', inputAmount: debouncedAmount, route: [sellCurrencyId, mid, buyCurrencyId], hops: 2 } as SwapQuote;
        }
      }

      return {
        direction,
        inputAmount: amount,
        buyAmount: '0',
        sellAmount: '0',
        exchangeRate: '0',
        minimumReceived: '0',
        maximumSent: '0',
        displayBuyAmount: '0',
        displaySellAmount: '0',
        displayMinimumReceived: '0',
        displayMaximumSent: '0',
        error: 'NO_ROUTE_FOUND',
      } as SwapQuote;
    },
  });
}


