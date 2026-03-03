/**
 * Build an alkane transfer PSBT entirely in JavaScript.
 *
 * Bypasses the WASM SDK's `alkanesExecuteWithStrings` which internally uses
 * metashrew `protorunes_by_address` for UTXO discovery (now defunct).
 *
 * Instead uses:
 *   - alkanes_protorunesbyaddress RPC for alkane-specific UTXO discovery
 *   - esplora REST API for BTC UTXO discovery (fee funding)
 *   - SDK JS exports (`ProtoStone`, `encodeRunestoneProtostone`) for protostone encoding
 *   - bitcoinjs-lib for PSBT construction with real addresses (no dummy wallet)
 *
 * ============================================================================
 * CRITICAL BUG FIX (2026-03-03): Alkane UTXO Selection
 * ============================================================================
 *
 * **THE BUG:**
 * Previously, this function included ALL dust UTXOs (≤1000 sats) as inputs,
 * assuming they all contained the alkane being sent. This caused wallets like
 * UniSat to show "Spending 2 Inscriptions, 21 Runes, 10 Alkanes" when the user
 * only wanted to send 0.1 DIESEL. The transaction would have spent ALL the
 * user's ordinals/runes/alkanes!
 *
 * **ROOT CAUSE:**
 * Dust UTXOs can contain ANY asset type (inscriptions, runes, alkanes). The old
 * code blindly selected all dust UTXOs without checking what assets they held.
 *
 * **THE FIX:**
 * 1. Query `alkanes_protorunesbyaddress` to get UTXOs that specifically contain alkanes
 * 2. Filter to find only UTXOs containing the TARGET alkane ID (e.g., "2:0" for DIESEL)
 * 3. Only include those specific UTXOs as inputs
 * 4. The protostone edict handles transferring the exact amount to the recipient
 *
 * **VERIFICATION:**
 * After this fix, when sending 0.1 DIESEL, the wallet should only show spending
 * alkanes (the ones containing DIESEL), NOT inscriptions or runes.
 *
 * **Source:** User reported issue via screenshot showing UniSat spending all assets
 * ============================================================================
 */

import * as bitcoin from 'bitcoinjs-lib';
// @ts-expect-error - ProtoStone and encodeRunestoneProtostone are in dist/index.js but not in index.d.ts
import { ProtoStone, encodeRunestoneProtostone } from '@alkanes/ts-sdk';

const DUST_VALUE = 546;
const PROTOCOL_TAG_ALKANES = 1n;

export interface BuildAlkaneTransferParams {
  alkaneId: string;           // e.g., "2:0"
  amount: bigint;             // base units to transfer
  senderTaprootAddress: string;
  senderPaymentAddress?: string; // segwit address for BTC fee funding (dual-address wallets)
  recipientAddress: string;
  tapInternalKeyHex?: string;    // x-only pubkey for P2TR inputs
  paymentPubkeyHex?: string;     // compressed pubkey for P2SH-P2WPKH
  feeRate: number;               // sat/vB
  network: bitcoin.Network;
  networkName: string;           // for RPC proxy routing
}

export interface CollateralWarning {
  hasInscriptions: boolean;
  hasRunes: boolean;
  otherAlkanesCount: number;
  utxoCount: number;  // How many UTXOs have collateral assets
  // JOURNAL (2026-03-03): Added unverifiedInscriptionRunes flag for mainnet where
  // ord_outputs RPC returns "JSON API disabled". When this is true, we couldn't
  // verify whether the UTXOs contain inscriptions/runes, so the user MUST be warned.
  unverifiedInscriptionRunes: boolean;
}

export interface BuildAlkaneTransferResult {
  psbtBase64: string;
  estimatedFee: number;
  collateralWarning?: CollateralWarning;  // Present if some UTXOs contain other assets
}

interface SimpleUtxo {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
}

interface AlkaneOutpoint {
  txid: string;
  vout: number;
  value: number;
  alkanes: { block: number; tx: number; amount: string }[];
  hasInscriptions?: boolean;  // true if UTXO also contains ordinal inscriptions
  hasRunes?: boolean;         // true if UTXO also contains runes
  otherAlkanesCount?: number; // count of OTHER alkanes (not the target) on this UTXO
}

/**
 * Fetch UTXOs for an address via esplora (espo-backed, not metashrew).
 *
 * JOURNAL (2026-03-03): Added comprehensive diagnostic logging for debugging
 * "Failed to fetch UTXOs via esplora" errors. Common causes:
 * - esplora_address::utxo returns empty on mainnet (use REST API instead)
 * - Network connectivity issues
 * - Address has no UTXOs (new wallet)
 */
async function fetchUtxos(address: string, networkName?: string): Promise<SimpleUtxo[]> {
  console.log('[fetchUtxos] Fetching UTXOs for address:', address);
  console.log('[fetchUtxos] Network:', networkName || 'unknown');

  // Try JSON-RPC first (works on regtest)
  const rpcBody = {
    jsonrpc: '2.0',
    method: 'esplora_address::utxo',
    params: [address],
    id: 1,
  };
  console.log('[fetchUtxos] RPC request:', JSON.stringify(rpcBody));

  const resp = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rpcBody),
  });

  console.log('[fetchUtxos] RPC response status:', resp.status);
  const json = await resp.json();
  console.log('[fetchUtxos] RPC response:', JSON.stringify(json).slice(0, 500));

  // If JSON-RPC returns empty/null, fall back to REST API
  if (!json.result || !Array.isArray(json.result) || json.result.length === 0) {
    console.log('[fetchUtxos] JSON-RPC returned empty, trying REST API fallback...');

    // Use REST API proxy (works on mainnet where JSON-RPC returns empty)
    const restUrl = `/api/esplora/address/${address}/utxo${networkName ? `?network=${networkName}` : ''}`;
    console.log('[fetchUtxos] REST URL:', restUrl);

    const restResp = await fetch(restUrl);
    console.log('[fetchUtxos] REST response status:', restResp.status);

    if (!restResp.ok) {
      const errorText = await restResp.text();
      console.error('[fetchUtxos] REST API failed:', restResp.status, errorText);
      throw new Error(`Failed to fetch UTXOs via esplora: REST API returned ${restResp.status}`);
    }

    const restJson = await restResp.json();
    console.log('[fetchUtxos] REST response:', JSON.stringify(restJson).slice(0, 500));

    if (!Array.isArray(restJson)) {
      console.error('[fetchUtxos] REST API returned non-array:', typeof restJson);
      throw new Error('Failed to fetch UTXOs via esplora: REST API returned non-array');
    }

    const utxos = restJson.map((u: any) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status?.confirmed ?? false,
    }));
    console.log('[fetchUtxos] Found', utxos.length, 'UTXOs via REST API');
    return utxos;
  }

  const utxos = json.result.map((u: any) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    confirmed: u.status?.confirmed ?? false,
  }));
  console.log('[fetchUtxos] Found', utxos.length, 'UTXOs via JSON-RPC');
  return utxos;
}

/**
 * Fetch ord_outputs to detect inscriptions and runes on UTXOs.
 * This is critical for avoiding spending inscriptions/runes when transferring alkanes.
 *
 * JOURNAL (2026-03-03): Added to complement alkane UTXO selection — we need to know
 * if a UTXO also contains inscriptions or runes to avoid collateral damage.
 */
interface OrdOutputsResult {
  data: Map<string, { hasInscriptions: boolean; hasRunes: boolean }>;
  rpcFailed: boolean;  // True if RPC returned error/disabled or fetch failed
}

async function fetchOrdOutputs(address: string, networkName?: string): Promise<OrdOutputsResult> {
  console.log('[fetchOrdOutputs] Fetching ord outputs for:', address);

  // Determine the RPC endpoint based on network
  const RPC_ENDPOINTS: Record<string, string> = {
    mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
    testnet: 'https://testnet.subfrost.io/v4/subfrost',
    signet: 'https://signet.subfrost.io/v4/subfrost',
    regtest: 'https://regtest.subfrost.io/v4/subfrost',
    'regtest-local': 'http://localhost:18888',
    'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
    oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  };

  const baseUrl = RPC_ENDPOINTS[networkName || 'mainnet'] || RPC_ENDPOINTS.mainnet;
  const result = new Map<string, { hasInscriptions: boolean; hasRunes: boolean }>();

  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ord_outputs',
        params: [address],
      }),
    });

    const json = await resp.json();

    // JOURNAL (2026-03-03): On mainnet, ord_outputs returns "JSON API disabled"
    // This means we can't verify inscription/rune status on mainnet UTXOs
    if (json.error) {
      console.warn('[fetchOrdOutputs] RPC error (may not be available on this network):', json.error);
      return { data: result, rpcFailed: true };
    }

    // Check for "JSON API disabled" response (mainnet returns this as result, not error)
    if (typeof json.result === 'string' && json.result.includes('disabled')) {
      console.warn('[fetchOrdOutputs] RPC disabled on this network:', json.result);
      return { data: result, rpcFailed: true };
    }

    const outputs = json?.result || [];
    console.log('[fetchOrdOutputs] Raw outputs:', outputs.length);

    for (const output of outputs) {
      if (!output.outpoint) continue;

      const hasInscriptions = Array.isArray(output.inscriptions) && output.inscriptions.length > 0;
      const hasRunes = output.runes && typeof output.runes === 'object' && Object.keys(output.runes).length > 0;

      if (hasInscriptions || hasRunes) {
        result.set(output.outpoint, { hasInscriptions, hasRunes });
        console.log(`[fetchOrdOutputs] ${output.outpoint} has inscriptions=${hasInscriptions}, runes=${hasRunes}`);
      }
    }

    console.log('[fetchOrdOutputs] UTXOs with inscriptions/runes:', result.size);
    return { data: result, rpcFailed: false };
  } catch (err) {
    console.warn('[fetchOrdOutputs] Failed to fetch (proceeding without inscription/rune data):', err);
    return { data: result, rpcFailed: true };
  }
}

/**
 * Fetch alkane-specific outpoints for an address.
 * Returns UTXOs that contain alkanes with their alkane balance info.
 * This is critical for selecting ONLY the UTXOs that contain the target alkane,
 * avoiding accidentally spending inscriptions, runes, or other alkanes.
 *
 * JOURNAL (2026-03-03): Added to fix bug where ALL dust UTXOs were included as inputs,
 * causing the wallet to try to spend inscriptions/runes/other alkanes when sending.
 */
async function fetchAlkaneOutpoints(address: string, networkName?: string): Promise<AlkaneOutpoint[]> {
  console.log('[fetchAlkaneOutpoints] Fetching alkane outpoints for:', address);

  // Determine the RPC endpoint based on network
  const RPC_ENDPOINTS: Record<string, string> = {
    mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
    testnet: 'https://testnet.subfrost.io/v4/subfrost',
    signet: 'https://signet.subfrost.io/v4/subfrost',
    regtest: 'https://regtest.subfrost.io/v4/subfrost',
    'regtest-local': 'http://localhost:18888',
    'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
    oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  };

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

  console.log('[fetchAlkaneOutpoints] RPC response status:', resp.status);
  const json = await resp.json();

  if (json.error) {
    console.error('[fetchAlkaneOutpoints] RPC error:', json.error);
    throw new Error(`Failed to fetch alkane outpoints: ${json.error.message || json.error}`);
  }

  const outpoints = json?.result?.outpoints || [];
  console.log('[fetchAlkaneOutpoints] Raw outpoints:', outpoints.length);

  const result: AlkaneOutpoint[] = [];

  for (const entry of outpoints) {
    // JOURNAL (2026-03-03): Response structure is:
    // { outpoint: { txid: string, vout: number }, output: { value: number }, balance_sheet: { cached: { balances: [...] } } }
    // NOT a "txid:vout" string as originally assumed.
    const outpointData = entry.outpoint;
    if (!outpointData || typeof outpointData !== 'object') {
      console.warn('[fetchAlkaneOutpoints] Invalid outpoint structure:', entry);
      continue;
    }

    const txid = outpointData.txid;
    const vout = outpointData.vout;

    if (!txid || typeof vout !== 'number') {
      console.warn('[fetchAlkaneOutpoints] Missing txid or vout:', outpointData);
      continue;
    }

    const balances = entry?.balance_sheet?.cached?.balances || [];
    const alkanes = balances.map((bal: any) => ({
      block: bal.block,
      tx: bal.tx,
      amount: String(bal.amount || '0'),
    }));

    // Get UTXO value from output.value (included in RPC response)
    const value = entry?.output?.value || 546;

    result.push({
      txid,
      vout,
      value,
      alkanes,
    });
  }

  console.log('[fetchAlkaneOutpoints] Parsed outpoints:', result.map(o => ({
    outpoint: `${o.txid.slice(0, 8)}...:${o.vout}`,
    alkanes: o.alkanes.map(a => `${a.block}:${a.tx} (${a.amount})`),
  })));

  return result;
}

/**
 * Derive the output script for an address.
 * For segwit/taproot addresses this is cheaper and more reliable than
 * fetching the full raw transaction hex from esplora (which can 404 on
 * regtest when the esplora instance is out of sync with the RPC backend).
 */
function addressToScript(address: string, network: bitcoin.Network): Buffer {
  return Buffer.from(bitcoin.address.toOutputScript(address, network));
}

/**
 * Estimate virtual size for an alkane transfer transaction.
 *
 * Outputs: v0 (sender change, P2TR), v1 (recipient), v2 (OP_RETURN), v3 (BTC change)
 */
function estimateVsize(
  numTaprootInputs: number,
  numSegwitInputs: number,
  opReturnSize: number,
  recipientOutputSize: number,
  changeOutputSize: number,
): number {
  const TX_OVERHEAD = 10.5; // version + locktime + witness marker
  const TAPROOT_INPUT_VSIZE = 57.5;
  const SEGWIT_INPUT_VSIZE = 68;
  const P2TR_OUTPUT = 43;
  const OP_RETURN_OUTPUT = 8 + 1 + opReturnSize; // value(8) + scriptLen(1) + script

  return Math.ceil(
    TX_OVERHEAD
    + numTaprootInputs * TAPROOT_INPUT_VSIZE
    + numSegwitInputs * SEGWIT_INPUT_VSIZE
    + P2TR_OUTPUT            // v0: sender alkane change (always taproot)
    + recipientOutputSize    // v1: recipient (varies by address type)
    + OP_RETURN_OUTPUT       // v2: protostone
    + changeOutputSize       // v3: BTC change
  );
}

/**
 * Get output vsize for an address type.
 */
function outputVsizeForAddress(address: string): number {
  const lower = address.toLowerCase();
  if (lower.startsWith('bc1p') || lower.startsWith('tb1p') || lower.startsWith('bcrt1p')) return 43; // P2TR
  if (lower.startsWith('bc1q') || lower.startsWith('tb1q') || lower.startsWith('bcrt1q')) return 31; // P2WPKH
  if (lower.startsWith('3') || lower.startsWith('2')) return 32; // P2SH
  return 34; // P2PKH
}

export async function buildAlkaneTransferPsbt(
  params: BuildAlkaneTransferParams,
): Promise<BuildAlkaneTransferResult> {
  const {
    alkaneId, amount, senderTaprootAddress, senderPaymentAddress,
    recipientAddress, tapInternalKeyHex, feeRate, network, networkName,
  } = params;

  console.log('[buildAlkaneTransferPsbt] Starting PSBT build...');
  console.log('[buildAlkaneTransferPsbt] Params:', {
    alkaneId,
    amount: amount.toString(),
    senderTaprootAddress,
    senderPaymentAddress: senderPaymentAddress || '(same as taproot)',
    recipientAddress,
    feeRate,
    networkName,
  });

  const [block, tx] = alkaneId.split(':').map(Number);

  // -----------------------------------------------------------------------
  // 1. Build protostone OP_RETURN
  // -----------------------------------------------------------------------
  const protostone = ProtoStone.edicts({
    protocolTag: PROTOCOL_TAG_ALKANES,
    edicts: [{
      id: { block: BigInt(block), tx: BigInt(tx) },
      amount: BigInt(amount),
      output: 1, // v1 = recipient
    }],
  });

  const { encodedRunestone } = encodeRunestoneProtostone({
    protostones: [protostone],
    pointer: 0, // unedicted remainder → v0 (sender change)
  });

  const opReturnScript = Buffer.from(encodedRunestone);

  // -----------------------------------------------------------------------
  // 2. Discover UTXOs — CRITICAL: Smart selection to minimize collateral damage
  // -----------------------------------------------------------------------
  // JOURNAL (2026-03-03): Fixed critical bug where ALL dust UTXOs were included,
  // causing wallets to show "spending 2 inscriptions, 21 runes, 10 alkanes" when
  // user only wanted to send 0.1 DIESEL.
  //
  // JOURNAL (2026-03-03): Further enhanced to prefer UTXOs that ONLY contain
  // the target alkane (no inscriptions, runes, or other alkanes). This minimizes
  // "collateral damage" when transferring alkanes.
  //
  // Selection priority:
  // 1. UTXOs with ONLY the target alkane (no inscriptions, no runes, no other alkanes)
  // 2. UTXOs with only alkanes (no inscriptions or runes) - sorted by fewest other alkanes
  // 3. UTXOs with other assets - last resort, sorted by fewest other assets
  // -----------------------------------------------------------------------

  console.log('[buildAlkaneTransferPsbt] Fetching alkane outpoints for:', senderTaprootAddress);

  // Fetch both alkane data and inscription/rune data in parallel
  const [alkaneOutpoints, ordOutputsResult] = await Promise.all([
    fetchAlkaneOutpoints(senderTaprootAddress, networkName),
    fetchOrdOutputs(senderTaprootAddress, networkName),
  ]);

  // JOURNAL (2026-03-03): Track whether ord_outputs RPC failed (mainnet returns "JSON API disabled")
  // If RPC failed, we can't verify inscription/rune status, so we MUST warn the user
  const ordOutputs = ordOutputsResult.data;
  const ordRpcFailed = ordOutputsResult.rpcFailed;
  if (ordRpcFailed) {
    console.warn('[buildAlkaneTransferPsbt] WARNING: ord_outputs RPC failed/disabled. Cannot verify inscription/rune status!');
    console.warn('[buildAlkaneTransferPsbt] Will show warning to user that UTXOs may contain undetected assets.');
  }

  // Find UTXOs that contain the target alkane
  const targetAlkaneId = `${block}:${tx}`;
  console.log('[buildAlkaneTransferPsbt] Looking for alkane:', targetAlkaneId);

  // Enrich alkane outpoints with inscription/rune data
  const enrichedOutpoints = alkaneOutpoints
    .filter(outpoint => outpoint.alkanes.some(a => `${a.block}:${a.tx}` === targetAlkaneId))
    .map(outpoint => {
      const outpointKey = `${outpoint.txid}:${outpoint.vout}`;
      const ordData = ordOutputs.get(outpointKey);
      const otherAlkanesCount = outpoint.alkanes.filter(a => `${a.block}:${a.tx}` !== targetAlkaneId).length;
      const targetBalance = outpoint.alkanes.find(a => `${a.block}:${a.tx}` === targetAlkaneId);

      return {
        ...outpoint,
        hasInscriptions: ordData?.hasInscriptions ?? false,
        hasRunes: ordData?.hasRunes ?? false,
        otherAlkanesCount,
        targetAmount: BigInt(targetBalance?.amount || '0'),
      };
    });

  console.log('[buildAlkaneTransferPsbt] Enriched outpoints:', enrichedOutpoints.length);
  enrichedOutpoints.forEach(o => {
    const collateral = [];
    if (o.hasInscriptions) collateral.push('inscriptions');
    if (o.hasRunes) collateral.push('runes');
    if (o.otherAlkanesCount > 0) collateral.push(`${o.otherAlkanesCount} other alkane(s)`);
    const collateralStr = collateral.length > 0 ? ` [COLLATERAL: ${collateral.join(', ')}]` : ' [CLEAN]';
    console.log(`  ${o.txid.slice(0, 8)}...:${o.vout} - ${o.targetAmount.toString()} units${collateralStr}`);
  });

  if (enrichedOutpoints.length === 0) {
    console.error('[buildAlkaneTransferPsbt] No UTXOs found containing alkane:', targetAlkaneId);
    console.error('[buildAlkaneTransferPsbt] Available alkane outpoints:', alkaneOutpoints);
    throw new Error(`No UTXOs found containing alkane ${targetAlkaneId}`);
  }

  // Calculate total available balance
  const totalAvailable = enrichedOutpoints.reduce((sum, o) => sum + o.targetAmount, BigInt(0));
  console.log('[buildAlkaneTransferPsbt] Total available:', totalAvailable.toString(), 'units');
  console.log('[buildAlkaneTransferPsbt] Amount to send:', amount.toString(), 'units');

  if (totalAvailable < amount) {
    throw new Error(`Insufficient balance: have ${totalAvailable}, need ${amount}`);
  }

  // -----------------------------------------------------------------------
  // Smart UTXO Selection — prefer UTXOs with minimal collateral assets
  // -----------------------------------------------------------------------
  // Sort UTXOs by "cleanliness" score (lower = cleaner = prefer first):
  // - Clean (no inscriptions, no runes, no other alkanes): score 0
  // - Only other alkanes (no inscriptions/runes): score 1 + otherAlkanesCount
  // - Has inscriptions or runes: score 100 + otherAlkanesCount
  const scoredOutpoints = enrichedOutpoints.map(o => ({
    ...o,
    cleanlinessScore: (o.hasInscriptions || o.hasRunes ? 100 : 0) + o.otherAlkanesCount,
  })).sort((a, b) => {
    // First by cleanliness score (lower is better)
    if (a.cleanlinessScore !== b.cleanlinessScore) {
      return a.cleanlinessScore - b.cleanlinessScore;
    }
    // Then by amount (higher is better - use fewer UTXOs)
    return Number(b.targetAmount - a.targetAmount);
  });

  // Greedy selection: pick UTXOs until we have enough
  const selectedOutpoints: typeof scoredOutpoints = [];
  let selectedAmount = BigInt(0);

  for (const outpoint of scoredOutpoints) {
    if (selectedAmount >= amount) break;
    selectedOutpoints.push(outpoint);
    selectedAmount += outpoint.targetAmount;
  }

  console.log('[buildAlkaneTransferPsbt] Selected', selectedOutpoints.length, 'of', enrichedOutpoints.length, 'UTXOs');

  // Warn if we're spending UTXOs with collateral assets
  const collateralUtxos = selectedOutpoints.filter(o => o.hasInscriptions || o.hasRunes || o.otherAlkanesCount > 0);
  let collateralWarning: CollateralWarning | undefined;

  // JOURNAL (2026-03-03): Two scenarios require warning:
  // 1. We detected inscriptions/runes via ord_outputs (hasInscriptions/hasRunes = true)
  // 2. We couldn't query ord_outputs (ordRpcFailed = true, mainnet case)
  // In case 2, we can't know if UTXOs have inscriptions/runes, so we MUST warn
  const shouldWarn = collateralUtxos.length > 0 || ordRpcFailed;

  if (shouldWarn) {
    if (collateralUtxos.length > 0) {
      console.warn('[buildAlkaneTransferPsbt] WARNING: Some selected UTXOs contain other assets!');
      collateralUtxos.forEach(o => {
        const assets = [];
        if (o.hasInscriptions) assets.push('inscriptions');
        if (o.hasRunes) assets.push('runes');
        if (o.otherAlkanesCount > 0) assets.push(`${o.otherAlkanesCount} other alkane(s)`);
        console.warn(`  ${o.txid.slice(0, 8)}...:${o.vout} also contains: ${assets.join(', ')}`);
      });
      console.warn('[buildAlkaneTransferPsbt] The protostone pointer will return unedicted alkanes to sender.');
      console.warn('[buildAlkaneTransferPsbt] However, inscriptions and runes will be transferred to the recipient!');
    }

    if (ordRpcFailed) {
      console.warn('[buildAlkaneTransferPsbt] WARNING: Could not verify inscription/rune status!');
      console.warn('[buildAlkaneTransferPsbt] The selected UTXOs MAY contain inscriptions or runes that will be sent to the recipient.');
    }

    // Build collateral warning for UI
    collateralWarning = {
      hasInscriptions: collateralUtxos.some(o => o.hasInscriptions),
      hasRunes: collateralUtxos.some(o => o.hasRunes),
      otherAlkanesCount: Math.max(0, ...collateralUtxos.map(o => o.otherAlkanesCount)),
      utxoCount: selectedOutpoints.length, // All selected UTXOs may have unverified assets
      unverifiedInscriptionRunes: ordRpcFailed,
    };
  }

  const alkaneUtxos: SimpleUtxo[] = selectedOutpoints.map(o => ({
    txid: o.txid,
    vout: o.vout,
    value: o.value,
    confirmed: true,
  }));

  console.log('[buildAlkaneTransferPsbt] Final selected alkane UTXOs:', alkaneUtxos.length);

  // Fetch all UTXOs for BTC fee funding
  console.log('[buildAlkaneTransferPsbt] Fetching all UTXOs for fee funding...');
  const taprootUtxos = await fetchUtxos(senderTaprootAddress, networkName);

  // BTC UTXOs for fee funding - exclude the alkane UTXOs we're already spending
  const alkaneUtxoKeys = new Set(alkaneUtxos.map(u => `${u.txid}:${u.vout}`));
  const hasSeparatePayment = senderPaymentAddress && senderPaymentAddress !== senderTaprootAddress;
  console.log('[buildAlkaneTransferPsbt] Has separate payment address:', hasSeparatePayment);

  let btcUtxos: SimpleUtxo[];
  if (hasSeparatePayment) {
    console.log('[buildAlkaneTransferPsbt] Fetching UTXOs for payment address:', senderPaymentAddress);
    btcUtxos = await fetchUtxos(senderPaymentAddress, networkName);
    console.log('[buildAlkaneTransferPsbt] Payment UTXOs found:', btcUtxos.length);
  } else {
    // Single-address: use non-dust UTXOs from the taproot address
    // Also exclude any UTXOs we're already using as alkane inputs
    btcUtxos = taprootUtxos.filter(u =>
      u.value > 1000 && !alkaneUtxoKeys.has(`${u.txid}:${u.vout}`)
    );
    console.log('[buildAlkaneTransferPsbt] BTC UTXOs from taproot (>1000 sats, excluding alkane UTXOs):', btcUtxos.length);
  }
  btcUtxos = btcUtxos
    .filter(u => u.confirmed)
    .sort((a, b) => b.value - a.value); // largest first

  console.log('[buildAlkaneTransferPsbt] BTC UTXOs for fee (confirmed, sorted):', btcUtxos.length);
  console.log('[buildAlkaneTransferPsbt] BTC UTXOs:', btcUtxos.map(u => ({
    txid: u.txid.slice(0, 8) + '...',
    vout: u.vout,
    value: u.value,
  })));

  // -----------------------------------------------------------------------
  // 3. Calculate fee and select BTC UTXOs
  // -----------------------------------------------------------------------
  const alkaneInputTotal = alkaneUtxos.reduce((s, u) => s + u.value, 0);
  const outputCost = DUST_VALUE * 2; // v0 (sender change) + v1 (recipient)
  const recipientOutputVsize = outputVsizeForAddress(recipientAddress);
  const btcChangeAddress = hasSeparatePayment ? senderPaymentAddress : senderTaprootAddress;
  const changeOutputVsize = outputVsizeForAddress(btcChangeAddress);

  // Select BTC UTXOs until we cover fee + dust outputs
  const selectedBtcUtxos: SimpleUtxo[] = [];
  let btcInputTotal = 0;
  let estimatedFee = 0;

  // First estimate with zero BTC inputs to get baseline
  for (const utxo of btcUtxos) {
    selectedBtcUtxos.push(utxo);
    btcInputTotal += utxo.value;

    const numTaprootInputs = alkaneUtxos.length + (hasSeparatePayment ? 0 : selectedBtcUtxos.length);
    const numSegwitInputs = hasSeparatePayment ? selectedBtcUtxos.length : 0;

    const vsize = estimateVsize(
      numTaprootInputs,
      numSegwitInputs,
      opReturnScript.length,
      recipientOutputVsize,
      changeOutputVsize,
    );
    estimatedFee = Math.ceil(vsize * feeRate);

    const totalIn = alkaneInputTotal + btcInputTotal;
    const totalOut = outputCost + estimatedFee;

    if (totalIn >= totalOut) break;
  }

  const totalIn = alkaneInputTotal + btcInputTotal;
  const totalOut = outputCost + estimatedFee;

  if (totalIn < totalOut) {
    throw new Error(`Insufficient BTC for fee. Need ${totalOut} sats, have ${totalIn} sats.`);
  }

  const btcChange = totalIn - outputCost - estimatedFee;

  // -----------------------------------------------------------------------
  // 4. Build PSBT
  // -----------------------------------------------------------------------
  const psbt = new bitcoin.Psbt({ network });

  // Parse tapInternalKey for P2TR inputs (BIP-174 standard field).
  // Wallets use this to identify which inputs belong to the connected account.
  const tapInternalKey = tapInternalKeyHex
    ? Buffer.from(tapInternalKeyHex.length === 66 ? tapInternalKeyHex.slice(2) : tapInternalKeyHex, 'hex')
    : undefined;

  // Derive output scripts from known sender addresses instead of fetching
  // raw tx hex from esplora. This avoids 404 errors on regtest where the
  // esplora instance (espo.subfrost.io) may be out of sync with the RPC
  // backend that provided the UTXOs.
  const taprootScript = addressToScript(senderTaprootAddress, network);
  const btcFeeAddress = hasSeparatePayment ? senderPaymentAddress : senderTaprootAddress;
  const btcFeeScript = addressToScript(btcFeeAddress, network);
  const btcFeeIsP2TR = btcFeeScript.length === 34 && btcFeeScript[0] === 0x51 && btcFeeScript[1] === 0x20;

  // Add alkane inputs (taproot, from sender)
  for (const utxo of alkaneUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: taprootScript,
        value: BigInt(utxo.value),
      },
      ...(tapInternalKey ? { tapInternalKey } : {}),
    });
  }

  // Add BTC fee inputs
  for (const utxo of selectedBtcUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: btcFeeScript,
        value: BigInt(utxo.value),
      },
      ...(btcFeeIsP2TR && tapInternalKey ? { tapInternalKey } : {}),
    });
  }

  // v0: Sender alkane change (dust — receives unedicted alkane remainder)
  psbt.addOutput({
    address: senderTaprootAddress,
    value: BigInt(DUST_VALUE),
  });

  // v1: Recipient (dust — receives alkane via edict)
  psbt.addOutput({
    address: recipientAddress,
    value: BigInt(DUST_VALUE),
  });

  // v2: OP_RETURN (protostone)
  psbt.addOutput({
    script: opReturnScript,
    value: BigInt(0),
  });

  // v3: BTC change (fee remainder)
  if (btcChange >= DUST_VALUE) {
    psbt.addOutput({
      address: btcChangeAddress,
      value: BigInt(btcChange),
    });
  }

  return {
    psbtBase64: psbt.toBase64(),
    estimatedFee,
    ...(collateralWarning ? { collateralWarning } : {}),
  };
}
