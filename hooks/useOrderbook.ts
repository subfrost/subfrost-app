import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

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

/**
 * Parse a u128 from 16 little-endian bytes at offset
 */
function readU128LE(bytes: number[], offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 16 && offset + i < bytes.length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

/**
 * Parse orderbook response from carbine controller opcode 24 (GetOrderbookDepth).
 * Expected format: u128 numLevels, then for each level: u128 price, u128 amount (bids), then asks.
 * Falls back to null if format is unrecognized.
 */
function parseOrderbookResponse(data: string | number[]): OrderbookData | null {
  const bytes = typeof data === 'string'
    ? Array.from(Buffer.from(data.replace(/^0x/, ''), 'hex'))
    : data;

  if (bytes.length < 16) return null;

  // Parse: u128 numBids, [price, amount] * numBids, u128 numAsks, [price, amount] * numAsks
  let offset = 0;
  const numBids = Number(readU128LE(bytes, offset));
  offset += 16;

  if (numBids > 100 || offset + numBids * 32 > bytes.length) return null;

  const bids: OrderLevel[] = [];
  let bidCumTotal = 0;
  for (let i = 0; i < numBids; i++) {
    const priceRaw = Number(readU128LE(bytes, offset)) / 1e8;
    const amountRaw = Number(readU128LE(bytes, offset + 16)) / 1e8;
    bidCumTotal += priceRaw * amountRaw;
    bids.push({
      price: priceRaw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amountRaw.toFixed(4),
      total: bidCumTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
    offset += 32;
  }

  if (offset + 16 > bytes.length) return null;
  const numAsks = Number(readU128LE(bytes, offset));
  offset += 16;

  if (numAsks > 100 || offset + numAsks * 32 > bytes.length) return null;

  const asks: OrderLevel[] = [];
  let askCumTotal = 0;
  for (let i = 0; i < numAsks; i++) {
    const priceRaw = Number(readU128LE(bytes, offset)) / 1e8;
    const amountRaw = Number(readU128LE(bytes, offset + 16)) / 1e8;
    askCumTotal += priceRaw * amountRaw;
    asks.push({
      price: priceRaw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amountRaw.toFixed(4),
      total: askCumTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
    offset += 32;
  }

  if (bids.length === 0 && asks.length === 0) return null;

  const bestBid = bids.length > 0 ? parseFloat(bids[0].price.replace(/,/g, '')) : 0;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price.replace(/,/g, '')) : 0;
  const midPrice = (bestBid + bestAsk) / 2 || bestBid || bestAsk;
  const spread = bestAsk - bestBid;

  return {
    bids,
    asks,
    spread: spread.toFixed(2),
    spreadPercent: midPrice > 0 ? ((spread / midPrice) * 100).toFixed(3) : '0.000',
    midPrice: midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
}

export function useOrderbook(baseToken?: string, quoteToken?: string) {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['orderbook', baseToken, quoteToken, network],
    queryFn: async (): Promise<OrderbookData | null> => {
      if (!baseToken || !quoteToken || !network) return null;

      // Try carbine controller opcode 24 (GetOrderbookDepth) via alkanes_simulate
      const config = getConfig(network);
      const controllerId = (config as any).CARBINE_CONTROLLER_ID;

      if (controllerId) {
        try {
          const [ctrlBlock, ctrlTx] = controllerId.split(':');
          // Parse token pair IDs for the controller query
          const [baseBlock, baseTx] = baseToken.includes(':') ? baseToken.split(':') : ['0', '0'];
          const [quoteBlock, quoteTx] = quoteToken.includes(':') ? quoteToken.split(':') : ['0', '0'];

          const resp = await fetch(`/api/rpc/${network}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alkanes_simulate',
              params: [{
                target: { block: ctrlBlock, tx: ctrlTx },
                inputs: ['24', baseBlock, baseTx, quoteBlock, quoteTx],
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '999999',
                txindex: 0,
                vout: 0,
              }],
              id: 1,
            }),
          });
          const data = await resp.json();
          const exec = data?.result?.execution;

          if (exec?.data && !exec.error) {
            const parsed = parseOrderbookResponse(exec.data);
            if (parsed) return parsed;
          }
        } catch (err) {
          console.warn('[useOrderbook] Carbine controller query failed, falling back to mock:', err);
        }
      }

      // Fallback: mock orderbook when controller is not deployed or query fails
      return getMockOrderbook();
    },
    enabled: !!baseToken && !!quoteToken && !!network,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}
