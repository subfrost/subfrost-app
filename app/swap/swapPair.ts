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
