/**
 * Local cache for trove IDs.
 *
 * Frostlend troves are identified by a sequential u128 (`/next_trove_id` in TroveManager).
 * The OpenTrove tx returns the assigned trove_id in its response data, but we have no
 * way to recover this value after the fact other than by:
 *   1. Scanning every alkanes_protorunesbyaddress outpoint for block=2 auth tokens
 *      and reverse-looking them up via TroveManager.GetTroveAuthToken (slow), OR
 *   2. Caching the trove_id locally when OpenTrove succeeds.
 *
 * For the devnet-pilot flow, (2) is sufficient — the user opens a trove from the UI,
 * the mutation hook stores trove_id, and the dashboard reads it back. If localStorage
 * is wiped, the user can recover the trove_id by checking the auth token's block=2
 * tx field on their wallet manually (see `findTroveByScanningAuthTokens` below — TODO).
 *
 * Key format: `frostlend:trove:{network}:{userAddress}` → JSON {troveId, authTokenId}
 */

const KEY_PREFIX = 'frostlend:trove';
const STORAGE_VERSION = 1;

export type CachedTrove = {
  /** u128 trove ID as decimal string. */
  troveId: string;
  /** "block:tx" of the auth token (block always 2 for spawn_auth_token). */
  authTokenId: string | null;
  /** When the cache was last written (ms epoch). */
  updatedAt: number;
  /** Schema version for future migrations. */
  v: number;
};

function key(network: string, address: string): string {
  return `${KEY_PREFIX}:${network}:${address}`;
}

export function readCachedTrove(network: string, address: string): CachedTrove | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(network, address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTrove;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedTrove(
  network: string,
  address: string,
  troveId: string,
  authTokenId: string | null,
): void {
  if (typeof window === 'undefined') return;
  const value: CachedTrove = {
    troveId,
    authTokenId,
    updatedAt: Date.now(),
    v: STORAGE_VERSION,
  };
  try {
    window.localStorage.setItem(key(network, address), JSON.stringify(value));
  } catch {
    // localStorage full or disabled — silently no-op
  }
}

export function clearCachedTrove(network: string, address: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(network, address));
  } catch {
    // ignore
  }
}
