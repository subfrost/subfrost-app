#!/usr/bin/env -S npx tsx
/**
 * probe-wallet-data.ts — CLI that exercises the EXACT data-loading code
 * paths the webapp uses for wallet display + swap balances, without a
 * browser. Use to diagnose "the UI shows wrong / missing balances for
 * address X" reports without needing camoufox + manual UI dance.
 *
 * What it loads (same endpoints + decoders the webapp uses):
 *
 *   1. /api/wallet-state for the address      (the canonical multi-address
 *                                              snapshot useWalletState consumes)
 *   2. esplora_address::utxo direct           (BTC truth — what the address
 *                                              actually owns at the indexer)
 *   3. alkanes_protorunesbyoutpoint per dust  (legacy wrapper, distinct
 *                                              decoder from the canonical
 *                                              metashrew_view path; useful
 *                                              for cross-check)
 *   4. metashrew_view protorunesbyoutpoint    (canonical path — same one
 *                                              fetchWalletState uses, via
 *                                              lib/alkanes/protorunesByOutpointMV.ts)
 *
 * Output: structured comparison table. Discrepancies between the four
 * sources are the bug; agreement means the UI is misrendering correct data
 * (which is a separate UI-layer problem to fix).
 *
 * Usage:
 *   pnpm tsx scripts/probe-wallet-data.ts <address> [--env staging|prod]
 *
 * Examples:
 *   pnpm tsx scripts/probe-wallet-data.ts bc1psn0925c2p5mjnvkg0xkntpd26wtcyktmwt3shuw7ue04yed5sjfs7xwmj4
 *   pnpm tsx scripts/probe-wallet-data.ts bc1psn... --env prod
 *
 * Doesn't require auth — read-only against the same public endpoints the
 * browser uses. The webapp wraps these in React Query / hooks; this script
 * hits them directly so you can see what the data layer returns vs what
 * the UI renders.
 */

import { decodeOutpointResponse, encodeOutpointWithProtocol } from '../lib/alkanes/protorunesByOutpointMV';

const ENVS = {
  staging: 'https://staging-app.subfrost.io',
  prod: 'https://app.subfrost.io',
} as const;
type Env = keyof typeof ENVS;

const ALKANE_DUST_MAX = 1000;

interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status?: { confirmed: boolean; block_height?: number };
}

interface WalletStateUtxo {
  txid: string;
  vout: number;
  value: number;
  address: string;
  alkanes: Array<{ block: number; tx: number; amount: string }>;
  blockHeight: number | null;
  confirmations: number;
}

interface WalletStateResponse {
  addresses: string[];
  metashrewHeight: number;
  bitcoindHeight: number;
  tipHash: string;
  utxos: WalletStateUtxo[];
  btcSats: { p2wpkh: number; p2tr: number; total: number; spendable: number };
  alkanes: Record<string, string>;
}

interface AlkaneBalance {
  block: number;
  tx: number;
  amount: string;
}

const fmt = (n: number | string) =>
  typeof n === 'number' ? n.toLocaleString() : BigInt(n).toLocaleString();

async function jsonPost(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function getWalletState(env: Env, address: string): Promise<WalletStateResponse | null> {
  const url = `${ENVS[env]}/api/wallet-state?addresses=${encodeURIComponent(address)}&network=mainnet&_cb=${Date.now()}`;
  const r = await fetch(url);
  if (!r.ok) {
    console.error(`  wallet-state HTTP ${r.status}`);
    return null;
  }
  return r.json();
}

async function getEsploraUtxos(env: Env, address: string): Promise<EsploraUtxo[]> {
  const j = await jsonPost(`${ENVS[env]}/api/rpc`, {
    jsonrpc: '2.0',
    id: 1,
    method: 'esplora_address::utxo',
    params: [address],
  });
  return j.result || [];
}

async function probeLegacyAlkanes(env: Env, txid: string, vout: number): Promise<AlkaneBalance[]> {
  const j = await jsonPost(`${ENVS[env]}/api/rpc`, {
    jsonrpc: '2.0',
    id: 1,
    method: 'alkanes_protorunesbyoutpoint',
    params: [{ txid, vout }],
  });
  const balances = j.result?.balance_sheet?.cached?.balances || [];
  return balances
    .map((b: any) => ({ block: Number(b.block), tx: Number(b.tx), amount: String(b.amount) }))
    .filter((b: AlkaneBalance) => b.amount !== '0');
}

async function probeCanonicalAlkanes(
  env: Env,
  txid: string,
  vout: number,
): Promise<AlkaneBalance[]> {
  const hexInput = encodeOutpointWithProtocol(txid, vout, 1n);
  const j = await jsonPost(`${ENVS[env]}/api/rpc`, {
    jsonrpc: '2.0',
    id: 1,
    method: 'metashrew_view',
    params: ['protorunesbyoutpoint', hexInput, 'latest'],
  });
  const decoded = decodeOutpointResponse(j.result || '');
  return (decoded.balance_sheet?.cached?.balances || [])
    .filter((b) => BigInt(b.amount as any) > 0n)
    .map((b) => ({ block: b.block, tx: b.tx, amount: String(b.amount) }));
}

async function tokenName(env: Env, block: number, tx: number): Promise<string> {
  try {
    const r = await fetch(`${ENVS[env]}/api/token-details?ids=${block}:${tx}`);
    const j = await r.json();
    const item = Array.isArray(j) ? j[0] : j[`${block}:${tx}`] || j?.data?.[0];
    return item?.symbol || item?.name || `${block}:${tx}`;
  } catch {
    return `${block}:${tx}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const address = args.find((a) => !a.startsWith('--'));
  const envFlag = args.find((a) => a.startsWith('--env='))?.split('=')[1]
    ?? (args.includes('--env') ? args[args.indexOf('--env') + 1] : undefined);
  const env: Env = (envFlag as Env) || 'staging';

  if (!address) {
    console.error('Usage: probe-wallet-data.ts <address> [--env staging|prod]');
    process.exit(1);
  }
  if (!(env in ENVS)) {
    console.error(`Unknown env "${env}". Valid: ${Object.keys(ENVS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== probe ${address} via ${env} (${ENVS[env]}) ===\n`);

  // ---- Step 1: hit /api/wallet-state ----
  console.log('[1] /api/wallet-state (what the webapp consumes):');
  const ws = await getWalletState(env, address);
  if (!ws) {
    console.error('  failed');
    process.exit(2);
  }
  console.log(`  metashrewHeight: ${ws.metashrewHeight}`);
  console.log(`  tipHash:         ${ws.tipHash?.slice(0, 16) || '<empty>'}`);
  console.log(`  utxos:           ${ws.utxos.length} (${ws.utxos.filter((u) => u.value <= ALKANE_DUST_MAX).length} dust)`);
  console.log(`  btcSats.total:   ${fmt(ws.btcSats.total)} (spendable: ${fmt(ws.btcSats.spendable)})`);
  console.log(`  alkanes:`);
  const wsKeys = Object.keys(ws.alkanes || {}).sort();
  if (wsKeys.length === 0) {
    console.log('    (none)');
  } else {
    for (const k of wsKeys) {
      const [block, tx] = k.split(':').map(Number);
      const sym = await tokenName(env, block, tx);
      console.log(`    ${k.padEnd(12)} ${sym.padEnd(10)} ${fmt(ws.alkanes[k])}`);
    }
  }

  // ---- Step 2: esplora truth ----
  console.log('\n[2] esplora_address::utxo (BTC truth):');
  const utxos = await getEsploraUtxos(env, address);
  utxos.sort((a, b) => a.value - b.value);
  const dust = utxos.filter((u) => u.value <= ALKANE_DUST_MAX);
  console.log(`  total utxos: ${utxos.length}, dust(≤${ALKANE_DUST_MAX}): ${dust.length}`);
  for (const u of utxos.slice(0, 6)) {
    console.log(`    ${u.value.toString().padStart(10)} sats  ${u.txid.slice(0, 12)}...:${u.vout}  blk=${u.status?.block_height ?? '?'}`);
  }
  if (utxos.length > 6) console.log(`    ... ${utxos.length - 6} more`);

  // ---- Step 3+4: probe each dust UTXO via BOTH alkane decoders ----
  console.log('\n[3] alkanes_protorunesbyoutpoint (legacy wrapper) + [4] metashrew_view (canonical) per dust UTXO:');
  console.log('   outpoint                                      legacy                       canonical');
  console.log('   ' + '-'.repeat(95));
  const legacyAggregate = new Map<string, bigint>();
  const canonicalAggregate = new Map<string, bigint>();
  for (const u of dust) {
    const [legacy, canonical] = await Promise.all([
      probeLegacyAlkanes(env, u.txid, u.vout),
      probeCanonicalAlkanes(env, u.txid, u.vout),
    ]);
    const legacyStr = legacy.length
      ? legacy.map((b) => `${b.block}:${b.tx}=${fmt(b.amount)}`).join(' ')
      : '(empty)';
    const canonicalStr = canonical.length
      ? canonical.map((b) => `${b.block}:${b.tx}=${fmt(b.amount)}`).join(' ')
      : '(empty)';
    console.log(`   ${u.txid.slice(0, 12)}...:${u.vout.toString().padEnd(2)} ${u.value.toString().padStart(4)} sats  ${legacyStr.padEnd(28)} ${canonicalStr}`);
    for (const b of legacy) {
      const key = `${b.block}:${b.tx}`;
      legacyAggregate.set(key, (legacyAggregate.get(key) ?? 0n) + BigInt(b.amount));
    }
    for (const b of canonical) {
      const key = `${b.block}:${b.tx}`;
      canonicalAggregate.set(key, (canonicalAggregate.get(key) ?? 0n) + BigInt(b.amount));
    }
  }

  // ---- Reconciliation: are all three sources consistent? ----
  console.log('\n[5] Reconciliation — wallet-state aggregate vs per-outpoint sums vs each decoder:');
  console.log('   alkane_id     legacy(by-outpoint)    canonical(by-outpoint)   wallet-state-aggregate  status');
  console.log('   ' + '-'.repeat(110));
  const allKeys = new Set<string>([
    ...wsKeys,
    ...legacyAggregate.keys(),
    ...canonicalAggregate.keys(),
  ]);
  let anyMismatch = false;
  for (const k of [...allKeys].sort()) {
    const wsVal = ws.alkanes[k] ?? '0';
    const legacyVal = (legacyAggregate.get(k) ?? 0n).toString();
    const canonVal = (canonicalAggregate.get(k) ?? 0n).toString();
    const allEqual = wsVal === legacyVal && legacyVal === canonVal;
    const status = allEqual ? 'ok' : 'MISMATCH';
    if (!allEqual) anyMismatch = true;
    const [block, tx] = k.split(':').map(Number);
    const sym = await tokenName(env, block, tx);
    console.log(`   ${k.padEnd(13)} ${legacyVal.padStart(20)}   ${canonVal.padStart(20)}   ${wsVal.padStart(20)}   ${status}  (${sym})`);
  }

  console.log();
  if (anyMismatch) {
    console.log('RESULT: MISMATCH — the data layer is returning inconsistent state.');
    console.log('  - If wallet-state-aggregate < canonical-by-outpoint: the route is missing alkanes that the indexer knows about.');
    console.log('    Common causes: (a) dust-fanout missed an outpoint, (b) decoder bug, (c) Redis serving stale snapshot.');
    console.log('  - If legacy != canonical: indexer is inconsistent across endpoints (rare; would be an alkanes-rs issue).');
    process.exit(3);
  }
  console.log('RESULT: ok — all three sources agree. If the UI still shows wrong, the bug is in the React-layer (hook / component) above the data.');
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(99);
});
