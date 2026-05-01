/**
 * Receipt-by-passage helpers for frostlend.
 *
 * Boiler / FIRE / frostlend share one ownership idiom: the contract has no notion
 * of who-owns-what. It only verifies that the caller passed a receipt token in
 * `incoming_alkanes`. Whoever holds the receipt is "the owner" of that position.
 *
 * Source: reference/boiler/alkanes/alk4626-vault-factory/src/lib.rs::authenticate_position
 *   "context.incoming_alkanes.0[0]" — the receipt IS the call's identity.
 *
 * Frontend job: when the user opens a trove or deposits to SP, the contract spawns
 * a new auth token (sequence-based AlkaneId at block=2) and pushes 1 unit into
 * `response.alkanes.0` so it lands in the user's wallet. We need to know which
 * AlkaneId got assigned so subsequent owner-ops can supply it via inputRequirements.
 *
 * Two recovery techniques used here:
 *   - For Trove: TM exposes GetTroveCount → newly assigned id = count - 1, then
 *     read TM.GetTroveAuthToken(id) to recover the AlkaneId.
 *   - For SP: no GetDepositorCount opcode exists. We snapshot the user's [2,*]
 *     outpoints pre-deposit, fetch again post-mine, and the new entry is the
 *     freshly-spawned depositor receipt. We then probe SP.GetDepositorAuthToken(i)
 *     in a bounded range to recover the depositor_id matching that receipt.
 */

import { getRpcUrl } from '@/utils/getConfig';
import { parseAlkaneTarget, parseU128, simulateAlkane } from './rpc';
import {
  FROSTLEND_CONTRACTS,
  STABILITY_POOL_OPCODES,
} from '@/constants/frostlend';

/** Compact form of an alkane balance entry at a specific outpoint. */
export type Block2Receipt = {
  /** AlkaneId tx field (block is always 2 for sequence-spawned auth tokens). */
  tx: bigint;
  /** Owning outpoint for traceability/debugging. */
  outpoint: { txid: string; vout: number };
};

/**
 * Fetch all [2, *] alkane balances at an address. These are the candidate receipts
 * the user holds. Block=2 is the alkanes runtime convention for sequence-spawned
 * auth tokens (see frostlend BorrowerOps::spawn_auth_token).
 */
export async function fetchUserBlock2Receipts(
  network: string,
  address: string,
): Promise<Block2Receipt[]> {
  const resp = await fetch(getRpcUrl(network), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_protorunesbyaddress',
      params: [{ address, protocolTag: '1' }],
      id: 1,
    }),
  });
  const json = await resp.json();
  const outpoints = json?.result?.outpoints || [];
  const out: Block2Receipt[] = [];
  for (const op of outpoints) {
    const balances = op.balance_sheet?.cached?.balances || op.runes || [];
    for (const entry of balances) {
      const block = parseInt(entry.block ?? '0', 10);
      if (block !== 2) continue;
      const tx = BigInt(entry.tx ?? '0');
      out.push({
        tx,
        outpoint: {
          txid: String(op.outpoint?.txid || op.txid || ''),
          vout: Number(op.outpoint?.vout ?? op.vout ?? 0),
        },
      });
    }
  }
  return out;
}

/**
 * After an SP Deposit tx mines, find the freshly-spawned depositor receipt by
 * diffing the user's [2,*] holdings against the pre-deposit snapshot.
 *
 * Returns the AlkaneId tx field of the new receipt, or null if none found.
 * The caller then probes SP.GetDepositorAuthToken to recover the matching
 * depositor_id.
 */
export function diffNewReceipt(
  beforeTxs: bigint[],
  after: Block2Receipt[],
): bigint | null {
  const beforeSet = new Set(beforeTxs.map(t => t.toString()));
  // The new receipt has the largest tx (sequences are monotonic) AND wasn't in the
  // pre-snapshot. Pick the new one with max tx — handles the rare case where
  // multiple ops happened in the same block.
  let best: bigint | null = null;
  for (const r of after) {
    if (beforeSet.has(r.tx.toString())) continue;
    if (best === null || r.tx > best) best = r.tx;
  }
  return best;
}

/**
 * Probe SP.GetDepositorAuthToken(i) to find which depositor_id maps to a given
 * auth-token AlkaneId tx field. Bounded scan — stops at maxScan.
 *
 * Returns the depositor_id as a decimal string, or null if not found within range.
 *
 * The probe is bounded because frostlend SP doesn't expose a depositor counter
 * via opcode. For the devnet MCP-pilot scope (≤ a handful of deposits) this is
 * fine; if the SP ever has thousands of depositors we'd want a contract patch
 * adding GetNextDepositorId.
 */
export async function findDepositorIdByAuthToken(
  network: string,
  authTokenTx: bigint,
  maxScan = 50,
): Promise<string | null> {
  const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.STABILITY_POOL);
  for (let i = 1; i <= maxScan; i++) {
    const exec = await simulateAlkane(network, target, [
      STABILITY_POOL_OPCODES.GetDepositorAuthToken.toString(),
      i.toString(),
    ]);
    if (!exec || exec.error || !exec.data) continue;
    // Response is 32 bytes: u128 block || u128 tx (LE).
    const raw = typeof exec.data === 'string' ? exec.data.replace(/^0x/, '') : '';
    if (raw.length < 64) continue;
    const txBytes = raw.slice(32, 64);
    const txLe = BigInt('0x' + (txBytes.match(/.{2}/g) || []).reverse().join(''));
    if (txLe === authTokenTx) return i.toString();
  }
  return null;
}

/** Fetch SP.GetCompoundedDeposit(depositor_id). */
export async function fetchCompoundedDeposit(
  network: string,
  depositorId: string,
): Promise<bigint> {
  const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.STABILITY_POOL);
  const exec = await simulateAlkane(network, target, [
    STABILITY_POOL_OPCODES.GetCompoundedDeposit.toString(),
    depositorId,
  ]);
  return parseU128(exec);
}

/** Fetch SP.GetDepositorFrbtcGain(depositor_id). */
export async function fetchDepositorFrbtcGain(
  network: string,
  depositorId: string,
): Promise<bigint> {
  const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.STABILITY_POOL);
  const exec = await simulateAlkane(network, target, [
    STABILITY_POOL_OPCODES.GetDepositorFrbtcGain.toString(),
    depositorId,
  ]);
  return parseU128(exec);
}
