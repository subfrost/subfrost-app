/**
 * Utility to track pending wrap transactions in localStorage
 *
 * When a wrap transaction completes, we know the amount of frBTC that was minted,
 * but the balance sheet API won't show it until the alkanes indexer processes the tx.
 * This utility tracks pending wraps so we can show them in the UI immediately.
 */

export interface PendingWrap {
  txid: string;
  alkaneId: string; // e.g., "32:0" for frBTC
  amountSats: number; // Amount of BTC wrapped in satoshis
  frbtcAmount: string; // Calculated frBTC amount after fees
  timestamp: number; // When the wrap was initiated
  network: string; // Network the wrap was on
}

const STORAGE_KEY = 'subfrost_pending_wraps';
const MAX_PENDING_AGE_MS = 1000 * 60 * 30; // 30 minutes

/**
 * Get all pending wraps from localStorage
 */
export function getPendingWraps(): PendingWrap[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const wraps: PendingWrap[] = JSON.parse(stored);

    // Filter out old wraps (older than 30 minutes)
    const now = Date.now();
    const validWraps = wraps.filter(wrap => (now - wrap.timestamp) < MAX_PENDING_AGE_MS);

    // Update storage if we filtered any out
    if (validWraps.length !== wraps.length) {
      savePendingWraps(validWraps);
    }

    return validWraps;
  } catch (error) {
    console.error('[pendingWraps] Error reading pending wraps:', error);
    return [];
  }
}

/**
 * Add a new pending wrap
 */
export function addPendingWrap(wrap: Omit<PendingWrap, 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  try {
    const wraps = getPendingWraps();

    // Don't add duplicates (same txid)
    if (wraps.some(w => w.txid === wrap.txid)) {
      console.log('[pendingWraps] Wrap already tracked:', wrap.txid);
      return;
    }

    const newWrap: PendingWrap = {
      ...wrap,
      timestamp: Date.now(),
    };

    wraps.push(newWrap);
    savePendingWraps(wraps);

    console.log('[pendingWraps] Added pending wrap:', newWrap);
  } catch (error) {
    console.error('[pendingWraps] Error adding pending wrap:', error);
  }
}

/**
 * Remove a pending wrap by txid
 */
export function removePendingWrap(txid: string): void {
  if (typeof window === 'undefined') return;

  try {
    const wraps = getPendingWraps();
    const filtered = wraps.filter(w => w.txid !== txid);

    if (filtered.length !== wraps.length) {
      savePendingWraps(filtered);
      console.log('[pendingWraps] Removed pending wrap:', txid);
    }
  } catch (error) {
    console.error('[pendingWraps] Error removing pending wrap:', error);
  }
}

/**
 * Get pending wraps for a specific alkane ID and network
 */
export function getPendingWrapsForAlkane(alkaneId: string, network: string): PendingWrap[] {
  return getPendingWraps().filter(
    wrap => wrap.alkaneId === alkaneId && wrap.network === network
  );
}

/**
 * Save pending wraps to localStorage
 */
function savePendingWraps(wraps: PendingWrap[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wraps));
  } catch (error) {
    console.error('[pendingWraps] Error saving pending wraps:', error);
  }
}

/**
 * Calculate frBTC amount after wrap fee
 */
export function calculateFrbtcAmount(amountSats: number, feePerThousand: number): string {
  // frBTC = amount * (1000 - fee) / 1000
  // Use bigint to avoid precision issues
  const amount = BigInt(amountSats);
  const fee = BigInt(Math.floor(feePerThousand));
  const result = (amount * (1000n - fee)) / 1000n;
  return result.toString();
}
