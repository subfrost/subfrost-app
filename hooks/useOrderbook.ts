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
 * ## Ask price encoding — DO NOT un-invert in the parser (CONFIRMED 2026-04-01)
 *   Sell-side trie keys are stored as `u128::MAX - real_price` internally,
 *   but GetOrderbookDepth (lib.rs:760) un-inverts BEFORE writing to the response:
 *     `let real_price = u128::MAX - token_id`
 *   Ask prices in the response ARE already real prices. DO NOT un-invert again.
 *   Double-inversion produces values near u128::MAX — a distinctive wrong-answer signal.
 *
 * ## Price/amount scaling
 *   All raw values are in 1e8 (satoshi) units. Divide by 1e8 for display.
 *   PlaceLimitOrder sends: price_scaled = human_price * 1e8,
 *                          amount_scaled = human_amount * 1e8
 *
 * ## Trie layout — two halves, no overlap (VERIFIED from carbine-controller/src/lib.rs)
 *   BUY  orders: trie key = raw_price          (below MAX/2)
 *   SELL orders: trie key = MAX - raw_price     (above MAX/2)
 *   GetOrderbookDepth traversal:
 *     bids: trie.prev(MAX/2) → keys < MAX/2  (buy orders, descending)
 *     asks: trie.next(MAX/2) → keys > MAX/2  (sell orders, ascending by key = descending by real price)
 *   The two halves are COMPLETELY SEPARATE. A buy order NEVER appears in the ask list.
 *   Any deduplication logic is wrong and must not be added.
 *
 * ## Root cause of the sell order invisibility bug (FIXED 2026-04-01)
 *   carbine-traits/src/trie.rs used a single u128 as a branch mask (bits 0-127 only).
 *   In WASM release mode: 1u128 << 255 == 0 (silent overflow, no panic).
 *   Sell keys have byte[0] = 0xFF = 255. The branch mask bit was never set,
 *   so trie.next() could never find any sell-side key — they were invisible.
 *   Fix: Mask256 { lo: u128, hi: u128 } covers all 256 byte values.
 *   Storage path changed: /branches/{d}/{pk} → /branches/{d}/{pk}/lo + /hi
 *   ⚠ NOT backward compatible — requires fresh devnet ("Clear & Reload").
 *
 * ## U128_MAX in ask amounts — corrupted devnet state
 *   The contract does NOT pad empty slots with U128_MAX — it uses break.
 *   If ask amounts read as U128_MAX, the devnet state is corrupted (likely
 *   from OOM crash mid-write or stale pre-fix WASM). These entries are skipped.
 *   Fix: use "Clear & Reload" in DevnetControlPanel.
 *
 * ## Diagnostic: [QA] bestAsk / bestBid
 *   These opcode 22/23 queries run in parallel with depth.
 *   If bestAsk returns "0x00" → no asks in trie (wrong pair key OR no sell orders)
 *   If bestAsk returns "0x01 + price(16B) + amount(16B)" → ask exists in trie
 *   Cross-reference with depth results to diagnose pair key mismatches.
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
 * Price encoding (VERIFIED from carbine-controller/src/lib.rs 2026-04-01):
 *   - Bid prices are REAL prices (raw u128, no transformation needed)
 *   - Ask prices are ALREADY REAL — contract un-inverts at line 760 before writing.
 *     DO NOT un-invert again. Earlier code was double-un-inverting (now fixed).
 *   - Prices are in the token's native denomination (raw u128, no 1e8 scaling)
 *   - Zero amount slots are skipped; no U128_MAX padding — contract uses break
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
  // Max sane amount: 1e18 raw = 1e10 tokens. Larger values = corrupted devnet state.
  const MAX_SANE_AMOUNT_BID = BigInt('1000000000000000000'); // 1e18
  for (let i = 0; i < numBids; i++) {
    const rawPriceBigB = readU128LE(bytes, offset);
    const rawAmountBigB = readU128LE(bytes, offset + 16);
    offset += 32;
    if (rawAmountBigB === BigInt(0)) continue;
    if (rawAmountBigB > MAX_SANE_AMOUNT_BID) {
      console.warn(`[useOrderbook] bid[${i}] amount=${rawAmountBigB} exceeds sanity limit (corrupted devnet state?), price=${rawPriceBigB} — skipping`);
      continue;
    }
    const rawPrice = Number(rawPriceBigB);
    const rawAmount = Number(rawAmountBigB);
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
  // Max sane amount: 1e18 raw = 1e10 tokens (10 billion). Anything above this
  // is from corrupted/OOM-crashed devnet state and should be skipped with a warning.
  const MAX_SANE_AMOUNT = BigInt('1000000000000000000'); // 1e18
  for (let i = 0; i < numAsks; i++) {
    // Ask prices in the response are ALREADY real prices — the contract un-inverts
    // at lib.rs:760 with `let real_price = u128::MAX - token_id` before writing.
    // Do NOT un-invert here — that was a previous bug that double-inverted prices.
    const rawPriceBig = readU128LE(bytes, offset);
    const rawAmountBig = readU128LE(bytes, offset + 16);
    offset += 32;
    if (rawAmountBig === BigInt(0)) continue;
    if (rawAmountBig > MAX_SANE_AMOUNT) {
      console.warn(`[useOrderbook] ask[${i}] amount=${rawAmountBig} exceeds sanity limit (corrupted devnet state?), price=${rawPriceBig} — skipping`);
      continue;
    }
    const rawPrice = Number(rawPriceBig);
    const rawAmount = Number(rawAmountBig);
    const price = rawPrice / DECIMALS;
    const amount = rawAmount / DECIMALS;
    askCumTotal += amount;
    asks.push({
      price: formatPrice(price),
      amount: formatAmount(amount),
      total: formatAmount(askCumTotal),
    });
  }

  // NOTE: Deduplication removed (2026-04-01).
  // Buy orders (trie keys < MAX/2) and sell orders (trie keys > MAX/2) are stored
  // in separate halves of the trie. A buy order does NOT echo in the asks side.
  // The previous dedup was based on a wrong assumption about trie traversal.

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

          // Diagnostic: query best bid (opcode 22) and best ask (opcode 23)
          // for BOTH pair orderings. Response format:
          //   0x00 = no order in trie (empty)
          //   0x01 + price(16B LE) + amount(16B LE) = order found
          // Use this to determine if sell orders are being stored at all,
          // and which pair ordering matches the stored data.
          const diagPairs = [
            { label: `${baseBlock}:${baseTx}/${quoteBlock}:${quoteTx}`, inputs_suffix: [baseBlock, baseTx, quoteBlock, quoteTx] },
            { label: `${quoteBlock}:${quoteTx}/${baseBlock}:${baseTx}`, inputs_suffix: [quoteBlock, quoteTx, baseBlock, baseTx] },
          ];
          for (const dp of diagPairs) {
            const [bbR, baR] = await Promise.all([
              fetch(getRpcUrl(network), { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'alkanes_simulate',
                  params: [{ target: { block: ctrlBlock, tx: ctrlTx },
                    inputs: ['22', ...dp.inputs_suffix], block_tag: 'latest' }], id: 97 }),
              }).then(r => r.json()).then(j => j?.result?.execution),
              fetch(getRpcUrl(network), { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'alkanes_simulate',
                  params: [{ target: { block: ctrlBlock, tx: ctrlTx },
                    inputs: ['23', ...dp.inputs_suffix], block_tag: 'latest' }], id: 98 }),
              }).then(r => r.json()).then(j => j?.result?.execution),
            ]);
            // Decode: first byte 0x01 means data present, then 16B price + 16B amount
            const decodeBestLevel = (hex: string | undefined) => {
              if (!hex) return 'null';
              const h = hex.replace(/^0x/, '');
              if (h === '' || h === '00') return 'EMPTY (no order in trie)';
              if (h.startsWith('01') && h.length >= 66) {
                const bytes = Array.from(Buffer.from(h, 'hex'));
                const priceBig = readU128LE(bytes, 1);
                const amtBig = readU128LE(bytes, 17);
                return `price=${priceBig} (${Number(priceBig)/1e8} display), amount=${amtBig} (${Number(amtBig)/1e8} display)`;
              }
              return `raw=${h}`;
            };
            console.log(`[QA] pair ${dp.label} bestBid:`, decodeBestLevel(bbR?.data), '| err:', bbR?.error);
            console.log(`[QA] pair ${dp.label} bestAsk:`, decodeBestLevel(baR?.data), '| err:', baR?.error);
          }

          // Query both pair orderings in parallel, then pick the one with real orders
          const depthResps = await Promise.all(pairOrders.map(([b1, t1, b2, t2]) =>
            fetch(getRpcUrl(network), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'alkanes_simulate',
                params: [{
                  target: { block: ctrlBlock, tx: ctrlTx },
                  inputs: ['24', b1, t1, b2, t2, '10'],
                  block_tag: 'latest',
                }],
                id: 1,
              }),
            }).then(r => r.json()).then(d => ({ pair: `${b1}:${t1}/${b2}:${t2}`, exec: d?.result?.execution }))
          ));

          // Pick the pair response with non-zero numBids or numAsks.
          // Log all responses for diagnostics.
          let exec: any = null;
          for (const { pair, exec: tryExec } of depthResps) {
            if (!tryExec?.data) { console.log(`[QA] depth pair ${pair}: no data`); continue; }
            const hex = tryExec.data.replace(/^0x/, '');
            const bytes = Array.from(Buffer.from(hex, 'hex'));
            const numBids = bytes.length >= 4 ? readU32LE(bytes, 0) : 0;
            // numAsks is at offset 4 + numBids*32
            const askOffset = 4 + numBids * 32;
            const numAsks = bytes.length >= askOffset + 4 ? readU32LE(bytes, askOffset) : 0;
            console.log(`[QA] depth pair ${pair}: ${hex.length/2}B numBids=${numBids} numAsks=${numAsks} firstBytes=${hex.slice(0,32)} err:`, tryExec.error);
            if ((numBids > 0 || numAsks > 0) && !exec) {
              exec = tryExec; // use first pair with actual orders
            }
            if (!exec) exec = tryExec; // fallback to last if none has orders
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
              // parseOrderbookResponse returns null when all entries are filtered out.
              // Most common cause on devnet: corrupted trie state from OOM crash.
              // Symptom: numAsks>0 but all amounts are MAX or insane values.
              // Fix: use the "Clear & Reload" button in DevnetControlPanel.
              console.warn('[useOrderbook] parseOrderbookResponse returned null for', byteLen, 'bytes. First 64 hex:', hex.slice(0, 64));
              console.warn('[useOrderbook] ⚠ If you see numAsks>0 above but no asks display, devnet state is corrupted — use "Clear & Reload"');
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
