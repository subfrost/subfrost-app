/**
 * Alkane Balance API Tests — UTXO+outpoint flow.
 *
 * Pin the contract that this route NEVER uses
 * `alkanes_protorunesbyaddress` (phantom-balance bug). The test
 * harness mocks the JSON-RPC endpoint and asserts the route fetches
 * `esplora_address::utxo` first, then `alkanes_protorunesbyoutpoint`
 * per dust UTXO, and aggregates correctly.
 *
 * Run with: pnpm test app/api/alkane-balances/__tests__/alkane-balances.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from '../route';

function createRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/alkane-balances');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), { method: 'GET' });
}

/** Return an RPC body whose `result` is the supplied value. */
function rpcResult(result: unknown) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
  };
}

describe('GET /api/alkane-balances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when address is missing', async () => {
    const request = createRequest({ network: 'mainnet' });
    const response = await GET(request as Request);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBe('address parameter is required');
  });

  it('returns empty balances when address has no UTXOs', async () => {
    mockFetch.mockResolvedValueOnce(rpcResult([]));
    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as Request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.balances).toEqual([]);
    // Only one fetch (the UTXO list) — no fanout when nothing to fan out to.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty balances when no dust UTXOs (no alkane carriers)', async () => {
    // Big BTC UTXO, no dust → no alkane fanout.
    mockFetch.mockResolvedValueOnce(
      rpcResult([{ txid: 'a'.repeat(64), vout: 0, value: 50_000 }]),
    );
    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as Request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.balances).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('aggregates alkane balances across multiple dust outpoints', async () => {
    // 1st call: address UTXOs (2 dust + 1 BTC).
    mockFetch.mockResolvedValueOnce(
      rpcResult([
        { txid: 'aa'.repeat(32), vout: 0, value: 546 },
        { txid: 'bb'.repeat(32), vout: 1, value: 600 },
        { txid: 'cc'.repeat(32), vout: 0, value: 50_000 }, // BTC, skipped
      ]),
    );
    // 2nd: protorunesbyoutpoint for aa:0
    mockFetch.mockResolvedValueOnce(
      rpcResult({
        balance_sheet: {
          cached: {
            balances: [
              { block: 2, tx: 0, amount: '3000' },
              { block: 32, tx: 0, amount: '1000' },
            ],
          },
        },
      }),
    );
    // 3rd: protorunesbyoutpoint for bb:1
    mockFetch.mockResolvedValueOnce(
      rpcResult({
        balance_sheet: {
          cached: {
            balances: [{ block: 2, tx: 0, amount: '2000' }],
          },
        },
      }),
    );

    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as Request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.balances).toHaveLength(2);

    const diesel = data.balances.find((b: { alkaneId: string }) => b.alkaneId === '2:0');
    const frbtc = data.balances.find((b: { alkaneId: string }) => b.alkaneId === '32:0');
    expect(diesel.balance).toBe('5000'); // 3000 + 2000
    expect(frbtc.balance).toBe('1000');

    // Exactly: utxo + 2× protorunesbyoutpoint = 3 calls.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does NOT call alkanes_protorunesbyaddress', async () => {
    mockFetch.mockResolvedValueOnce(
      rpcResult([{ txid: 'aa'.repeat(32), vout: 0, value: 546 }]),
    );
    mockFetch.mockResolvedValueOnce(
      rpcResult({ balance_sheet: { cached: { balances: [] } } }),
    );
    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    await GET(request as Request);

    for (const call of mockFetch.mock.calls) {
      const body = JSON.parse(call[1]?.body ?? '{}');
      expect(body.method).not.toBe('alkanes_protorunesbyaddress');
    }
  });

  it('uses correct endpoint per network', async () => {
    mockFetch.mockResolvedValueOnce(rpcResult([]));
    const request = createRequest({ address: 'bc1ptest', network: 'regtest' });
    await GET(request as Request);

    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[0]).toBe('https://regtest.subfrost.io/v4/subfrost');
    const body = JSON.parse(firstCall[1]?.body ?? '{}');
    expect(body.method).toBe('esplora_address::utxo');
  });

  it('defaults to mainnet when network param is missing', async () => {
    mockFetch.mockResolvedValueOnce(rpcResult([]));
    const request = createRequest({ address: 'bc1ptest' });
    await GET(request as Request);
    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[0]).toBe('https://mainnet.subfrost.io/v4/subfrost');
  });

  it('handles fetch failure gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const request = createRequest({ address: 'bc1ptest', network: 'mainnet' });
    const response = await GET(request as Request);
    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toBe('Network error');
  });

  it('returns empty for in-browser devnet (server can\'t reach)', async () => {
    const request = createRequest({ address: 'bc1ptest', network: 'devnet' });
    const response = await GET(request as Request);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.balances).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Source-string spec: the production route must NOT reference the
// `alkanes_protorunesbyaddress` RPC method at all. The address-keyed view
// has a phantom-balance bug (see queries/account.ts docs). Any reintroduction
// flips this assertion red.
// ---------------------------------------------------------------------------

describe('source contract', () => {
  it('route source does not reference alkanes_protorunesbyaddress', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../route.ts'), 'utf-8');
    // Comments are fine; method calls are not.
    const codeOnly = src
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/)/.test(l))
      .join('\n');
    expect(codeOnly).not.toMatch(/alkanes_protorunesbyaddress/);
    expect(codeOnly).not.toMatch(/'protorunesbyaddress'/);
  });
});
