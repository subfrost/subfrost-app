/**
 * Clean BTC UTXO discovery for keystore single-address (taproot-only) wallets.
 *
 * The SDK's `protect_taproot=true` default leaves single-address keystores
 * with no fee candidates. This helper enumerates the taproot UTXOs and
 * certifies each via `alkanes_protorunesbyoutpoint` — the same pattern as
 * `useAddLiquidityMutation.discoverAlkaneUtxos`. Returned strings are in
 * `txid:vout:satoshis` form for the SDK's `payment_utxos` option.
 *
 * Per-outpoint live state (not the by-address index) ensures a drained
 * outpoint is correctly classified as clean.
 */

import { getRpcUrl } from '@/utils/getConfig';

interface SimpleUtxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
}

async function fetchAddressUtxos(address: string, networkName?: string): Promise<SimpleUtxo[]> {
  const rpcUrl = getRpcUrl(networkName || 'mainnet');
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

  // On mainnet/testnet, JSON-RPC sometimes returns empty even when UTXOs
  // exist. Fall back to the REST proxy.
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

type OutpointCheck = 'clean' | 'has-alkanes' | 'unknown';

/**
 * Live per-outpoint state via `alkanes_protorunesbyoutpoint`. Distinguishes
 * three outcomes so the caller can decide how to handle each:
 *   - 'clean'        : RPC returned an empty/zero balance sheet
 *   - 'has-alkanes'  : RPC returned a non-zero balance
 *   - 'unknown'      : RPC errored — caller should fail-open (return null
 *                      from the top-level helper) rather than silently
 *                      classify every UTXO as alkane-bearing.
 */
async function classifyOutpoint(
  txid: string,
  vout: number,
  networkName?: string,
): Promise<OutpointCheck> {
  const rpcUrl = getRpcUrl(networkName || 'mainnet');
  try {
    const resp = await fetch(rpcUrl, {
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
    if (json.error) return 'unknown';
    const balances = json?.result?.balance_sheet?.cached?.balances || [];
    if (balances.length === 0) return 'clean';
    // A drained outpoint may leave zero-amount entries in the balance sheet.
    const allZero = balances.every((b: any) => !b.amount || BigInt(b.amount) === 0n);
    return allZero ? 'clean' : 'has-alkanes';
  } catch {
    return 'unknown';
  }
}

/**
 * Returns clean BTC-only taproot UTXOs as `txid:vout:satoshis` strings.
 * Returns null if the UTXO fetch fails OR if any per-UTXO classification
 * is 'unknown' — fail-open prevents a flaky RPC from silently classifying
 * every UTXO as alkane-bearing and starving the user of fee candidates.
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
      result: await classifyOutpoint(u.txid, u.vout, networkName),
    })),
  );

  if (checks.some(c => c.result === 'unknown')) {
    console.warn('[getCleanTaprootBtcUtxos] Per-outpoint classification incomplete, falling back to SDK default');
    return null;
  }

  const clean = checks
    .filter(c => c.result === 'clean')
    .map(c => `${c.utxo.txid}:${c.utxo.vout}:${c.utxo.value}`);

  return clean.length > 0 ? clean : null;
}
