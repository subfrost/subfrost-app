/**
 * JSON-RPC batch utilities for esplora and alkane RPC calls.
 *
 * Instead of N individual HTTP requests, sends a single JSON-RPC batch array.
 * The /api/rpc proxy routes batch arrays to /v4/jsonrpc on the backend.
 */

interface RpcCall {
  method: string;
  params: any[];
}

interface RpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

/**
 * Send a batch of JSON-RPC calls through the /api/rpc proxy (client-side).
 * Returns results in the same order as the input calls.
 */
export async function batchRpcClient(
  calls: RpcCall[],
  network?: string,
): Promise<(any | null)[]> {
  if (calls.length === 0) return [];
  if (calls.length === 1) {
    // Single call — no need for batch overhead
    const url = network ? `/api/rpc/${network}` : '/api/rpc';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: calls[0].method, params: calls[0].params, id: 1 }),
    });
    const data = await resp.json();
    return [data.result ?? null];
  }

  const batch = calls.map((call, i) => ({
    jsonrpc: '2.0' as const,
    method: call.method,
    params: call.params,
    id: i + 1,
  }));

  const url = network ? `/api/rpc/${network}` : '/api/rpc';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });
  const responses: RpcResponse[] = await resp.json();

  // The batch endpoint may return results out of order — sort by id
  const byId = new Map<number, RpcResponse>();
  if (Array.isArray(responses)) {
    for (const r of responses) byId.set(r.id, r);
  }

  return calls.map((_, i) => {
    const r = byId.get(i + 1);
    return r?.result ?? null;
  });
}

/**
 * Send a batch of JSON-RPC calls directly to a subfrost endpoint (server-side).
 * Used in Next.js API routes where we don't go through the /api/rpc proxy.
 */
export async function batchRpcServer(
  endpoint: string,
  calls: RpcCall[],
): Promise<(any | null)[]> {
  if (calls.length === 0) return [];
  if (calls.length === 1) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: calls[0].method, params: calls[0].params, id: 1 }),
    });
    const data = await resp.json();
    return [data.result ?? null];
  }

  // For batch, use the /jsonrpc endpoint variant
  const batchEndpoint = endpoint.replace(/\/subfrost$/, '/jsonrpc');

  const batch = calls.map((call, i) => ({
    jsonrpc: '2.0' as const,
    method: call.method,
    params: call.params,
    id: i + 1,
  }));

  const resp = await fetch(batchEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });
  const responses: RpcResponse[] = await resp.json();

  const byId = new Map<number, RpcResponse>();
  if (Array.isArray(responses)) {
    for (const r of responses) byId.set(r.id, r);
  }

  return calls.map((_, i) => {
    const r = byId.get(i + 1);
    return r?.result ?? null;
  });
}
