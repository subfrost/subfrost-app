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
 *
 * Why this is fast:
 * - Parallel outpoint lookups: many small protorunesbyoutpoint calls vs one protorunesbyaddress
 * - Immutable cache: outpoint balance sheets never change (UTXO content is fixed)
 * - Server-side: RPC calls happen server→server, no CORS or browser overhead
 *
 * JOURNAL ENTRY (2026-02-10): Created to replace slow dataApiGetAlkanesByAddress
 * which internally calls protorunesbyaddress (single large metashrew_view call).
 */

import { NextResponse } from 'next/server';
import { cache } from '@/lib/db/redis';
import { batchRpcServer } from '@/lib/rpc-batch';

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

function parseBalances(result: any): OutpointBalance[] {
  const balances = result?.balance_sheet?.cached?.balances || [];
  return balances.map((b: any) => ({
    block: Number(b.block),
    tx: Number(b.tx),
    amount: String(b.amount || '0'),
  }));
}

/**
 * Fetch outpoint balances for a batch of UTXOs, using Redis cache and
 * a single JSON-RPC batch call for all cache misses.
 */
async function getOutpointBalancesBatch(
  endpoint: string,
  utxos: { txid: string; vout: number }[],
): Promise<OutpointBalance[][]> {
  // 1. Check Redis cache for all outpoints in parallel
  const cacheResults = await Promise.all(
    utxos.map((utxo) => cache.get<OutpointBalance[]>(`alkane-bal:${utxo.txid}:${utxo.vout}`)),
  );

  // 2. Collect cache misses
  const missIndices: number[] = [];
  for (let i = 0; i < cacheResults.length; i++) {
    if (cacheResults[i] === null) missIndices.push(i);
  }

  // 3. Batch-fetch all cache misses in a single JSON-RPC call
  if (missIndices.length > 0) {
    const calls = missIndices.map((idx) => ({
      method: 'alkanes_protorunesbyoutpoint',
      params: [utxos[idx].txid, utxos[idx].vout],
    }));
    const rpcResults = await batchRpcServer(endpoint, calls);

    // 4. Parse results and cache permanently
    await Promise.all(
      missIndices.map(async (idx, j) => {
        const parsed = parseBalances(rpcResults[j]);
        cacheResults[idx] = parsed;
        await cache.set(`alkane-bal:${utxos[idx].txid}:${utxos[idx].vout}`, parsed);
      }),
    );
  }

  return cacheResults.map((r) => r || []);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

  if (!address) {
    return NextResponse.json({ error: 'address parameter is required' }, { status: 400 });
  }

  const endpoint = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.mainnet;

  try {
    // 1. Get all UTXOs for the address via esplora
    const utxoData = await rpcCall(endpoint, 'esplora_address::utxo', [address]);
    const utxos: { txid: string; vout: number; value: number }[] = utxoData?.result || [];

    if (utxos.length === 0) {
      return NextResponse.json({ balances: [] });
    }

    // 2. Fetch outpoint balances in batched chunks (single RPC call per chunk for cache misses)
    const allOutpointBalances: OutpointBalance[][] = [];

    for (let i = 0; i < utxos.length; i += BATCH_SIZE) {
      const chunk = utxos.slice(i, i + BATCH_SIZE);
      const chunkResults = await getOutpointBalancesBatch(endpoint, chunk);
      allOutpointBalances.push(...chunkResults);
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

    // 4. Return aggregated balances
    const balances = Array.from(tokenMap.entries()).map(([alkaneId, balance]) => ({
      alkaneId,
      balance,
    }));

    return NextResponse.json({ balances });
  } catch (error) {
    console.error('[alkane-balances] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch alkane balances' },
      { status: 500 },
    );
  }
}
