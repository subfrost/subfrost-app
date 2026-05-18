#!/usr/bin/env -S npx tsx
/**
 * verify-display-mainnet.ts — pre-push assertion harness for what each
 * wallet UI surface displays, run against the LIVE backend (staging or
 * prod). This catches cross-surface regressions BEFORE pushing to develop:
 * we keep finding that a fix to one surface (e.g. wallet card) leaves a
 * second surface (e.g. send modal, swap input) broken because the inline
 * filter chains were never tested together.
 *
 * Mandate (2026-05-18): no fix lands on develop until this harness runs
 * green for the affected address. Mork's three iterations tonight (false
 * mempool, missing pending, 137_969-vs-230_000 send-modal mismatch) all
 * would have been caught here if it had existed.
 *
 * Built from the SAME pure modules the webapp uses:
 *   - lib/walletState/fetchWalletState          (data layer)
 *   - lib/walletState/sendModalFilter           (SendModal.availableUtxos)
 *   - app/wallet/components/alkaneBalanceBreakdown (AlkanesBalancesCard +
 *                                                   SwapShell balance display)
 *   - lib/alkanes/protorunesByOutpointMV        (canonical per-outpoint decoder)
 *
 * Invariants asserted (each gets exit code 1 on violation):
 *
 *   I1. data-layer consistency
 *       walletState.alkanes[id] === sum(canonical per-outpoint balances for id)
 *       Catches: decoder field-number inversion, dust-fanout drops, indexer drift.
 *
 *   I2. BTC spendable is bitcoind-gated
 *       walletState.btcSats.spendable === sum(non-dust UTXOs with blockHeight !== null)
 *       Catches: metashrew-lag class (mork IMG_2439).
 *
 *   I3. SendModal "Available" == filter-pure aggregate
 *       sumAvailableSats(walletState.utxos, ...) >= clean BTC sats reported elsewhere
 *       Catches: filter drift, alkane-carrier slipping through, fresh UTXO dropped.
 *
 *   I4. No alkane-carrier UTXO surfaces as BTC-spendable on single-address
 *       For each utxo in selectAvailableUtxos(...): utxo.alkanes is empty/None.
 *       Catches: ordinals/alkanes/runes burned as fee inputs.
 *
 *   I5. Pending math is net (signed via mempool_stats)
 *       walletState.btcSats.pendingIn + .pendingOut match esplora_address
 *       mempool_stats.funded_txo_sum / spent_txo_sum.
 *       Catches: gross-mempool-sum overstatement (mork 0.0006 vs 0.0001).
 *
 * Usage:
 *   pnpm tsx scripts/verify-display-mainnet.ts <addr> [--env staging|prod]
 *   pnpm tsx scripts/verify-display-mainnet.ts bc1psn0925c2p5... --env staging
 *
 * Exit 0 = all invariants hold. Exit 1 = at least one violation, structured
 * output identifies which surface and what it produced vs expectation.
 */

import {
  selectAvailableUtxos,
  sumAvailableSats,
  type SendModalFilterUtxo,
} from '../lib/walletState/sendModalFilter';
import {
  decodeOutpointResponse,
  encodeOutpointWithProtocol,
} from '../lib/alkanes/protorunesByOutpointMV';

const ENVS = {
  staging: 'https://staging-app.subfrost.io',
  prod: 'https://app.subfrost.io',
} as const;
type Env = keyof typeof ENVS;

const ALKANE_DUST_MAX = 1000;

interface WalletStateUtxo {
  txid: string;
  vout: number;
  value: number;
  address: string;
  blockHeight: number | null;
  confirmations: number;
  alkanes: Array<{ block: number; tx: number; amount: string }>;
}

interface WalletStateResponse {
  addresses: string[];
  metashrewHeight: number;
  bitcoindHeight: number;
  tipHash: string;
  utxos: WalletStateUtxo[];
  btcSats: { p2wpkh: number; p2tr: number; total: number; spendable: number; pendingIn?: number; pendingOut?: number };
  alkanes: Record<string, string>;
}

interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status?: { confirmed: boolean; block_height?: number };
}

interface EsploraStats {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
}

interface Violation {
  invariant: string;
  surface: string;
  expected: string | number;
  actual: string | number;
  detail?: string;
}

async function jsonPost(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function getWalletState(env: Env, address: string): Promise<WalletStateResponse> {
  const url = `${ENVS[env]}/api/wallet-state?addresses=${encodeURIComponent(address)}&network=mainnet&_cb=${Date.now()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`wallet-state HTTP ${r.status}`);
  return r.json();
}

async function getEsploraUtxos(env: Env, address: string): Promise<EsploraUtxo[]> {
  const j = await jsonPost(`${ENVS[env]}/api/rpc`, {
    jsonrpc: '2.0', id: 1, method: 'esplora_address::utxo', params: [address],
  });
  return j.result || [];
}

async function getEsploraStats(env: Env, address: string): Promise<EsploraStats> {
  const j = await jsonPost(`${ENVS[env]}/api/rpc`, {
    jsonrpc: '2.0', id: 1, method: 'esplora_address', params: [address],
  });
  return j.result;
}

async function probeCanonicalAlkanes(
  env: Env, txid: string, vout: number,
): Promise<Array<{ block: number; tx: number; amount: string }>> {
  const hexInput = encodeOutpointWithProtocol(txid, vout, 1n);
  const j = await jsonPost(`${ENVS[env]}/api/rpc`, {
    jsonrpc: '2.0', id: 1, method: 'metashrew_view',
    params: ['protorunesbyoutpoint', hexInput, 'latest'],
  });
  const decoded = decodeOutpointResponse(j.result || '');
  return (decoded.balance_sheet?.cached?.balances || [])
    .filter((b) => BigInt(b.amount as any) > 0n)
    .map((b) => ({ block: b.block, tx: b.tx, amount: String(b.amount) }));
}

function walletStateUtxoToFilterUtxo(u: WalletStateUtxo): SendModalFilterUtxo {
  return {
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    address: u.address,
    status: {
      confirmed: u.blockHeight !== null,
      block_height: u.blockHeight ?? undefined,
    },
    alkanes: Object.fromEntries(u.alkanes.map((a) => [`${a.block}:${a.tx}`, a])),
    runes: [],
    inscriptions: [],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const address = args.find((a) => !a.startsWith('--'));
  const envFlag = args.find((a) => a.startsWith('--env='))?.split('=')[1]
    ?? (args.includes('--env') ? args[args.indexOf('--env') + 1] : undefined);
  const env: Env = (envFlag as Env) || 'staging';

  if (!address) {
    console.error('Usage: verify-display-mainnet.ts <address> [--env staging|prod]');
    process.exit(1);
  }
  if (!(env in ENVS)) {
    console.error(`Unknown env "${env}". Valid: ${Object.keys(ENVS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== verify-display ${address} via ${env} (${ENVS[env]}) ===\n`);

  const [walletState, esploraUtxos, esploraStats] = await Promise.all([
    getWalletState(env, address),
    getEsploraUtxos(env, address),
    getEsploraStats(env, address),
  ]);

  console.log(`[snapshot] metashrew=${walletState.metashrewHeight} bitcoind=${walletState.bitcoindHeight} utxos=${walletState.utxos.length}`);
  console.log(`[snapshot] btcSats=${JSON.stringify(walletState.btcSats)}`);
  console.log(`[snapshot] alkanes=${JSON.stringify(walletState.alkanes)}\n`);

  const violations: Violation[] = [];

  // -------------------------------------------------------------------------
  // I1. data-layer consistency — wallet-state alkanes vs canonical per-outpoint
  // -------------------------------------------------------------------------
  console.log('[I1] data-layer alkane consistency...');
  const dustUtxos = walletState.utxos.filter((u) => u.value <= ALKANE_DUST_MAX);
  const canonicalAggregate = new Map<string, bigint>();
  for (const u of dustUtxos) {
    const balances = await probeCanonicalAlkanes(env, u.txid, u.vout);
    for (const b of balances) {
      const key = `${b.block}:${b.tx}`;
      canonicalAggregate.set(key, (canonicalAggregate.get(key) ?? 0n) + BigInt(b.amount));
    }
  }
  const wsAlkaneKeys = new Set([
    ...Object.keys(walletState.alkanes),
    ...canonicalAggregate.keys(),
  ]);
  for (const k of wsAlkaneKeys) {
    const wsVal = walletState.alkanes[k] ?? '0';
    const canon = (canonicalAggregate.get(k) ?? 0n).toString();
    if (wsVal !== canon) {
      violations.push({
        invariant: 'I1', surface: 'wallet-state alkanes',
        expected: canon, actual: wsVal,
        detail: `alkane ${k}: wallet-state reports ${wsVal}, canonical per-outpoint sum is ${canon}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // I2. BTC spendable is bitcoind-gated (blockHeight !== null + non-dust)
  // -------------------------------------------------------------------------
  console.log('[I2] BTC spendable bitcoind-gating...');
  const expectedSpendable = walletState.utxos
    .filter((u) => u.blockHeight !== null && u.value > ALKANE_DUST_MAX)
    .reduce((s, u) => s + u.value, 0);
  if (walletState.btcSats.spendable !== expectedSpendable) {
    violations.push({
      invariant: 'I2', surface: 'walletState.btcSats.spendable',
      expected: expectedSpendable, actual: walletState.btcSats.spendable,
      detail: 'spendable should be sum of non-dust UTXOs with blockHeight !== null',
    });
  }

  // -------------------------------------------------------------------------
  // I3. SendModal filter aggregate matches data-layer spendable (single-addr)
  // -------------------------------------------------------------------------
  console.log('[I3] SendModal filter consistency...');
  const filterUtxos = walletState.utxos.map(walletStateUtxoToFilterUtxo);
  const sendModalSum = sumAvailableSats({
    utxos: filterUtxos,
    ourPendingTxids: new Set(),
    frozenUtxos: new Set(),
    showFrozenUtxos: false,
    btcFromAddresses: [address],
    isDualAddressBrowser: false,
  });
  // SendModal filter excludes alkane-carrier dust (correct) but doesn't have
  // a dust-floor. Allowed delta = sum of empty dust (no alkanes, ≤ DUST_MAX).
  const emptyDustSum = walletState.utxos
    .filter((u) => u.value <= ALKANE_DUST_MAX && u.alkanes.length === 0 && u.blockHeight !== null)
    .reduce((s, u) => s + u.value, 0);
  const expectedSendModal = expectedSpendable + emptyDustSum;
  if (sendModalSum !== expectedSendModal) {
    violations.push({
      invariant: 'I3', surface: 'SendModal availableUtxos',
      expected: expectedSendModal, actual: sendModalSum,
      detail: `SendModal sum should equal walletState.spendable (${expectedSpendable}) + empty-dust (${emptyDustSum})`,
    });
  }

  // -------------------------------------------------------------------------
  // I4. No alkane-carrier surfaces as BTC-spendable on single-address
  // -------------------------------------------------------------------------
  console.log('[I4] no alkane-carriers in SendModal output...');
  const selected = selectAvailableUtxos({
    utxos: filterUtxos,
    ourPendingTxids: new Set(),
    frozenUtxos: new Set(),
    showFrozenUtxos: false,
    btcFromAddresses: [address],
    isDualAddressBrowser: false,
  });
  for (const u of selected) {
    const alkaneCount = Array.isArray(u.alkanes) ? u.alkanes.length :
      (u.alkanes ? Object.keys(u.alkanes).length : 0);
    if (alkaneCount > 0) {
      violations.push({
        invariant: 'I4', surface: 'SendModal availableUtxos',
        expected: 0, actual: alkaneCount,
        detail: `UTXO ${u.txid.slice(0, 12)}...:${u.vout} (${u.value} sats) selected as BTC-spendable but carries ${alkaneCount} alkane(s)`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // I5. pending math comes from esplora_address mempool_stats (net signed)
  // -------------------------------------------------------------------------
  console.log('[I5] pending BTC math (net from mempool_stats)...');
  const mempoolFunded = Number(esploraStats.mempool_stats?.funded_txo_sum ?? 0);
  const mempoolSpent = Number(esploraStats.mempool_stats?.spent_txo_sum ?? 0);
  const expectedPendingIn = Math.max(0, mempoolFunded - mempoolSpent);
  const expectedPendingOut = Math.max(0, mempoolSpent - mempoolFunded);
  const actualPendingIn = walletState.btcSats.pendingIn ?? 0;
  const actualPendingOut = walletState.btcSats.pendingOut ?? 0;
  if (actualPendingIn !== expectedPendingIn) {
    violations.push({
      invariant: 'I5', surface: 'walletState.btcSats.pendingIn',
      expected: expectedPendingIn, actual: actualPendingIn,
      detail: `pendingIn should equal max(0, mempool_funded - mempool_spent) = max(0, ${mempoolFunded} - ${mempoolSpent})`,
    });
  }
  if (actualPendingOut !== expectedPendingOut) {
    violations.push({
      invariant: 'I5', surface: 'walletState.btcSats.pendingOut',
      expected: expectedPendingOut, actual: actualPendingOut,
      detail: `pendingOut should equal max(0, mempool_spent - mempool_funded) = max(0, ${mempoolSpent} - ${mempoolFunded})`,
    });
  }

  // -------------------------------------------------------------------------
  // report
  // -------------------------------------------------------------------------
  console.log();
  if (violations.length === 0) {
    console.log('=== RESULT: ok — all invariants hold ===');
    process.exit(0);
  }
  console.log(`=== RESULT: ${violations.length} VIOLATION(S) — display will be wrong for this address ===\n`);
  for (const v of violations) {
    console.log(`  [${v.invariant}] ${v.surface}`);
    console.log(`    expected: ${v.expected}`);
    console.log(`    actual:   ${v.actual}`);
    if (v.detail) console.log(`    detail:   ${v.detail}`);
    console.log();
  }
  process.exit(1);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(99);
});
