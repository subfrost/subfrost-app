/**
 * Clean BTC UTXO discovery for keystore single-address (taproot-only) wallets.
 *
 * The SDK's default `protect_taproot=true` excludes ALL taproot UTXOs from
 * fee-input selection because it can't tell which carry alkanes. For dual-
 * address wallets fees come from segwit, so this is invisible. For single-
 * address keystore wallets where taproot is the only fee source, the
 * protection becomes a denial-of-service.
 *
 * This helper enumerates the taproot UTXOs and per-outpoint queries
 * `alkanes_protorunesbyoutpoint` (the same authoritative pattern used by
 * `useAddLiquidityMutation.discoverAlkaneUtxos`) to certify each as either
 * carrying alkanes (exclude) or empty (clean for fee use). The clean ones
 * are returned in the `txid:vout:satoshis` format expected by the SDK's
 * `payment_utxos` option.
 *
 * Per-outpoint truth is what `useAddLiquidityMutation` already does. We
 * mirror that here rather than relying on the by-address index, which is
 * historical and reports an outpoint as alkane-touched even after the
 * outpoint has been fully drained.
 *
 * Fail-closed: if a per-outpoint query errors, that specific UTXO is
 * excluded (we don't know if it's clean, so we don't claim it is). If the
 * top-level UTXO fetch fails, we return null and the caller falls back to
 * the SDK's default behavior.
 */

const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  devnet: 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
};

interface SimpleUtxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
}

async function fetchAddressUtxos(address: string, networkName?: string): Promise<SimpleUtxo[]> {
  const rpcUrl = networkName === 'devnet' ? 'http://localhost:18888' : '/api/rpc';
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'esplora_address::utxo',
      params: [address],
      id: 1,
    }),
  });
  const json = await resp.json();

  if (networkName === 'devnet') {
    return (Array.isArray(json.result) ? json.result : []).map((u: any) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status?.confirmed ?? false,
    }));
  }

  if (!json.result || !Array.isArray(json.result) || json.result.length === 0) {
    const restUrl = `/api/esplora/address/${address}/utxo${networkName ? `?network=${networkName}` : ''}`;
    const restResp = await fetch(restUrl);
    if (!restResp.ok) throw new Error(`esplora REST returned ${restResp.status}`);
    const restJson = await restResp.json();
    if (!Array.isArray(restJson)) throw new Error('esplora REST returned non-array');
    return restJson.map((u: any) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status?.confirmed ?? false,
    }));
  }

  return json.result.map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    confirmed: u.status?.confirmed ?? false,
  }));
}

/**
 * Live per-outpoint state check via `alkanes_protorunesbyoutpoint`.
 * Returns true iff the outpoint currently holds zero alkane balance.
 *
 * Mirrors the pattern in `useAddLiquidityMutation.discoverAlkaneUtxos`:
 * a non-empty `balance_sheet.cached.balances` array means the outpoint
 * carries alkanes right now, regardless of historical activity.
 *
 * Returns false on any error — fail-closed for the individual outpoint.
 */
async function isOutpointClean(
  txid: string,
  vout: number,
  networkName?: string,
): Promise<boolean> {
  const baseUrl = RPC_ENDPOINTS[networkName || 'mainnet'] || RPC_ENDPOINTS.mainnet;
  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alkanes_protorunesbyoutpoint',
        params: [txid, vout],
      }),
    });
    const json = await resp.json();
    if (json.error) return false;
    const balances = json?.result?.balance_sheet?.cached?.balances || [];
    if (balances.length === 0) return true;
    // Defensive: a drained outpoint can leave zero-amount entries in the
    // balance sheet. Treat as clean only if every entry's amount is zero.
    return balances.every((b: any) => !b.amount || BigInt(b.amount) === 0n);
  } catch {
    return false;
  }
}

/**
 * Returns clean BTC-only UTXOs at a single taproot address as
 * `txid:vout:satoshis` strings (the format `payment_utxos` expects in the
 * SDK options). Returns null if the top-level UTXO fetch fails — caller
 * falls through to default SDK behavior.
 *
 * Per-UTXO classification uses `alkanes_protorunesbyoutpoint` (live
 * authoritative state), the same pattern as
 * `useAddLiquidityMutation.discoverAlkaneUtxos`.
 */
export async function getCleanTaprootBtcUtxos(
  taprootAddress: string,
  networkName?: string,
): Promise<string[] | null> {
  if (!taprootAddress) return null;
  let allUtxos: SimpleUtxo[];
  try {
    allUtxos = await fetchAddressUtxos(taprootAddress, networkName);
  } catch (e) {
    console.warn('[getCleanTaprootBtcUtxos] UTXO fetch failed, falling back to SDK default:', (e as Error)?.message);
    return null;
  }

  const candidates = allUtxos.filter(u => u.confirmed && u.value >= 600);
  if (candidates.length === 0) return null;

  const checks = await Promise.all(
    candidates.map(async u => ({
      utxo: u,
      clean: await isOutpointClean(u.txid, u.vout, networkName),
    })),
  );

  const clean = checks
    .filter(c => c.clean)
    .map(c => `${c.utxo.txid}:${c.utxo.vout}:${c.utxo.value}`);

  return clean.length > 0 ? clean : null;
}
