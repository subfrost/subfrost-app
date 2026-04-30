import type { TokenMeta } from './types';

export const SWAP_PAIR_KEY = 'subfrost_swap_pair';

export function saveSwapPair(from: TokenMeta, to: TokenMeta) {
  try {
    localStorage.setItem(SWAP_PAIR_KEY, JSON.stringify({ from, to }));
  } catch { /* ignore quota/private mode errors */ }
}

export function loadSwapPair(): { from: TokenMeta; to: TokenMeta } | null {
  try {
    const raw = localStorage.getItem(SWAP_PAIR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.from?.id && parsed?.to?.id) return parsed;
  } catch { /* ignore */ }
  return null;
}

export function clearSwapPair() {
  try {
    localStorage.removeItem(SWAP_PAIR_KEY);
  } catch { /* ignore */ }
}

// One-shot read: returns the saved pair (if any) and clears it.
// Used by the swap page so HomeMarketsButton can hand off a pair
// for a single navigation, without persisting selections forever.
export function consumeSwapPair(): { from: TokenMeta; to: TokenMeta } | null {
  const pair = loadSwapPair();
  if (pair) clearSwapPair();
  return pair;
}
