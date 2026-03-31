import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';

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
 * Parse a u32 from 4 little-endian bytes at offset
 */
export function readU32LE(bytes: number[], offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>> 0
  );
}

/**
 * Parse a u128 from 16 little-endian bytes at offset
 */
export function readU128LE(bytes: number[], offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 16 && offset + i < bytes.length; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }
  return value;
}

// Maximum u128 value — used to un-invert ask prices from trie encoding
const MAX_U128 = (1n << 128n) - 1n;

/**
 * Parse orderbook response from carbine controller opcode 24 (GetOrderbookDepth).
 *
 * Binary format (verified against devnet contract 2026-03-31):
 *   u32 numBids (4 bytes LE)
 *   [u128 price, u128 amount] x numBids (32 bytes each)
 *   u32 numAsks (4 bytes LE)
 *   [u128 price, u128 amount] x numAsks (32 bytes each)
 *
 * Price encoding:
 *   - Bid prices are stored directly (raw value)
 *   - Ask prices are stored INVERTED as (MAX_U128 - price) for trie FIFO ordering
 *   - Both are scaled by 1e8 (divide to get decimal values)
 *   - Empty/padding slots have price=0 or amount=0 and are skipped
 */
export function parseOrderbookResponse(data: string | number[]): OrderbookData | null {
  const bytes = typeof data === 'string'
    ? Array.from(Buffer.from(data.replace(/^0x/, ''), 'hex'))
    : data;

  if (bytes.length < 8) return null;

  let offset = 0;
  const numBids = readU32LE(bytes, offset);
  offset += 4;

  if (numBids > 100 || offset + numBids * 32 > bytes.length) return null;

  const bids: OrderLevel[] = [];
  let bidCumTotal = 0;
  for (let i = 0; i < numBids; i++) {
    const priceRaw = Number(readU128LE(bytes, offset)) / 1e8;
    const amountRaw = Number(readU128LE(bytes, offset + 16)) / 1e8;
    offset += 32;
    if (priceRaw <= 0 || amountRaw <= 0) continue;
    bidCumTotal += priceRaw * amountRaw;
    bids.push({
      price: priceRaw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amountRaw.toFixed(4),
      total: bidCumTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
  }

  if (offset + 4 > bytes.length) return null;
  const numAsks = readU32LE(bytes, offset);
  offset += 4;

  if (numAsks > 100 || offset + numAsks * 32 > bytes.length) return null;

  const asks: OrderLevel[] = [];
  let askCumTotal = 0;
  for (let i = 0; i < numAsks; i++) {
    const storedPrice = readU128LE(bytes, offset);
    const priceRaw = Number(MAX_U128 - storedPrice) / 1e8;
    const amountRaw = Number(readU128LE(bytes, offset + 16)) / 1e8;
    offset += 32;
    if (priceRaw <= 0 || amountRaw <= 0) continue;
    askCumTotal += priceRaw * amountRaw;
    asks.push({
      price: priceRaw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amountRaw.toFixed(4),
      total: askCumTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
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

          const resp = await fetch(getRpcUrl(network), {
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
          console.warn('[useOrderbook] Carbine controller query failed, returning empty orderbook:', err);
        }
      }

      // Return empty orderbook when controller is not deployed or query fails
      return getEmptyOrderbook();
    },
    enabled: !!baseToken && !!quoteToken && !!network,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}
