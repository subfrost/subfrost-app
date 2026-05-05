/**
 * Pin the contract for the pre-warmed wallet UTXO cache and the
 * sync-status gate. The cache is the path swap/send/addLiq mutations
 * read from at click time — fanning out RPC there is the bottleneck
 * users complained about (2026-05-05). The query layer must:
 *
 *   - never read from `protorunesbyaddress` (phantom-balance bug)
 *   - never poll on its own (HeightPoller is the single invalidator)
 *   - stay healthy across network failures (preserve prior data)
 *   - shape the result for O(1) byOutpoint / byAlkane lookups
 *
 * The sync-status query polls (4s) to surface metashrew-vs-bitcoind
 * lag promptly so the UI can disable submit buttons before the user
 * sends a tx that would error mid-flight.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ACCOUNT_PATH = path.resolve(__dirname, '../account.ts');
const SRC = fs.readFileSync(ACCOUNT_PATH, 'utf-8');

describe('walletUtxoCacheQueryOptions', () => {
  it('exists as a named export', () => {
    expect(SRC).toMatch(/export function walletUtxoCacheQueryOptions/);
  });

  it('uses staleTime: Infinity (HeightPoller-only invalidation)', () => {
    const fn =
      SRC.match(/export function walletUtxoCacheQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(fn).toMatch(/staleTime:\s*Infinity/);
  });

  it('does NOT poll on its own', () => {
    const fn =
      SRC.match(/export function walletUtxoCacheQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(fn).not.toMatch(/refetchInterval:/);
  });

  it('fans out via getProtorunesByOutpoint per dust UTXO', () => {
    const fn =
      SRC.match(/export function walletUtxoCacheQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(fn).toMatch(/getProtorunesByOutpoint/);
    expect(fn).toMatch(/Promise\.all/);
  });

  it('does NOT touch protorunesbyaddress', () => {
    const fn =
      SRC.match(/export function walletUtxoCacheQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(fn).not.toMatch(/protorunesbyaddress/);
  });

  it('filters to dust UTXOs (≤1000 sats) before fanout', () => {
    const fn =
      SRC.match(/export function walletUtxoCacheQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(fn).toMatch(/u\.value\s*<=?\s*1000/);
  });

  it('throws on per-outpoint failure (preserves prior cache via React Query retry)', () => {
    const fn =
      SRC.match(/export function walletUtxoCacheQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    // Retry shape: array of delays, throw after exhaustion.
    expect(fn).toMatch(/RETRY_DELAYS/);
    expect(fn).toMatch(/throw new Error\(/);
  });

  it('exports CachedUtxo + WalletUtxoCache types', () => {
    expect(SRC).toMatch(/export interface CachedUtxo/);
    expect(SRC).toMatch(/export interface WalletUtxoCache/);
  });

  it('result shape has O(1) lookups: byOutpoint, byAlkane, balances', () => {
    expect(SRC).toMatch(/byOutpoint:\s*Map<string,\s*CachedUtxo>/);
    expect(SRC).toMatch(/byAlkane:\s*Map<string,\s*CachedUtxo\[\]>/);
    expect(SRC).toMatch(/balances:\s*Map<string,\s*bigint>/);
  });
});

describe('syncStatusQueryOptions', () => {
  it('exists as a named export', () => {
    expect(SRC).toMatch(/export function syncStatusQueryOptions/);
  });

  it('polls metashrew + bitcoind in parallel', () => {
    const fn =
      SRC.match(/export function syncStatusQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(fn).toMatch(/Promise\.all/);
    expect(fn).toMatch(/metashrew_height/);
    expect(fn).toMatch(/btc_getblockcount/);
  });

  it('refetches on a short interval (≤5s) so the gate stays current', () => {
    const fn =
      SRC.match(/export function syncStatusQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    const match = fn.match(/refetchInterval:\s*(\d[\d_]*)/);
    expect(match).not.toBeNull();
    const interval = parseInt((match?.[1] ?? '').replace(/_/g, ''), 10);
    expect(interval).toBeLessThanOrEqual(5_000);
  });

  it('inSync condition: metashrew >= bitcoind', () => {
    const fn =
      SRC.match(/export function syncStatusQueryOptions[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(fn).toMatch(/inSync:\s*[^,]*metashrewHeight\s*>=\s*bitcoindHeight/);
  });

  it('exports SyncStatus type with the four fields', () => {
    expect(SRC).toMatch(/export interface SyncStatus[\s\S]*metashrewHeight[\s\S]*bitcoindHeight[\s\S]*inSync[\s\S]*lag/);
  });
});

describe('useAddLiquidityMutation cache wiring', () => {
  const HOOK = fs.readFileSync(
    path.resolve(__dirname, '../../hooks/useAddLiquidityMutation.ts'),
    'utf-8',
  );

  it('imports useWalletUtxoCache + useSyncStatus', () => {
    expect(HOOK).toMatch(/from\s+['"]@\/hooks\/useWalletUtxoCache['"]/);
    expect(HOOK).toMatch(/useWalletUtxoCache/);
    expect(HOOK).toMatch(/useSyncStatus/);
  });

  it('discoverAlkaneUtxos accepts a prefetched cache and short-circuits', () => {
    expect(HOOK).toMatch(/prefetched\?:\s*WalletUtxoCache/);
    // The fast path reads from prefetched.utxos directly.
    expect(HOOK).toMatch(/prefetched\.utxos/);
    expect(HOOK).toMatch(/no RPC fanout/);
  });

  it('mutationFn gates submission when out of sync (mainnet)', () => {
    expect(HOOK).toMatch(/syncStatus\.inSync/);
    expect(HOOK).toMatch(/Indexer catching up/);
  });
});

describe('WalletStatePrewarmer', () => {
  it('mounts the cache + sync hooks (no JSX, headless prefetch)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../components/WalletStatePrewarmer.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/useWalletUtxoCache\(\)/);
    expect(src).toMatch(/useSyncStatus\(\)/);
    expect(src).toMatch(/return null;/);
  });

  it('is mounted in providers.tsx inside WalletProvider', () => {
    const providers = fs.readFileSync(
      path.resolve(__dirname, '../../app/providers.tsx'),
      'utf-8',
    );
    expect(providers).toMatch(/<WalletStatePrewarmer\s*\/>/);
    // Ordering: WalletProvider opens before the prewarmer mounts.
    const providerIdx = providers.indexOf('<WalletProvider');
    const prewarmerIdx = providers.indexOf('<WalletStatePrewarmer');
    const closeIdx = providers.indexOf('</WalletProvider>');
    expect(providerIdx).toBeLessThan(prewarmerIdx);
    expect(prewarmerIdx).toBeLessThan(closeIdx);
  });
});
