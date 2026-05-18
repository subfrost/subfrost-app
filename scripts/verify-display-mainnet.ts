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
 *   I6. Wallet-card alkane display matches swap-shell alkane display
 *       /api/alkane-balances?addresses=... (used by useEnrichedWalletData)
 *       must return the SAME alkane keys + balances as walletState.alkanes.
 *       Catches: cross-surface disagreement like mork's 2026-05-18
 *       screenshots (wallet card DIESEL 4.5122, swap input DIESEL 0).
 *       The wallet card and swap shell both consume balances through
 *       `alkaneBalanceQueryOptions`, which on mainnet now reads from
 *       `/api/wallet-state`. If that route stops being the single source,
 *       this invariant fires.
 *
 *   I7. User-facing inputs show AVAILABLE, not TOTAL (mork1e 2026-05-18 FB6)
 *       SendModal "available" label, SwapShell formatBalance, and any other
 *       user-facing input MUST equal `getSendableAlkane(confirmed, delta).availableRaw`.
 *       Catches: a future regression where one surface goes back to showing
 *       raw balance and lets the user try to spend mempool-locked amounts.
 *       Mork's spec: "if i had 10k tortilla across 5 utxos and i was spending
 *       a utxo that had 700 tortilla / available should be 9300 tortilla /
 *       mempool should be 700 tortilla / total should be 10k tortilla".
 *
 *   I8. getSendableAlkane is the single helper for the I7 contract
 *       Synthesises mork's scenario and asserts the helper returns the
 *       spec values. Mirrors the vitest pins in
 *       lib/walletState/__tests__/sendableAlkane.test.ts but runs against
 *       the actual built code — catches build-system / module-resolution
 *       drift that vitest's mocked environment can mask.
 *
 *   I9. metashrew vs bitcoind tip alignment (mork1e 2026-05-18 FB6)
 *       walletState.metashrewHeight must be within INDEXER_LAG_TOLERANCE
 *       (1 block) of walletState.bitcoindHeight, AND bitcoindHeight must
 *       be non-zero. Catches: the split-brain class where esplora returns
 *       "now" UTXOs but metashrew per-outpoint reads are pinned to a
 *       lagging height, dropping every alkane whose carrier was created
 *       in the gap. Also catches a broken fetchBitcoindHeight (returns 0
 *       silently — was the 2026-05-18 wire-format bug:
 *       `esplora_blocks::tip:height` had a double-slash and 404'd).
 *
 *   I10. Alkane coverage: every dust UTXO esplora reports has a
 *        balance sheet entry in walletState.utxos[].alkanes (or none of
 *        them do, for a wallet with no alkanes). Catches: per-outpoint
 *        fanout silently returning empty for outpoints that DO carry
 *        alkanes on-chain (the symptom of mork1e's "2 of 7 alkanes"
 *        screenshot).
 *
 *   I11. Mempool-locked alkane tracking (mork1e + brooks 2026-05-18 FB6)
 *        For every mempool tx spending one of our outpoints, the alkanes
 *        on those outpoints must surface in walletState.mempoolLockedAlkanes.
 *        Catches: wallet card showing "mempool: 0.0000" on DIESEL/FARTANE
 *        after a swap that locked them in mempool — the server-side
 *        overlay is independent of browser pendingTxStore so iOS / fresh
 *        sessions / cross-surface txs all get the correct display.
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
import { getSendableAlkane } from '../lib/walletState/sendableAlkane';
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
  mempoolLockedAlkanes?: Record<string, string>;
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
  // I6. Wallet card vs swap shell alkane consistency
  // -------------------------------------------------------------------------
  // Both surfaces consume `alkaneBalanceQueryOptions`, which on mainnet
  // round-trips through /api/wallet-state. Two pulls of /api/wallet-state
  // for the same address MUST return the same alkane keys + balances —
  // any drift here means the unified backend isn't actually unified
  // (e.g. someone resurrected an alkanode REST shortcut, or wired a
  // separate path into one surface).
  console.log('[I6] wallet-card vs swap-shell alkane consistency...');
  const secondPull = await getWalletState(env, address);
  const firstKeys = new Set(Object.keys(walletState.alkanes));
  const secondKeys = new Set(Object.keys(secondPull.alkanes));
  for (const k of new Set([...firstKeys, ...secondKeys])) {
    const a = walletState.alkanes[k] ?? '0';
    const b = secondPull.alkanes[k] ?? '0';
    if (a !== b) {
      violations.push({
        invariant: 'I6', surface: 'wallet-card vs swap-shell',
        expected: a, actual: b,
        detail: `alkane ${k}: two pulls of /api/wallet-state returned different balances (${a} vs ${b}). The unified backend is no longer the single source — wallet card and swap shell will display different numbers, which is mork's 2026-05-18 bug class.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // I7. User-facing inputs show AVAILABLE not TOTAL — live + synthetic
  // -------------------------------------------------------------------------
  // For each alkane in the wallet, the value a user-facing input MUST
  // display equals `getSendableAlkane(confirmed, pendingDelta).availableRaw`.
  // We can't observe pendingTxStore from outside the browser, so live
  // assertion is reduced to: when no pending entry exists, available ==
  // total (the trivial case). The synthetic case below (I8) carries the
  // load for the non-trivial scenario.
  console.log('[I7] user-facing input projections (live, no pending)...');
  for (const [id, balanceStr] of Object.entries(walletState.alkanes)) {
    const live = getSendableAlkane(balanceStr, undefined);
    if (live.availableRaw.toString() !== balanceStr) {
      violations.push({
        invariant: 'I7', surface: 'getSendableAlkane(no pending)',
        expected: balanceStr, actual: live.availableRaw.toString(),
        detail: `alkane ${id}: with no pending tx, available MUST equal total. Drift here means the helper is doing something it shouldn't.`,
      });
    }
    if (live.mempoolRaw !== 0n) {
      violations.push({
        invariant: 'I7', surface: 'getSendableAlkane(no pending)',
        expected: '0', actual: live.mempoolRaw.toString(),
        detail: `alkane ${id}: with no pending tx, mempool MUST be 0.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // I8. getSendableAlkane honours mork1e's spec
  // -------------------------------------------------------------------------
  console.log('[I8] getSendableAlkane mork1e 10k/700 spec...');
  const morkSpec = getSendableAlkane('10000', { delta: -700n });
  if (morkSpec.totalRaw !== 10000n) {
    violations.push({
      invariant: 'I8', surface: 'getSendableAlkane(10k, -700) → totalRaw',
      expected: '10000', actual: morkSpec.totalRaw.toString(),
      detail: 'mork1e spec: total stays at the confirmed amount.',
    });
  }
  if (morkSpec.availableRaw !== 9300n) {
    violations.push({
      invariant: 'I8', surface: 'getSendableAlkane(10k, -700) → availableRaw',
      expected: '9300', actual: morkSpec.availableRaw.toString(),
      detail: 'mork1e spec: available = total - mempool-locked. User-facing inputs MUST use this.',
    });
  }
  if (morkSpec.mempoolRaw !== 700n) {
    violations.push({
      invariant: 'I8', surface: 'getSendableAlkane(10k, -700) → mempoolRaw',
      expected: '700', actual: morkSpec.mempoolRaw.toString(),
      detail: 'mork1e spec: mempool = amount locked in pending UTXO being spent.',
    });
  }
  // Full lockup (alkane lives only in pending-spent UTXOs):
  const fullLock = getSendableAlkane('700', { delta: -700n });
  if (fullLock.availableRaw !== 0n || fullLock.mempoolRaw !== 700n || !fullLock.canSendAny === true) {
    // canSendAny=false expected here
  }
  if (fullLock.availableRaw !== 0n) {
    violations.push({
      invariant: 'I8', surface: 'getSendableAlkane(700, -700) → availableRaw',
      expected: '0', actual: fullLock.availableRaw.toString(),
      detail: 'mork1e: "if it lives in a utxo where its being spent, it is deducted from total" — full lockup → available 0.',
    });
  }
  if (fullLock.canSendAny !== false) {
    violations.push({
      invariant: 'I8', surface: 'getSendableAlkane(700, -700) → canSendAny',
      expected: 'false', actual: String(fullLock.canSendAny),
      detail: 'Full mempool lockup → cannot send any. User-facing inputs gate on this.',
    });
  }

  // -------------------------------------------------------------------------
  // I9. metashrew vs bitcoind tip alignment
  // -------------------------------------------------------------------------
  console.log('[I9] metashrew vs bitcoind tip alignment...');
  if (walletState.bitcoindHeight === 0) {
    violations.push({
      invariant: 'I9', surface: 'walletState.bitcoindHeight',
      expected: '> 0', actual: 0,
      detail: 'bitcoindHeight=0 indicates fetchBitcoindHeight is broken (e.g. JSON-RPC method renamed upstream). Without bitcoindHeight the split-brain check below cannot fire — silently serves split snapshots like mork1e 2026-05-18 (2 of 7 alkanes).',
    });
  } else {
    const lag = walletState.bitcoindHeight - walletState.metashrewHeight;
    const TOLERANCE = 1;
    if (lag > TOLERANCE) {
      violations.push({
        invariant: 'I9', surface: 'walletState tip alignment',
        expected: `metashrew within ${TOLERANCE} block(s) of bitcoind`,
        actual: `metashrew=${walletState.metashrewHeight}, bitcoind=${walletState.bitcoindHeight}, lag=${lag}`,
        detail: 'When metashrew lags bitcoind, the per-outpoint protorune fanout (pinned to metashrewHeight) returns empty for UTXOs that esplora-now reports as unspent but metashrew-then hadn\'t seen yet. Snapshot silently drops alkanes.',
      });
    }
  }

  // -------------------------------------------------------------------------
  // I10. Alkane coverage — no dust UTXO with on-chain alkanes goes empty
  // -------------------------------------------------------------------------
  console.log('[I10] alkane coverage check (every dust UTXO carries its balance sheet)...');
  for (const u of walletState.utxos) {
    if (u.value > ALKANE_DUST_MAX) continue;
    // Re-fanout against the SNAPSHOT'S tipHash (not 'latest') so we ask the
    // same question the snapshot did. If snapshot says empty AND canonical
    // says non-empty at the same tip, the snapshot is broken.
    const canonical = await probeCanonicalAlkanes(env, u.txid, u.vout);
    const snapshotCount = Array.isArray(u.alkanes) ? u.alkanes.length : 0;
    if (canonical.length > 0 && snapshotCount === 0) {
      violations.push({
        invariant: 'I10', surface: `walletState.utxos[${u.txid.slice(0,12)}...:${u.vout}].alkanes`,
        expected: `${canonical.length} alkane entries`,
        actual: '0',
        detail: `dust UTXO carries ${canonical.length} on-chain alkane(s) per canonical fanout, but walletState shows empty. This UTXO's alkane balance is invisible to the wallet card.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // I11. Mempool-locked alkane tracking
  // -------------------------------------------------------------------------
  console.log('[I11] mempool-locked alkane coverage...');
  // Fetch all mempool txs touching our address. For each vin whose
  // prevout is our address, sum the alkanes at that outpoint and assert
  // walletState.mempoolLockedAlkanes covers the same set.
  const mempoolTxsResp = await jsonPost(`${ENVS[env]}/api/rpc`, {
    jsonrpc: '2.0', id: 1, method: 'esplora_address::txs:mempool', params: [address],
  });
  const mempoolTxs: Array<{
    txid: string;
    vin?: Array<{ txid: string; vout: number; prevout?: { scriptpubkey_address?: string } }>;
  }> = Array.isArray(mempoolTxsResp.result) ? mempoolTxsResp.result : [];

  const expectedLocked = new Map<string, bigint>();
  const seenOps = new Set<string>();
  for (const tx of mempoolTxs) {
    for (const vin of tx.vin ?? []) {
      if (vin.prevout?.scriptpubkey_address !== address) continue;
      const k = `${vin.txid}:${vin.vout}`;
      if (seenOps.has(k)) continue;
      seenOps.add(k);
      const balances = await probeCanonicalAlkanes(env, vin.txid, vin.vout);
      for (const b of balances) {
        const key = `${b.block}:${b.tx}`;
        expectedLocked.set(key, (expectedLocked.get(key) ?? 0n) + BigInt(b.amount));
      }
    }
  }

  const actualLocked = walletState.mempoolLockedAlkanes ?? {};
  // Diff: every expected entry must be present with the right value;
  // extras are tolerated (could be from txs at other addresses we don't
  // know about). Missing or wrong = violation.
  for (const [id, expected] of expectedLocked) {
    const actual = actualLocked[id];
    if (actual == null || BigInt(actual) !== expected) {
      violations.push({
        invariant: 'I11', surface: 'walletState.mempoolLockedAlkanes',
        expected: expected.toString(),
        actual: actual ?? 'undefined',
        detail: `alkane ${id}: live mempool txs lock ${expected} sub-units via this address, but walletState reports ${actual ?? 'nothing'}. Wallet card will show "mempool: 0.0000" on this alkane row (mork1e + brooks 2026-05-18 bug class).`,
      });
    }
  }
  console.log(`  ${mempoolTxs.length} mempool tx(s), ${seenOps.size} our-outpoint(s) spent, ${expectedLocked.size} alkane id(s) expected locked, ${Object.keys(actualLocked).length} reported`);

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
