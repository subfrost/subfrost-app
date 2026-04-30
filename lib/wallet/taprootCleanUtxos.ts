/**
 * Clean BTC UTXO discovery for keystore single-address (taproot-only) wallets.
 *
 * Why this exists:
 *   The SDK's default `protect_taproot=true` excludes ALL taproot UTXOs from
 *   fee-input selection because it can't tell which carry alkanes. For dual-
 *   address wallets (keystore with both segwit and taproot, or browser wallets
 *   like Xverse) this is fine — fees come from segwit. But for single-address
 *   keystores (the boot wallet, or a user who only has a taproot address) the
 *   protection becomes a denial-of-service: zero fee candidates → "Insufficient
 *   funds: have 0 (protect_taproot=true)".
 *
 *   This helper does what `protect_taproot` was protecting us from at the SDK
 *   layer — explicitly enumerate the BTC-only taproot UTXOs (subtracting any
 *   that the alkanes indexer says carry tokens) and hand them back as a list
 *   the SDK can use directly via `payment_utxos`.
 *
 *   When `payment_utxos` is set in the SDK options, the SDK uses ONLY those
 *   UTXOs for fees and never falls back to discovery — so `protect_taproot`
 *   becomes a no-op. We've answered its question for it.
 *
 * Fail-closed: if either the UTXO list or the alkane-outpoint query fails,
 * we return null and the caller should NOT pass `payment_utxos` (let the SDK
 * take its default behavior, which will fail loudly rather than silently
 * spending an alkane UTXO as fee).
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
    const utxos = (Array.isArray(json.result) ? json.result : []).map((u: any) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status?.confirmed ?? false,
    }));
    return utxos;
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

async function fetchAlkaneOutpointKeys(address: string, networkName?: string): Promise<Set<string>> {
  const baseUrl = RPC_ENDPOINTS[networkName || 'mainnet'] || RPC_ENDPOINTS.mainnet;
  const resp = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alkanes_protorunesbyaddress',
      params: [{ address, protocolTag: '1' }],
    }),
  });
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message || 'protorunesbyaddress RPC error');

  const outpoints = json?.result?.outpoints || [];
  const keys = new Set<string>();
  for (const entry of outpoints) {
    const op = entry.outpoint;
    if (!op || typeof op !== 'object') continue;
    const txid = op.txid;
    const vout = op.vout;
    if (!txid || typeof vout !== 'number') continue;
    // Only mark as alkane-bearing if the balance sheet has at least one non-zero entry
    const balances = entry?.balance_sheet?.cached?.balances || [];
    const hasNonZero = balances.some((b: any) => b.amount && BigInt(b.amount) > 0n);
    if (hasNonZero) keys.add(`${txid}:${vout}`);
  }
  return keys;
}

/**
 * Returns clean BTC-only UTXOs at a single taproot address as `txid:vout:satoshis`
 * strings (the format `payment_utxos` expects in the SDK options). Returns null
 * on any error — caller should fall through to default SDK behavior.
 *
 * Filters applied:
 *   - confirmed only (mempool selection is the SDK's job)
 *   - excludes any outpoint the alkanes indexer reports as carrying tokens
 *   - excludes dust < 600 sats (can't be a useful fee input)
 */
export async function getCleanTaprootBtcUtxos(
  taprootAddress: string,
  networkName?: string,
): Promise<string[] | null> {
  if (!taprootAddress) return null;
  try {
    const [allUtxos, alkaneKeys] = await Promise.all([
      fetchAddressUtxos(taprootAddress, networkName),
      fetchAlkaneOutpointKeys(taprootAddress, networkName),
    ]);
    const clean = allUtxos
      .filter(u => u.confirmed)
      .filter(u => u.value >= 600)
      .filter(u => !alkaneKeys.has(`${u.txid}:${u.vout}`))
      .map(u => `${u.txid}:${u.vout}:${u.value}`);
    return clean.length > 0 ? clean : null;
  } catch (e) {
    console.warn('[getCleanTaprootBtcUtxos] Failed, falling back to SDK default:', (e as Error)?.message);
    return null;
  }
}
