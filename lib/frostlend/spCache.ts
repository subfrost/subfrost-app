/**
 * Local cache for Stability Pool deposits.
 *
 * StabilityPool.Deposit returns a unique depositor_id (sequential u128) and
 * spawns an auth token for the depositor — same model as troves. Cache both
 * so the dashboard can read back compounded deposit + frBTC gains.
 *
 * Key format: `frostlend:sp:{network}:{userAddress}` → JSON.
 */

const KEY_PREFIX = 'frostlend:sp';
const STORAGE_VERSION = 1;

export type CachedSpDeposit = {
  depositorId: string;
  authTokenId: string | null;
  updatedAt: number;
  v: number;
};

function key(network: string, address: string): string {
  return `${KEY_PREFIX}:${network}:${address}`;
}

export function readCachedSpDeposit(network: string, address: string): CachedSpDeposit | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(network, address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSpDeposit;
    if (!parsed || parsed.v !== STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSpDeposit(
  network: string,
  address: string,
  depositorId: string,
  authTokenId: string | null,
): void {
  if (typeof window === 'undefined') return;
  const value: CachedSpDeposit = { depositorId, authTokenId, updatedAt: Date.now(), v: STORAGE_VERSION };
  try {
    window.localStorage.setItem(key(network, address), JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearCachedSpDeposit(network: string, address: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(network, address));
  } catch {
    // ignore
  }
}
