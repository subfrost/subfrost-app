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

/**
 * Parse orderbook response from carbine controller opcode 24 (GetOrderbookDepth).
 *
 * Binary format (from subfrost-alkanes/alkanes/carbine-controller/src/lib.rs:730-774):
 *   u32 numBids (4 bytes LE)
 *   [u128 price, u128 amount] x numBids (32 bytes each)
 *   u32 numAsks (4 bytes LE)
 *   [u128 price, u128 amount] x numAsks (32 bytes each)
 *
 * Price encoding:
 *   - Both bid and ask prices in the response are REAL prices (raw u128, no scaling)
 *   - The contract already un-inverts ask prices before writing the response
 *     (line 760: real_price = u128::MAX - token_id)
 *   - Prices are in the token's native denomination (e.g., sats)
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
    const price = Number(readU128LE(bytes, offset));
    const amount = Number(readU128LE(bytes, offset + 16));
    offset += 32;
    if (price <= 0 || amount <= 0) continue;
    bidCumTotal += price * amount;
    bids.push({
      price: price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amount.toFixed(4),
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
    // Prices in response are already un-inverted by the contract (lib.rs:760)
    const price = Number(readU128LE(bytes, offset));
    const amount = Number(readU128LE(bytes, offset + 16));
    offset += 32;
    if (price <= 0 || amount <= 0) continue;
    askCumTotal += price * amount;
    asks.push({
      price: price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      amount: amount.toFixed(4),
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
                inputs: ['24', baseBlock, baseTx, quoteBlock, quoteTx, '10'],
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

          if (exec?.error) {
            console.warn('[useOrderbook] Carbine simulate error:', exec.error);
          } else if (exec?.data) {
            const hex = exec.data.replace(/^0x/, '');
            const byteLen = hex.length / 2;
            const parsed = parseOrderbookResponse(exec.data);
            if (parsed) {
              console.log('[useOrderbook] Parsed orderbook:', parsed.bids.length, 'bids,', parsed.asks.length, 'asks, spread:', parsed.spread);
              return parsed;
            } else {
              console.warn('[useOrderbook] parseOrderbookResponse returned null for', byteLen, 'bytes. First 64 hex:', hex.slice(0, 64));
            }
          } else {
            console.warn('[useOrderbook] No data in Carbine response');
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
