import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';

export interface OrderLevel {
  price: string;
  amount: string;
  total: string;
}

export interface OrderbookData {
  bids: OrderLevel[];
  asks: OrderLevel[];
  spread: string;
  spreadPercent: string;
  midPrice: string;
}

function generateOrderLevels(
  startPrice: number,
  direction: 'up' | 'down',
  count: number,
  step: number,
): OrderLevel[] {
  const levels: OrderLevel[] = [];
  let cumTotal = 0;
  for (let i = 0; i < count; i++) {
    const price = direction === 'down'
      ? startPrice - (i * step)
      : startPrice + (i * step);
    // Varying sizes — some clustered, some sparse
    const amount = parseFloat((Math.random() * 2.5 + 0.05).toFixed(4));
    const total = price * amount;
    cumTotal += total;
    levels.push({
      price: price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amount.toFixed(4),
      total: cumTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
  }
  return levels;
}

// Stable seed-based mock (deterministic within session)
let cachedBook: OrderbookData | null = null;

function getMockOrderbook(): OrderbookData {
  if (cachedBook) return cachedBook;

  const midPrice = 99875.00;
  const halfSpread = 25;

  const bids = generateOrderLevels(midPrice - halfSpread, 'down', 15, 50);
  const asks = generateOrderLevels(midPrice + halfSpread, 'up', 15, 50);

  const bestBid = midPrice - halfSpread;
  const bestAsk = midPrice + halfSpread;
  const spread = bestAsk - bestBid;

  cachedBook = {
    bids,
    asks,
    spread: spread.toFixed(2),
    spreadPercent: ((spread / midPrice) * 100).toFixed(3),
    midPrice: midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
  return cachedBook;
}

export function useOrderbook(baseToken?: string, quoteToken?: string) {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['orderbook', baseToken, quoteToken, network],
    queryFn: async (): Promise<OrderbookData | null> => {
      if (!baseToken || !quoteToken || !network) return null;

      // TODO: Connect to carbine controller opcode 24 (GetOrderbookDepth)
      // via alkanes_simulate for live data
      return getMockOrderbook();
    },
    enabled: !!baseToken && !!quoteToken && !!network,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}
