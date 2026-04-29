/**
 * History query options.
 *
 * - paginatedTxHistory: paginated via espoGetAddressTransactions (page + limit)
 * - ammTxHistory: infinite query for AMM activity feed (unchanged)
 *
 * JOURNAL (2026-04-27): Switched from getAddressTxsWithTraces (loads ALL txs
 * at once, no pagination) to espoGetAddressTransactions (page/limit).
 * Old method fetched entire history for 2 addresses on every new block —
 * hundreds of txs parsed through WASM mapToObject on each render.
 */

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// Re-exported from hooks/useTransactionHistory.ts — canonical type defined there.
// Duplicated here to avoid circular imports (hook imports fetchTxPage from here).
interface EnrichedTransaction {
  txid: string;
  blockHeight?: number;
  blockTime?: number;
  confirmed: boolean;
  fee?: number;
  weight?: number;
  size?: number;
  inputs: Array<{ txid: string; vout: number; address?: string; amount?: number; isCoinbase?: boolean }>;
  outputs: Array<{ address?: string; amount: number; scriptPubKey: string; scriptPubKeyType?: string }>;
  hasOpReturn: boolean;
  hasProtostones: boolean;
  isRbf: boolean;
  isCoinbase: boolean;
  runestone?: any;
  alkanesTraces?: any[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Newest-first comparator. Unconfirmed (mempool) txs come first, then
 * confirmed txs sorted by blockHeight desc with blockTime as tiebreaker.
 * blockHeight is the authoritative key because the espo paginated endpoint
 * sometimes returns confirmed txs with an undefined blockTime.
 */
export function sortByRecency(
  a: { confirmed?: boolean; blockHeight?: number; blockTime?: number },
  b: { confirmed?: boolean; blockHeight?: number; blockTime?: number },
): number {
  const aPending = !a.confirmed;
  const bPending = !b.confirmed;
  if (aPending !== bPending) return aPending ? -1 : 1;
  const heightDiff = (b.blockHeight || 0) - (a.blockHeight || 0);
  if (heightDiff !== 0) return heightDiff;
  return (b.blockTime || 0) - (a.blockTime || 0);
}

function mapToObject(item: any): any {
  if (item instanceof Map) {
    const obj: any = {};
    item.forEach((value: any, key: any) => { obj[key] = mapToObject(value); });
    return obj;
  }
  if (Array.isArray(item)) return item.map(mapToObject);
  return item;
}

/** Parse a raw tx object (espo or esplora format) into EnrichedTransaction. */
function parseTx(raw: any): EnrichedTransaction | null {
  const tx = mapToObject(raw);
  if (!tx?.txid) return null;

  const vin = tx.vin || tx.inputs || [];
  const vout = tx.vout || tx.outputs || [];

  return {
    txid: tx.txid,
    blockHeight: tx.status?.block_height ?? tx.block_height ?? tx.blockHeight,
    blockTime: tx.status?.block_time ?? tx.block_time ?? tx.blockTime,
    confirmed: tx.status?.confirmed ?? tx.confirmed ?? false,
    fee: tx.fee,
    weight: tx.weight,
    size: tx.size,
    inputs: vin.map((inp: any) => ({
      txid: inp.txid,
      vout: inp.vout,
      address: inp.prevout?.scriptpubkey_address || inp.address || '',
      amount: inp.prevout?.value || inp.value || 0,
      isCoinbase: inp.is_coinbase || false,
    })),
    outputs: vout.map((out: any) => ({
      address: out.scriptpubkey_address || out.address || '',
      amount: out.value || 0,
      scriptPubKey: out.scriptpubkey || '',
      scriptPubKeyType: out.scriptpubkey_type || '',
    })),
    hasOpReturn: vout.some((v: any) =>
      (v.scriptpubkey_type || v.type) === 'op_return'),
    hasProtostones: !!(
      tx.runestone?.protostones?.length > 0 ||
      tx.has_protostones ||
      // Detect OP_RETURN with protorune magic if traces aren't available
      vout.some((v: any) => {
        const spk: string = v.scriptpubkey || '';
        // Protorune OP_RETURN starts with 6a (OP_RETURN) followed by runestone prefix
        return (v.scriptpubkey_type || v.type) === 'op_return' && spk.length > 10;
      })
    ),
    isRbf: vin.some((v: any) => v.sequence != null && v.sequence < 0xfffffffe),
    isCoinbase: vin.some((v: any) => v.is_coinbase),
    runestone: tx.runestone,
    alkanesTraces: tx.alkanes_traces || [],
  };
}

// ---------------------------------------------------------------------------
// Paginated fetch — one page for multiple addresses, merged
// ---------------------------------------------------------------------------

export const TX_PAGE_SIZE = 25;

export interface TxPage {
  transactions: EnrichedTransaction[];
  hasMore: boolean;
}

/**
 * Fetch a single page of transactions for given addresses.
 * Primary: espoGetAddressTransactions (paginated).
 * Fallback: getAddressTxs with manual slicing (if espo unavailable).
 */
export async function fetchTxPage(
  provider: WebProvider,
  addresses: string[],
  page: number,
  limit: number = TX_PAGE_SIZE,
): Promise<TxPage> {
  const results = await Promise.all(
    addresses.filter(Boolean).map(async (addr) => {
      // Primary: espo paginated endpoint
      try {
        const raw = await provider.espoGetAddressTransactions(addr, page, limit, null);
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : mapToObject(raw);
        const txList =
          parsed?.transactions ||
          parsed?.data?.transactions ||
          parsed?.data ||
          parsed?.result ||
          (Array.isArray(parsed) ? parsed : []);
        return Array.isArray(txList) ? txList : [];
      } catch (e) {
        console.warn(`[txHistory] espo paginated failed for ${addr}:`, e);
      }

      // Fallback: full fetch + manual slice
      try {
        const raw = await provider.getAddressTxs(addr);
        const all = Array.isArray(raw) ? raw : [];
        const start = (page - 1) * limit;
        return all.slice(start, start + limit);
      } catch {
        return [];
      }
    }),
  );

  // Merge, dedup, parse, sort
  const seen = new Set<string>();
  const transactions: EnrichedTransaction[] = [];
  for (const txList of results) {
    for (const rawTx of txList) {
      const tx = parseTx(rawTx);
      if (tx && !seen.has(tx.txid)) {
        seen.add(tx.txid);
        transactions.push(tx);
      }
    }
  }
  // Sort newest-first. The espo paginated endpoint sometimes omits blockTime
  // for very recent txs (still has blockHeight), so blockHeight is the
  // authoritative ordering key — fall back to blockTime for ties or pre-mempool.
  transactions.sort(sortByRecency);

  // If any address returned a full page, there's likely more
  const hasMore = results.some((r) => r.length >= limit);

  return { transactions, hasMore };
}
