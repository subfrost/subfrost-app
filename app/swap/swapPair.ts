import type { TokenMeta } from './types';

export const SWAP_PAIR_KEY = 'subfrost_swap_pair';

// One-shot handoff for explicit cross-page navigation into /swap.
// `swap` pre-fills from/to tokens; `removeLiquidity` opens the liquidity
// panel in remove mode with the given LP position pre-selected.
export type SwapIntent =
  | { kind: 'swap'; from: TokenMeta; to: TokenMeta }
  | { kind: 'removeLiquidity'; positionId: string };

function writeIntent(intent: SwapIntent) {
  try {
    localStorage.setItem(SWAP_PAIR_KEY, JSON.stringify(intent));
  } catch { /* ignore quota/private mode errors */ }
}

function readIntent(): SwapIntent | null {
  try {
    const raw = localStorage.getItem(SWAP_PAIR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kind === 'swap' && parsed?.from?.id && parsed?.to?.id) return parsed as SwapIntent;
    if (parsed?.kind === 'removeLiquidity' && typeof parsed?.positionId === 'string') return parsed as SwapIntent;
    // Legacy schema (pre-intent): { from, to } — treat as swap.
    if (parsed?.from?.id && parsed?.to?.id) return { kind: 'swap', from: parsed.from, to: parsed.to };
  } catch { /* ignore */ }
  return null;
}

function clearStorage() {
  try {
    localStorage.removeItem(SWAP_PAIR_KEY);
  } catch { /* ignore */ }
}

export function saveSwapPair(from: TokenMeta, to: TokenMeta) {
  writeIntent({ kind: 'swap', from, to });
}

export function saveSwapIntent(intent: SwapIntent) {
  writeIntent(intent);
}

export function loadSwapPair(): { from: TokenMeta; to: TokenMeta } | null {
  const intent = readIntent();
  return intent?.kind === 'swap' ? { from: intent.from, to: intent.to } : null;
}

export function clearSwapPair() {
  clearStorage();
}

// One-shot read: returns the saved pair (if any) and clears it.
// Used by the swap page so HomeMarketsButton can hand off a pair
// for a single navigation, without persisting selections forever.
export function consumeSwapPair(): { from: TokenMeta; to: TokenMeta } | null {
  const pair = loadSwapPair();
  if (pair) clearStorage();
  return pair;
}

// One-shot read of the full intent (swap or removeLiquidity), then clear.
export function consumeSwapIntent(): SwapIntent | null {
  const intent = readIntent();
  if (intent) clearStorage();
  return intent;
}
