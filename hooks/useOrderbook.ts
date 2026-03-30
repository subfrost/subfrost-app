import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';

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

/**
 * Returns an empty orderbook. Used as fallback when carbine controller
 * is not deployed or the query fails.
 */
function getEmptyOrderbook(): OrderbookData {
  return {
    bids: [],
    asks: [],
    spread: '0.00',
    spreadPercent: '0.000',
    midPrice: '0.00',
  };
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

export function useOrderbook(baseToken?: string, quoteToken?: string, depth: number = 10) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  return useQuery({
    queryKey: ['orderbook', baseToken, quoteToken, network, depth],
    queryFn: async (): Promise<OrderbookData | null> => {
      if (!baseToken || !quoteToken || !network) return null;

      const config = getConfig(network);
      const controllerId = (config as any).CARBINE_CONTROLLER_ID;

      if (controllerId && provider) {
        try {
          // Parse token pair IDs for the controller query
          const [baseBlock, baseTx] = baseToken.includes(':') ? baseToken.split(':').map(Number) : [0, 0];
          const [quoteBlock, quoteTx] = quoteToken.includes(':') ? quoteToken.split(':').map(Number) : [0, 0];

          // Build calldata: opcode 24 + pair tokens + depth
          const calldata = encodeSimulateCalldata(controllerId, [24, baseBlock, baseTx, quoteBlock, quoteTx, depth]);

          const context = JSON.stringify({
            alkanes: [],
            calldata,
            height: 1000000,
            txindex: 0,
            pointer: 0,
            refund_pointer: 0,
            vout: 0,
            transaction: [],
            block: [],
          });

          const result = await provider.alkanesSimulate(controllerId, context, 'latest');

          if (result?.execution?.data && !result?.execution?.error) {
            const parsed = parseOrderbookResponse(result.execution.data);
            if (parsed) return parsed;
          }
        } catch (err) {
          // Controller not deployed or query failed — fall through to empty
        }
      }

      // Return empty orderbook when controller is not deployed or query fails
      return getEmptyOrderbook();
    },
    enabled: !!baseToken && !!quoteToken && !!network && isInitialized,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}
