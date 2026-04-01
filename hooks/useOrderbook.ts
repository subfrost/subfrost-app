/**
 * useOrderbook.ts
 *
 * Fetches live orderbook depth from the Carbine CLOB controller (opcode 24:
 * GetOrderbookDepth) and returns parsed bid/ask levels for display.
 *
 * =============================================================================
 * JOURNAL — Carbine CLOB orderbook debugging (2026-04-01)
 * =============================================================================
 *
 * ## Contract IDs (devnet)
 *   Controller Proxy:  [4:70000]  ← ALL calls go here, never to impl
 *   Controller Impl:   [4:80000]  ← actual logic, never called directly
 *   Template Impl:     [4:80001]  ← per-order-pair template logic
 *   Template Beacon:   [4:90001]  ← beacon for template upgrades
 *   Default instance:  [4:70001]  ← beacon-proxy instance (default pair)
 *   Universal Router:  [4:70002]  ← proxy, [4:80002] impl
 *
 * ## GetOrderbookDepth (opcode 24) — input format
 *   inputs: ['24', base_block, base_tx, quote_block, quote_tx, depth]
 *   Example for frBTC(32:0)/DIESEL(2:0): ['24','32','0','2','0','10']
 *
 * ## CRITICAL: Pair ordering
 *   The controller keys orders by the pair (base, quote) as provided to
 *   PlaceLimitOrder. If you query with the WRONG pair order you get 8 bytes
 *   of zeros (empty). The hook tries both orderings and uses the one with data.
 *
 *   Verified on devnet (2026-04-01): orders placed via LimitOrderPanel with
 *   DIESEL as base and frBTC as quote are stored under (frBTC=32:0, DIESEL=2:0)
 *   — i.e., the *second* token (quote) becomes the first key component.
 *   If the first query returns ≤8 zero bytes, the hook retries with reversed pair.
 *
 * ## Response binary format (source: carbine-controller/src/lib.rs:730-774)
 *   [0..3]   numBids (u32 LE)  — NOT u128
 *   [4..N]   bid[i]: [u128 price LE (16 bytes), u128 amount LE (16 bytes)]
 *   [N..N+3] numAsks (u32 LE)
 *   [N+4..M] ask[i]: [u128 price LE (16 bytes), u128 amount LE (16 bytes)]
 *
 * ## Ask price inversion (VERIFIED 2026-04-01 — do not remove un-inversion)
 *   Ask prices in the response are INVERTED trie keys: stored = u128::MAX - real.
 *   The contract source (lib.rs:760) suggests it un-inverts before returning, but
 *   live devnet data proves it does NOT — stored value came back as
 *   340282366920938463463374607431768211355 and real price was 100.
 *   The parser MUST un-invert: real = U128_MAX - stored.
 *   Formula check: stored > U128_MAX/2 → it's an inverted ask.
 *
 * ## Price/amount scaling
 *   All raw values are in 1e8 (satoshi) units. Divide by 1e8 for display.
 *   PlaceLimitOrder sends: price_scaled = human_price * 1e8,
 *                          amount_scaled = human_amount * 1e8
 *
 * ## Deduplication
 *   A single order appears in BOTH bids and asks within the trie traversal when
 *   depth crosses the bid/ask boundary. The hook filters out ask entries that
 *   have identical price+amount to a bid entry — those are the same order echoed.
 *
 * ## Verification script (run in browser console on devnet)
 *   // Check open order count:
 *   (async () => {
 *     const r = await fetch('http://localhost:18888', { method: 'POST',
 *       headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
 *       jsonrpc: '2.0', method: 'alkanes_simulate', params: [{ target:
 *       { block: '4', tx: '70000' }, inputs: ['25'], block_tag: 'latest' }],
 *       id: 1 }) });
 *     const j = await r.json();
 *     console.log('Open orders:', j?.result?.execution?.data, '| err:', j?.result?.execution?.error);
 *   })();
 *
 *   // Query orderbook depth (frBTC base, DIESEL quote — the working pair order):
 *   (async () => {
 *     const r = await fetch('http://localhost:18888', { method: 'POST',
 *       headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
 *       jsonrpc: '2.0', method: 'alkanes_simulate', params: [{ target:
 *       { block: '4', tx: '70000' }, inputs: ['24','32','0','2','0','10'],
 *       block_tag: 'latest' }], id: 1 }) });
 *     const j = await r.json();
 *     console.log('Hex:', j?.result?.execution?.data, '| err:', j?.result?.execution?.error);
 *   })();
 *
 * ## Console noise
 *   The browser console fills with "[__get_len] MISS #N" spam from the qubitcoin
 *   WASM indexer. Filter: use "-__get_len" in Chrome DevTools console filter.
 *   This is why Carbine was moved to boot.ts Phase 3a — its deploy logs appear
 *   before the __get_len spam overwhelms the console.
 * =============================================================================
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';

/** Format a price value for display — show enough decimals for small values */
function formatPrice(price: number): string {
  if (price === 0) return '0.00';
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // For sub-1 prices, show up to 8 significant decimals
  return price.toFixed(8).replace(/0+$/, '').replace(/\.$/, '.00');
}

/** Format an amount value for display */
function formatAmount(amount: number): string {
  if (amount >= 1000) return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '.0');
}

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

// u128 max constant for un-inverting ask prices
const U128_MAX = (BigInt(1) << BigInt(128)) - BigInt(1);

/**
 * Parse orderbook response from carbine controller opcode 24 (GetOrderbookDepth).
 *
 * Binary format (from subfrost-alkanes/alkanes/carbine-controller/src/lib.rs:730-774):
 *   u32 numBids (4 bytes LE)
 *   [u128 price, u128 amount] x numBids (32 bytes each)
 *   u32 numAsks (4 bytes LE)
 *   [u128 price, u128 amount] x numAsks (32 bytes each)
 *
 * Price encoding (VERIFIED against live devnet data 2026-04-01):
 *   - Bid prices are REAL prices (raw u128, no transformation needed)
 *   - Ask prices are INVERTED trie keys: stored as u128::MAX - real_price
 *     Despite source code suggesting un-inversion at line 760, the actual
 *     response returns raw trie keys. Parser MUST un-invert: real = MAX - stored.
 *   - Prices are in the token's native denomination (raw u128, no 1e8 scaling)
 *   - Empty/padding slots have price=0 or amount=0 and are skipped
 *
 * Debug tip — verify orderbook data from browser console on devnet:
 *   const r = await fetch('http://localhost:18888', { method: 'POST',
 *     headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
 *     jsonrpc: '2.0', method: 'alkanes_simulate', params: [{ target:
 *     { block: '4', tx: '70000' }, inputs: ['24','2','0','32','0','10'],
 *     block_tag: 'latest' }], id: 1 }) });
 *   console.log((await r.json())?.result?.execution?.data);
 */
export function parseOrderbookResponse(data: string | number[]): OrderbookData | null {
  const bytes = typeof data === 'string'
    ? Array.from(Buffer.from(data.replace(/^0x/, ''), 'hex'))
    : data;

  if (bytes.length < 8) return null;

  // Both prices and amounts from the Carbine controller are raw u128 values
  // in 8-decimal (1e8) precision — same as Bitcoin satoshi convention.
  // Example: user enters price=0.000001, UI scales by 1e8 → 100 raw.
  //          user enters amount=1.0, UI scales by 1e8 → 100000000 raw.
  // We divide by 1e8 here to get human-readable display values.
  const DECIMALS = 1e8;

  let offset = 0;
  const numBids = readU32LE(bytes, offset);
  offset += 4;

  if (numBids > 100 || offset + numBids * 32 > bytes.length) return null;

  const bids: OrderLevel[] = [];
  let bidCumTotal = 0;
  for (let i = 0; i < numBids; i++) {
    const rawPrice = Number(readU128LE(bytes, offset));
    const rawAmount = Number(readU128LE(bytes, offset + 16));
    offset += 32;
    // Skip only if amount is 0 (empty padding slot). Price=0 is valid
    // (the contract may encode prices differently than expected).
    if (rawAmount <= 0) continue;
    const price = rawPrice / DECIMALS;
    const amount = rawAmount / DECIMALS;
    bidCumTotal += amount;
    bids.push({
      price: formatPrice(price),
      amount: formatAmount(amount),
      total: formatAmount(bidCumTotal),
    });
  }

  if (offset + 4 > bytes.length) return null;
  const numAsks = readU32LE(bytes, offset);
  offset += 4;

  if (numAsks > 100 || offset + numAsks * 32 > bytes.length) return null;

  const asks: OrderLevel[] = [];
  let askCumTotal = 0;
  for (let i = 0; i < numAsks; i++) {
    // Ask prices in the response are INVERTED trie keys (u128::MAX - real_price).
    // We must un-invert to get the real price. Verified on devnet 2026-04-01:
    // stored=340282366920938463463374607431768211355, real=100 (correct).
    const rawPriceBig = readU128LE(bytes, offset);
    const realPriceBig = rawPriceBig > U128_MAX / BigInt(2) ? U128_MAX - rawPriceBig : rawPriceBig;
    const rawPrice = Number(realPriceBig);
    const rawAmount = Number(readU128LE(bytes, offset + 16));
    offset += 32;
    if (rawAmount <= 0) continue;
    const price = rawPrice / DECIMALS;
    const amount = rawAmount / DECIMALS;
    askCumTotal += amount;
    asks.push({
      price: formatPrice(price),
      amount: formatAmount(amount),
      total: formatAmount(askCumTotal),
    });
  }

  // Deduplicate: The Carbine trie stores orders across the full u128 range.
  // A single buy order at price X appears as BOTH a bid (price=X, below MAX/2)
  // and an ask (price=MAX-X, above MAX/2) in the depth traversal. When bid and
  // ask levels have identical price+amount, it's the same order echoed on both
  // sides — remove the duplicate. Verified on devnet: 1 buy order → depth
  // returned 1 bid + 1 ask with same price=100, amount=100000000.
  if (bids.length > 0 && asks.length > 0) {
    const dedupedAsks = asks.filter(ask => {
      return !bids.some(bid => bid.price === ask.price && bid.amount === ask.amount);
    });
    const dedupedBids = bids.filter(bid => {
      return !asks.some(ask => ask.price === bid.price && ask.amount === bid.amount && dedupedAsks.includes(ask));
    });
    // Only apply dedup if it actually removed duplicates (not independent orders)
    if (dedupedAsks.length < asks.length || dedupedBids.length < bids.length) {
      asks.length = 0;
      asks.push(...dedupedAsks);
      // Keep bids as-is since we removed the ask duplicates
    }
  }

  if (bids.length === 0 && asks.length === 0) return null;

  const bestBid = bids.length > 0 ? parseFloat(bids[0].price.replace(/,/g, '')) : 0;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price.replace(/,/g, '')) : 0;
  const midPrice = (bestBid + bestAsk) / 2 || bestBid || bestAsk;
  const spread = Math.abs(bestAsk - bestBid);

  return {
    bids,
    asks,
    spread: formatPrice(spread),
    spreadPercent: midPrice > 0 ? ((spread / midPrice) * 100).toFixed(3) : '0.000',
    midPrice: formatPrice(midPrice),
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

          // The Carbine controller keys orders by pair hash. The pair order
          // matters — (DIESEL,frBTC) and (frBTC,DIESEL) are different pairs.
          // LimitOrderPanel sends pairs as [base, quote], but the controller
          // may store them in either order. Try both and use whichever has data.
          // Verified on devnet 2026-04-01: orders placed as DIESEL/frBTC were
          // found under (frBTC,DIESEL) = (32:0, 2:0), not (2:0, 32:0).
          const pairOrders = [
            [baseBlock, baseTx, quoteBlock, quoteTx],   // base/quote as-is
            [quoteBlock, quoteTx, baseBlock, baseTx],    // reversed
          ];

          let exec: any = null;
          for (const [b1, t1, b2, t2] of pairOrders) {
            const resp = await fetch(getRpcUrl(network), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'alkanes_simulate',
                params: [{
                  target: { block: ctrlBlock, tx: ctrlTx },
                  inputs: ['24', b1, t1, b2, t2, '10'],
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
            const tryExec = data?.result?.execution;
            if (tryExec?.data) {
              const hex = tryExec.data.replace(/^0x/, '');
              // Check if this response has actual orders (not just 8 zero bytes)
              if (hex.length > 16 && hex !== '0000000000000000') {
                exec = tryExec;
                break;
              }
            }
            if (!exec) exec = tryExec; // keep last result for error reporting
          }

          if (exec?.error) {
            console.warn('[useOrderbook] Carbine simulate error:', exec.error);
          } else if (exec?.data) {
            const hex = exec.data.replace(/^0x/, '');
            const byteLen = hex.length / 2;
            console.log('[useOrderbook] RAW HEX (' + byteLen + ' bytes):', hex.slice(0, 128));
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
