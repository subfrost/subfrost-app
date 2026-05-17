/**
 * Network detection — single source of truth for "what network is this
 * frontend tab on right now?".
 *
 * The frontend can only operate on two networks: mainnet (the live
 * protocol) and devnet (in-browser stack). Stale legacy values like
 * 'subfrost-regtest' / 'signet' / 'regtest-local' / 'qubitcoin-regtest'
 * are no longer accepted from storage — they would silently route to a
 * backend that's been retired (verified 2026-05-14: regtest.subfrost.io
 * returns 502 across all REST endpoints, breaking pool data + history
 * data on first paint when localStorage carried 'subfrost-regtest'
 * from a prior deployment).
 *
 * Devnet routes through sessionStorage (tab-scoped) so the choice
 * doesn't leak across tabs. Mainnet routes through localStorage so the
 * choice survives across sessions.
 *
 * Pure module — no React, no WASM, no side effects beyond clearing
 * stale storage entries. Importable from tests without pulling the
 * heavy alkanes-ts-sdk init.
 */
import type { Network } from '@/utils/constants';
import { DEMO_MODE_ENABLED } from '@/utils/demoMode';

export const NETWORK_STORAGE_KEY = 'subfrost_selected_network';

const ALLOWED_NETWORKS: ReadonlySet<Network> = new Set(['mainnet', 'devnet']);

export function normalizeNetworkForDemo(network: Network): Network {
  return DEMO_MODE_ENABLED && network === 'devnet' ? 'mainnet' : network;
}

export function detectNetwork(): Network {
  if (typeof window === 'undefined') return 'mainnet';

  // Devnet is tab-scoped (sessionStorage) so it doesn't leak across tabs.
  if (!DEMO_MODE_ENABLED && sessionStorage.getItem(NETWORK_STORAGE_KEY) === 'devnet') {
    return 'devnet';
  }

  // Restore network selection from localStorage. Only 'mainnet' is
  // accepted here — devnet routes through sessionStorage above. Any
  // legacy value (subfrost-regtest, signet, …) is treated as missing
  // AND stripped from localStorage so the next load is clean.
  const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (stored === 'mainnet') {
    return normalizeNetworkForDemo('mainnet');
  }
  if (stored && !ALLOWED_NETWORKS.has(stored as Network)) {
    localStorage.removeItem(NETWORK_STORAGE_KEY);
  }

  // Optional explicit env override (CI, local dev). Anything other than
  // an allowed value is ignored.
  const envNet = process.env.NEXT_PUBLIC_NETWORK as Network | undefined;
  if (envNet && ALLOWED_NETWORKS.has(envNet)) {
    return normalizeNetworkForDemo(envNet);
  }

  return 'mainnet';
}
