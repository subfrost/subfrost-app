/**
 * Token Details API — Proxies the data API's /get-alkane-details endpoint
 * with on-chain fallback to opcode 99 (getName) / opcode 100 (getSymbol).
 *
 * POST /api/token-details
 * Body: { alkaneIds: ["2:25720", "2:21219"], network?: string }
 *
 * Returns metadata for specific tokens not covered by the bulk /get-alkanes fetch.
 * This proxy avoids CORS issues when fetching directly from subfrost API.
 *
 * 2026-05-10 — Added on-chain fallback. Subfrost's `/get-alkane-details`
 * REST returns nothing for many newly-minted or contract-only alkanes,
 * leaving them rendered as the placeholder "Token X:Y" in the wallet.
 * For any id where the REST returns no `name`/`symbol`, we now call
 * `metashrew_view::simulate` against opcode 99 (getName) and opcode 100
 * (getSymbol) on the alkane contract directly. Reverts (contracts that
 * don't implement those opcodes) are caught and skipped — they fall
 * through to the existing "Token X:Y" placeholder, which now means
 * "the contract genuinely has no name op" rather than "subfrost just
 * didn't index this one".
 */

import { NextResponse } from 'next/server';
import { simulateContract, extractField3Data } from '@/lib/fujin/rpc';

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

// Standard alkane contract opcodes for token metadata
const OPCODE_GET_NAME = 99;
const OPCODE_GET_SYMBOL = 100;

/**
 * Decode a UTF-8 string from a hex-encoded run of bytes. Stops at first NUL.
 */
function hexToUtf8(hex: string): string {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte) || byte === 0) break;
    out += String.fromCharCode(byte);
  }
  return out.trim();
}

/**
 * Read a single opcode (99 = name, 100 = symbol) from an alkane contract
 * via metashrew_view::simulate. Returns the decoded string or '' on revert
 * / decode failure / contract-doesn't-implement-the-opcode.
 *
 * The contract return-data layout for these opcodes is just the raw UTF-8
 * bytes inside the standard `field 3` of the simulate response. extractField3Data
 * pulls those bytes; hexToUtf8 decodes them.
 */
async function fetchOnChainString(network: string, alkaneId: string, opcode: number): Promise<string> {
  try {
    const hex = await simulateContract(network, alkaneId, opcode);
    if (!hex) return '';
    const data = extractField3Data(hex, 1);
    if (!data) return '';
    return hexToUtf8(data);
  } catch {
    return '';
  }
}

/**
 * Batch on-chain enrichment for ids that REST didn't cover. Throttles to
 * groups of 10 in parallel to avoid hammering the metashrew RPC.
 */
async function enrichOnChain(
  network: string,
  ids: string[],
): Promise<Record<string, { name: string; symbol: string }>> {
  const out: Record<string, { name: string; symbol: string }> = {};
  if (ids.length === 0) return out;

  const BATCH_SIZE = 10;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (id) => {
      const [name, symbol] = await Promise.all([
        fetchOnChainString(network, id, OPCODE_GET_NAME),
        fetchOnChainString(network, id, OPCODE_GET_SYMBOL),
      ]);
      if (name || symbol) {
        out[id] = { name, symbol };
      }
    }));
  }
  return out;
}

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

    // ── Tier 1: subfrost data API REST (fast, indexed) ────────────────────
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

    // ── Tier 2: on-chain opcode 99 / 100 fallback ─────────────────────────
    // For ids that REST didn't return data for, query the contract directly.
    // Contracts that don't implement these opcodes will revert; we catch and
    // skip them — those genuinely have no on-chain name and the placeholder
    // "Token X:Y" is the honest fallback the UI then renders.
    const missing = ids.filter((id) => !results[id]);
    if (missing.length > 0) {
      const onChain = await enrichOnChain(network, missing);
      for (const [id, entry] of Object.entries(onChain)) {
        results[id] = entry;
      }
    }

    return NextResponse.json({ names: results, count: Object.keys(results).length });
  } catch (error) {
    console.error('[token-details] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch token details' },
      { status: 500 },
    );
  }
}
