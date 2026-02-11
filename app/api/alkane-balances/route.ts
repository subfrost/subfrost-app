/**
 * Alkane Balance API — Fast server-side parallel protorunesbyoutpoint with Redis cache
 *
 * GET /api/alkane-balances?address=<address>&network=<network>
 *
 * Flow:
 * 1. esplora_address::utxo(address) → get all UTXOs
 * 2. For each outpoint, check Redis: `alkane-bal:{txid}:{vout}`
 *    - Cache HIT → use cached balance sheet (no RPC call)
 *    - Cache MISS → alkanes_protorunesbyoutpoint(txid, vout) → cache permanently
 * 3. Aggregate all balance sheets → return alkane token map
 * 4. If any previously-known alkanes went to 0 AND there are pending mempool txs,
 *    include the last-known balance with `pending: true` (tokens are in transit).
 *
 * Why this is fast:
 * - Parallel outpoint lookups: many small protorunesbyoutpoint calls vs one protorunesbyaddress
 * - Immutable cache: outpoint balance sheets never change (UTXO content is fixed)
 * - Server-side: RPC calls happen server→server, no CORS or browser overhead
 *
 * JOURNAL ENTRY (2026-02-10): Created to replace slow dataApiGetAlkanesByAddress
 * which internally calls protorunesbyaddress (single large metashrew_view call).
 * JOURNAL ENTRY (2026-02-11): Added in-transit balance preservation. When an alkane
 * send is in the mempool, the source UTXO is spent but the change UTXO isn't indexed
 * yet → balance shows 0. Now caches last-known balances per address and returns them
 * with `pending: true` when mempool activity explains the missing tokens.
 */

import { NextResponse } from 'next/server';
import { cache } from '@/lib/db/redis';

const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
};

interface OutpointBalance {
  block: number;
  tx: number;
  amount: string;
}

interface AlkaneBalance {
  alkaneId: string;
  balance: string;
  pending?: boolean;
}

const BATCH_SIZE = 30;

async function rpcCall(endpoint: string, method: string, params: any[]): Promise<any> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} failed: ${response.status}`);
  }
  return response.json();
}

async function getOutpointBalances(
  endpoint: string,
  txid: string,
  vout: number,
): Promise<OutpointBalance[]> {
  const cacheKey = `alkane-bal:${txid}:${vout}`;

  // Check Redis cache first
  const cached = await cache.get<OutpointBalance[]>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Cache miss — fetch from RPC
  const data = await rpcCall(endpoint, 'alkanes_protorunesbyoutpoint', [txid, vout]);
  const balances = data?.result?.balance_sheet?.cached?.balances || [];

  const parsed: OutpointBalance[] = balances.map((b: any) => ({
    block: Number(b.block),
    tx: Number(b.tx),
    amount: String(b.amount || '0'),
  }));

  // Cache permanently (no TTL) — outpoint balances are immutable
  await cache.set(cacheKey, parsed);

  return parsed;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

  if (!address) {
    return NextResponse.json({ error: 'address parameter is required' }, { status: 400 });
  }

  const endpoint = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.mainnet;
  const addrCacheKey = `alkane-addr:${network}:${address}`;

  try {
    // Read last-known balances BEFORE computing current (so we can detect missing tokens)
    let lastKnownBalances: AlkaneBalance[] | null = null;
    try {
      lastKnownBalances = await cache.get<AlkaneBalance[]>(addrCacheKey);
    } catch { /* cache read failure is non-fatal */ }

    // 1. Get all UTXOs for the address via esplora
    const utxoData = await rpcCall(endpoint, 'esplora_address::utxo', [address]);
    const utxos: { txid: string; vout: number; value: number }[] = utxoData?.result || [];

    if (utxos.length === 0) {
      // No UTXOs at all — check if tokens are in transit
      if (lastKnownBalances && lastKnownBalances.length > 0) {
        const fallback = await getTransitFallback(endpoint, address, [], lastKnownBalances);
        if (fallback) return NextResponse.json(fallback);
      }
      return NextResponse.json({ balances: [] });
    }

    // 2. Fetch outpoint balances in parallel batches
    const allOutpointBalances: OutpointBalance[][] = [];

    for (let i = 0; i < utxos.length; i += BATCH_SIZE) {
      const batch = utxos.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((utxo) => getOutpointBalances(endpoint, utxo.txid, utxo.vout)),
      );
      allOutpointBalances.push(...batchResults);
    }

    // 3. Aggregate balance sheets into a single token map
    const tokenMap = new Map<string, string>();

    for (const balances of allOutpointBalances) {
      for (const bal of balances) {
        const alkaneId = `${bal.block}:${bal.tx}`;
        const existing = tokenMap.get(alkaneId) || '0';
        try {
          tokenMap.set(alkaneId, (BigInt(existing) + BigInt(bal.amount)).toString());
        } catch {
          tokenMap.set(alkaneId, String(Number(existing) + Number(bal.amount)));
        }
      }
    }

    // 4. Build result
    const currentBalances: AlkaneBalance[] = Array.from(tokenMap.entries()).map(([alkaneId, balance]) => ({
      alkaneId,
      balance,
    }));

    // 5. Update last-known cache (only if we have non-empty results)
    if (currentBalances.length > 0) {
      try {
        await cache.set(addrCacheKey, currentBalances, 7200); // 2hr TTL
      } catch { /* cache write failure is non-fatal */ }
    }

    // 6. Check if any previously-known alkanes went to 0 (could be in transit)
    if (lastKnownBalances && lastKnownBalances.length > 0) {
      const fallback = await getTransitFallback(endpoint, address, currentBalances, lastKnownBalances);
      if (fallback) return NextResponse.json(fallback);
    }

    return NextResponse.json({ balances: currentBalances });
  } catch (error) {
    console.error('[alkane-balances] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch alkane balances' },
      { status: 500 },
    );
  }
}

/**
 * When alkanes that were previously known go to 0, check if there are pending
 * mempool transactions for the address. If so, the tokens are likely in transit
 * (source UTXO spent, change UTXO not yet indexed). Return the last-known
 * balance for those tokens with `pending: true`.
 */
async function getTransitFallback(
  endpoint: string,
  address: string,
  currentBalances: AlkaneBalance[],
  lastKnownBalances: AlkaneBalance[],
): Promise<{ balances: AlkaneBalance[]; hasPendingTransactions: boolean } | null> {
  try {
    const currentIds = new Set(currentBalances.map(b => b.alkaneId));
    const missingAlkanes = lastKnownBalances.filter(cb => !currentIds.has(cb.alkaneId));

    if (missingAlkanes.length === 0) return null;

    // Only use fallback if there are pending mempool txs (confirming in-transit state)
    const mempoolData = await rpcCall(endpoint, 'esplora_address::txs:mempool', [address]);
    const pendingTxs = mempoolData?.result || [];
    if (pendingTxs.length === 0) return null;

    console.log(
      `[alkane-balances] ${missingAlkanes.length} alkane(s) in transit for ${address} ` +
      `(${pendingTxs.length} pending tx(s)), using last-known balances`,
    );

    return {
      balances: [
        ...currentBalances,
        ...missingAlkanes.map(b => ({ alkaneId: b.alkaneId, balance: b.balance, pending: true })),
      ],
      hasPendingTransactions: true,
    };
  } catch {
    return null;
  }
}
