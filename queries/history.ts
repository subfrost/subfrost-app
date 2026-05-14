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
  alkaneSummaries?: AlkaneTraceSummary[];
}

export interface AlkaneTraceSummary {
  contractId: string;
  contractLabel: string;
  opcode?: string;
  methodName: string;
  callType?: string;
  status: 'success' | 'failure' | 'pending';
  statusText: string;
  createdId?: string;
  outpoint?: string;
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

function parseNumericIdPart(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value);
  if (raw.startsWith('0x')) {
    try {
      return BigInt(raw).toString();
    } catch {
      return null;
    }
  }
  return raw || null;
}

function formatShortId(id: any): string | null {
  const block = parseNumericIdPart(id?.block);
  const tx = parseNumericIdPart(id?.tx);
  if (!block || !tx) return null;
  return `${block}:${tx}`;
}

function traceOpcode(inputs: unknown): string | undefined {
  if (!Array.isArray(inputs) || inputs.length === 0) return undefined;
  const raw = String(inputs[0]);
  if (!raw) return undefined;
  if (raw.startsWith('0x')) {
    try {
      return BigInt(raw).toString();
    } catch {
      return undefined;
    }
  }
  return raw;
}

function methodNameForOpcode(opcode?: string): string {
  switch (opcode) {
    case '0':
      return 'initialize';
    case '1':
      return 'add liquidity';
    case '2':
      return 'remove liquidity';
    case '3':
      return 'swap';
    case '11':
      return 'add liquidity';
    case '12':
      return 'remove liquidity';
    case '13':
      return 'swap exact in';
    case '14':
      return 'swap exact out';
    case '77':
      return 'wrap';
    case '78':
      return 'unwrap';
    case '99':
      return 'get name';
    case '999':
      return 'pool details';
    default:
      return 'contract call';
  }
}

function summarizeAlkaneTrace(trace: any, confirmed: boolean): AlkaneTraceSummary | null {
  const events = trace?.trace?.events || trace?.events || [];
  if (!Array.isArray(events) || events.length === 0) return null;

  const invoke = events.find((event: any) => event?.event === 'invoke');
  const contractId = formatShortId(invoke?.data?.context?.myself);
  if (!contractId) return null;

  const opcode = traceOpcode(invoke?.data?.context?.inputs);
  const created = events.find((event: any) => event?.event === 'create');
  const createdId = formatShortId(created?.data);
  const failed = events.some((event: any) =>
    event?.event === 'return' && String(event?.data?.status || '').toLowerCase() === 'failure',
  );

  const status = !confirmed ? 'pending' : failed ? 'failure' : 'success';
  const statusText =
    status === 'pending'
      ? 'Waiting for block confirmation'
      : status === 'failure'
        ? 'Call reverted'
        : 'Call successful';

  return {
    contractId,
    contractLabel: contractId,
    opcode,
    methodName: methodNameForOpcode(opcode),
    callType: invoke?.data?.type || undefined,
    status,
    statusText,
    createdId: createdId || undefined,
    outpoint: trace?.outpoint,
  };
}

function summarizeAlkaneTraces(traces: any[] | undefined, confirmed: boolean): AlkaneTraceSummary[] {
  if (!Array.isArray(traces)) return [];
  return traces
    .map((trace) => summarizeAlkaneTrace(trace, confirmed))
    .filter((summary): summary is AlkaneTraceSummary => summary !== null);
}

/** Parse a raw tx object (espo or esplora format) into EnrichedTransaction. */
function parseTx(raw: any): EnrichedTransaction | null {
  const tx = mapToObject(raw);
  if (!tx?.txid) return null;

  const vin = tx.vin || tx.inputs || [];
  const vout = tx.vout || tx.outputs || [];
  const alkanesTraces = tx.alkanesTraces || tx.alkanes_traces || [];
  const confirmed = tx.status?.confirmed ?? tx.confirmed ?? false;

  return {
    txid: tx.txid,
    blockHeight: tx.status?.block_height ?? tx.block_height ?? tx.blockHeight,
    blockTime: tx.status?.block_time ?? tx.block_time ?? tx.blockTime,
    confirmed,
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
      tx.hasProtostones ||
      (Array.isArray(alkanesTraces) && alkanesTraces.length > 0) ||
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
    alkanesTraces,
    alkaneSummaries: summarizeAlkaneTraces(alkanesTraces, confirmed),
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
      // Primary: espo paginated endpoint (confirmed txs only)
      try {
        const raw = await provider.espoGetAddressTransactions(addr, page, limit, null);
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : mapToObject(raw);
        if (parsed?.error) throw new Error(parsed.error.message || 'espo returned error');
        const txList =
          parsed?.transactions ||
          parsed?.data?.transactions ||
          parsed?.data ||
          parsed?.result ||
          (Array.isArray(parsed) ? parsed : []);
        if (Array.isArray(txList) && txList.length > 0) {
          // Espo returns confirmed only. On page 1, also fetch mempool txs.
          if (page === 1) {
            try {
              const memRaw = await provider.esploraGetAddressTxsMempool(addr);
              const memTxs = typeof memRaw === 'string' ? JSON.parse(memRaw) : mapToObject(memRaw);
              if (Array.isArray(memTxs) && memTxs.length > 0) {
                return [...memTxs, ...txList];
              }
            } catch { /* mempool fetch optional */ }
          }
          return txList;
        }
        if (page > 1) return [];
      } catch (e) {
        console.warn(`[txHistory] espo paginated failed for ${addr.slice(0,8)}:`, e);
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
  transactions.sort(sortByRecency);

  // If any address returned a full page, there's likely more
  const hasMore = results.some((r) => r.length >= limit);

  return { transactions, hasMore };
}
