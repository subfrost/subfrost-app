/**
 * Token Details API — Proxies the data API's /get-alkane-details endpoint
 *
 * POST /api/token-details
 * Body: { alkaneIds: ["2:25720", "2:21219"], network?: string }
 *
 * Returns metadata for specific tokens not covered by the bulk /get-alkanes fetch.
 * This proxy avoids CORS issues when fetching directly from subfrost API.
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

/**
 * Well-known devnet token details — server can't reach in-browser WASM devnet.
 */
const DEVNET_TOKEN_DETAILS: Record<string, { name: string; symbol: string }> = {
  '2:0': { name: 'DIESEL', symbol: 'DIESEL' },
  '32:0': { name: 'frBTC', symbol: 'frBTC' },
  '4:256': { name: 'FIRE', symbol: 'FIRE' },
  '4:257': { name: 'FIRE Staking', symbol: 'sFIRE' },
  '4:7000': { name: 'FUEL', symbol: 'FUEL' },
  '4:7010': { name: 'ftrBTC Template', symbol: 'ftrBTC' },
  '4:7020': { name: 'dxBTC Vault', symbol: 'dxBTC' },
  '4:7030': { name: 'vxFUEL Gauge', symbol: 'vxFUEL' },
  '4:7031': { name: 'vxBTCUSD Gauge', symbol: 'vxBTCUSD' },
  '4:8201': { name: 'frUSD', symbol: 'frUSD' },
  '4:8202': { name: 'frBTC/frUSD Pool', symbol: 'SYNTH-LP' },
  '4:65522': { name: 'AMM Factory', symbol: 'FACTORY' },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const alkaneIds: string[] = body?.alkaneIds || [];
    const network = body?.network || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';

    // Devnet runs in-browser only — server can't reach it
    if (network === 'devnet' || network === 'regtest-local') {
      return NextResponse.json({ names: {}, count: 0 });
    }

    if (alkaneIds.length === 0) {
      return NextResponse.json({ names: {} });
    }

    // Devnet: return known token details, empty for unknown
    if (network === 'devnet') {
      const results: Record<string, { name: string; symbol: string }> = {};
      for (const id of alkaneIds.slice(0, 50)) {
        if (DEVNET_TOKEN_DETAILS[id]) {
          results[id] = DEVNET_TOKEN_DETAILS[id];
        }
      }
      return NextResponse.json({ names: results, count: Object.keys(results).length });
    }

    // Cap at 50 to avoid abuse
    const ids = alkaneIds.slice(0, 50);
    const baseUrl = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.mainnet;

    const results: Record<string, { name: string; symbol: string }> = {};

    await Promise.all(ids.map(async (alkaneId) => {
      try {
        const [block, tx] = alkaneId.split(':');
        const resp = await fetch(`${baseUrl}/get-alkane-details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alkaneId: { block, tx } }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const d = data?.data;
        if (d?.name || d?.symbol) {
          results[alkaneId] = { name: d.name || '', symbol: d.symbol || '' };
        }
      } catch { /* ignore individual failures */ }
    }));

    return NextResponse.json({ names: results, count: Object.keys(results).length });
  } catch (error) {
    console.error('[token-details] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch token details' },
      { status: 500 },
    );
  }
}
