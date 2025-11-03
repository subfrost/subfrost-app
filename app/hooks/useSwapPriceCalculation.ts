import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';

import type { Direction, SwapQuote } from '@/app/components/swap/types';
import { useWallet } from '@/app/contexts/WalletContext';
import { getApiProvider } from '@/app/utils/oylProvider';
import { getConfig } from '@/app/utils/getConfig';
import { formatAlkanes } from '@/app/utils/alkanes';

const DECIMALS = 8;
const FEE_PCT = 0.003; // protocol fee approximation (0.3%)

function toAlks(amount: string): number {
  const n = parseFloat(amount || '0');
  if (!isFinite(n) || n <= 0) return 0;
  return Math.floor(n * Math.pow(10, DECIMALS));
}

function fromAlks(alks: number): string {
  return formatAlkanes(String(alks), DECIMALS, DECIMALS);
}

export const useSwapPriceCalculation = (
  sellCurrency: string,
  buyCurrency: string,
  amount: string,
  direction: Direction,
  maxSlippage: string,
) => {
  const [debouncedAmount] = useDebounce(amount, 250);
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const api = getApiProvider(network);

  const sellId = sellCurrency;
  const buyId = buyCurrency;

  return useQuery({
    queryKey: ['swap-quote', direction, sellId, buyId, debouncedAmount, network, maxSlippage],
    enabled: !!sellId && !!buyId && !!debouncedAmount && isFinite(parseFloat(debouncedAmount)) && parseFloat(debouncedAmount) > 0,
    queryFn: async (): Promise<SwapQuote> => {
      const numeric = parseFloat(debouncedAmount || '0');
      // Fetch pairs on-demand (avoid separate hooks to prevent extra re-renders)
      const [sellPairs, buyPairs] = await Promise.all([
        api.getAlkanesTokenPairs({
          factoryId: parseId(ALKANE_FACTORY_ID),
          alkaneId: parseId(sellId),
        }),
        api.getAlkanesTokenPairs({
          factoryId: parseId(ALKANE_FACTORY_ID),
          alkaneId: parseId(buyId),
        }),
      ]);
      if (!sellPairs?.length || !buyPairs?.length) {
        return emptyQuote(direction, debouncedAmount, 'POOL_NOT_FOUND');
      }
      if (!isFinite(numeric) || numeric <= 0) {
        return emptyQuote(direction, debouncedAmount);
      }

      const direct = sellPairs.find(
        (p) => (p.token0.id === sellId && p.token1.id === buyId) || (p.token0.id === buyId && p.token1.id === sellId),
      );
      if (!direct) {
        return emptyQuote(direction, debouncedAmount, 'NO_ROUTE_FOUND');
      }

      const isSellToken0 = direct.token0.id === sellId;
      const reserveIn = isSellToken0 ? Number(direct.token0Amount) : Number(direct.token1Amount);
      const reserveOut = isSellToken0 ? Number(direct.token1Amount) : Number(direct.token0Amount);

      try {
        if (direction === 'sell') {
          const amountIn = toAlks(debouncedAmount);
          const amountInWithFee = Math.floor(amountIn * (1 - FEE_PCT));
          const numerator = amountInWithFee * reserveOut;
          const denominator = reserveIn + amountInWithFee;
          const out = Math.floor(numerator / denominator);

          return {
            direction,
            inputAmount: debouncedAmount,
            sellAmount: String(amountIn),
            buyAmount: String(out),
            exchangeRate: reserveIn > 0 ? String(out / amountIn) : '0',
            minimumReceived: String(Math.floor(out * (1 - parseFloat(maxSlippage || '0')))),
            maximumSent: String(Math.floor(amountIn * (1 + parseFloat(maxSlippage || '0')))),
            sellCurrency: null,
            buyCurrency: null,
            displaySellAmount: debouncedAmount,
            displayBuyAmount: fromAlks(out),
            displayMinimumReceived: fromAlks(
              Math.floor(out * (1 - parseFloat(maxSlippage || '0'))),
            ),
            displayMaximumSent: fromAlks(
              Math.floor(amountIn * (1 + parseFloat(maxSlippage || '0'))),
            ),
          };
        } else {
          // direction === 'buy'
          const amountOut = toAlks(debouncedAmount);
          if (amountOut >= reserveOut) throw new Error('INSUFFICIENT_LIQUIDITY');
          const amountInWithFee = Math.ceil((amountOut * reserveIn) / (reserveOut - amountOut));
          const amountIn = Math.ceil(amountInWithFee / (1 - FEE_PCT));
          return {
            direction,
            inputAmount: debouncedAmount,
            sellAmount: String(amountIn),
            buyAmount: String(amountOut),
            exchangeRate: reserveIn > 0 ? String(amountOut / amountIn) : '0',
            minimumReceived: String(Math.floor(amountOut * (1 - parseFloat(maxSlippage || '0')))),
            maximumSent: String(Math.floor(amountIn * (1 + parseFloat(maxSlippage || '0')))),
            sellCurrency: null,
            buyCurrency: null,
            displaySellAmount: fromAlks(amountIn),
            displayBuyAmount: debouncedAmount,
            displayMinimumReceived: fromAlks(
              Math.floor(amountOut * (1 - parseFloat(maxSlippage || '0'))),
            ),
            displayMaximumSent: fromAlks(
              Math.floor(amountIn * (1 + parseFloat(maxSlippage || '0'))),
            ),
          };
        }
      } catch (e) {
        return emptyQuote(direction, debouncedAmount, 'INSUFFICIENT_LIQUIDITY');
      }
    },
  });
};

function emptyQuote(direction: Direction, inputAmount: string, error?: string): SwapQuote {
  return {
    direction,
    inputAmount,
    buyAmount: '0',
    sellAmount: '0',
    exchangeRate: '0',
    minimumReceived: '0',
    maximumSent: '0',
    sellCurrency: null,
    buyCurrency: null,
    displayBuyAmount: '0',
    displaySellAmount: '0',
    displayMinimumReceived: '0',
    displayMaximumSent: '0',
    ...(error ? { error } : {}),
  } as SwapQuote;
}

function parseId(id: string): { block: string; tx: string } {
  const [block, tx] = (id || '').split(':');
  return { block, tx } as any;
}


