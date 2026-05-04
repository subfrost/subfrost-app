/**
 * Alkane Balance API — canonical UTXO+outpoint aggregation.
 *
 * GET /api/alkane-balances?address=<address>&network=<network>
 *
 * Returns alkane balances by:
 *   1. esplora_address::utxo (via the JSON-RPC proxy)
 *   2. Promise.all(alkanes_protorunesbyoutpoint) per dust UTXO (≤1000 sats)
 *   3. Aggregate per (block, tx)
 *
 * Why NOT `alkanes_protorunesbyaddress`: the indexer's address-keyed view
 * does not retract balances when an outpoint is spent at the BTC layer, so
 * summing across it shows phantom balances on previously-held outpoints.
 * Verified 2026-05-03: bc1p0eyy… reported 1800 DIESEL via address-view but
 * actually held only 58 DIESEL. The UTXO+outpoint fanout matches what the
 * contract sees at submit time and is the only correct source.
 */
import { NextResponse } from 'next/server';

const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  devnet: 'http://localhost:18888', // In-browser only
};

interface Utxo {
  txid: string;
  vout: number;
  value: number;
}

async function rpc<T = unknown>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message ?? JSON.stringify(json.error)}`);
  return json.result as T;
}

async function fetchAddressUtxos(rpcUrl: string, address: string): Promise<Utxo[]> {
  const result = await rpc<Utxo[] | { utxos?: Utxo[] }>(
    rpcUrl,
    'esplora_address::utxo',
    [address],
  );
  if (Array.isArray(result)) return result;
  return (result?.utxos ?? []) as Utxo[];
}

async function fetchProtorunesByOutpoint(
  rpcUrl: string,
  txid: string,
  vout: number,
): Promise<Array<{ block: string | number; tx: string | number; amount: string | number }>> {
  const result = await rpc<{ balance_sheet?: { cached?: { balances?: unknown[] } } }>(
    rpcUrl,
    'alkanes_protorunesbyoutpoint',
    [{ txid, vout, protocolTag: '1' }],
  );
  return (result?.balance_sheet?.cached?.balances ?? []) as Array<{
    block: string | number;
    tx: string | number;
    amount: string | number;
  }>;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

  if (!address) {
    return NextResponse.json({ error: 'address parameter is required' }, { status: 400 });
  }

  // Devnet runs in-browser only — server can't reach it.
  if (network === 'devnet' || network === 'regtest-local') {
    return NextResponse.json({ balances: [] });
  }

  const baseUrl = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.mainnet;

  try {
    // Step 1: address UTXOs.
    const utxos = await fetchAddressUtxos(baseUrl, address);

    // Step 2: filter to dust (alkane carriers) and fan out.
    const dust = utxos.filter((u) => u.value <= 1000);
    if (dust.length === 0) {
      return NextResponse.json({ balances: [] });
    }

    const sheets = await Promise.all(
      dust.map((u) => fetchProtorunesByOutpoint(baseUrl, u.txid, u.vout).catch(() => [])),
    );

    // Step 3: aggregate by (block, tx).
    const balanceMap = new Map<string, bigint>();
    for (const balances of sheets) {
      for (const bal of balances) {
        const id = `${bal.block}:${bal.tx}`;
        const amount = BigInt(String(bal.amount ?? 0));
        if (amount === 0n) continue;
        balanceMap.set(id, (balanceMap.get(id) ?? 0n) + amount);
      }
    }

    const balances = Array.from(balanceMap.entries()).map(([alkaneId, balance]) => ({
      alkaneId,
      balance: balance.toString(),
      name: '',
      symbol: '',
      priceUsd: 0,
      priceInSatoshi: 0,
      tokenImage: '',
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
