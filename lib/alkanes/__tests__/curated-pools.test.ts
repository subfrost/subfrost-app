/**
 * Pin the curated mainnet pool registry.
 *
 * This list is the swap UI's "what pools exist" answer — there is no
 * runtime pool discovery per flex 2026-05-11 ("hardcoded pools in
 * there now"). A regression here either silently hides a real pool
 * (UI shows the user a missing pair) or surfaces a dead pool ID
 * (every swap reverts). Both are hard to spot in passing.
 *
 * Pin:
 *   - structural shape: pool IDs all `block:tx`, tokenId != quoteTokenId,
 *     unique pool IDs (no copy/paste dupes)
 *   - default-quote-token semantics: missing quoteTokenId → frBTC; missing
 *     quoteSymbol/Name → 'frBTC'
 *   - derived sets: CURATED_POOL_IDS and CURATED_TOKEN_IDS in lockstep
 *     with MAINNET_CURATED_POOLS
 *   - backward-compat wrapper: fetchCuratedPoolsListItems is sync-in-
 *     Promise's-clothing and never makes a network call
 */
import { describe, it, expect, vi } from 'vitest';

import {
  MAINNET_CURATED_POOLS,
  CURATED_POOL_IDS,
  CURATED_TOKEN_IDS,
  CURATED_FACTORY_ID,
  getCuratedPoolsListItems,
  fetchCuratedPoolsListItems,
  type CuratedPool,
} from '../curated-pools';

const ID_PATTERN = /^\d+:\d+$/;

describe('MAINNET_CURATED_POOLS — structural invariants', () => {
  it('is a non-empty list', () => {
    expect(MAINNET_CURATED_POOLS.length).toBeGreaterThan(0);
  });

  it('every poolId and tokenId is a valid "block:tx" alkane id', () => {
    for (const p of MAINNET_CURATED_POOLS) {
      expect(p.poolId, `pool ${p.symbol}: poolId`).toMatch(ID_PATTERN);
      expect(p.tokenId, `pool ${p.symbol}: tokenId`).toMatch(ID_PATTERN);
      if (p.quoteTokenId) expect(p.quoteTokenId, `pool ${p.symbol}: quoteTokenId`).toMatch(ID_PATTERN);
      if (p.lpTokenId) expect(p.lpTokenId, `pool ${p.symbol}: lpTokenId`).toMatch(ID_PATTERN);
    }
  });

  it('no entry has tokenId === quoteTokenId (self-swap pool would be nonsensical)', () => {
    for (const p of MAINNET_CURATED_POOLS) {
      const quote = p.quoteTokenId ?? '32:0';
      expect(p.tokenId, `pool ${p.symbol}: tokenId vs quote`).not.toBe(quote);
    }
  });

  it('pool IDs are unique across the registry (catches copy/paste regressions)', () => {
    const ids = MAINNET_CURATED_POOLS.map((p) => p.poolId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has decimals === 8 (current mainnet convention; a different value should be a deliberate change)', () => {
    for (const p of MAINNET_CURATED_POOLS) {
      expect(p.decimals, `pool ${p.symbol}: decimals`).toBe(8);
    }
  });

  it('every required field is populated', () => {
    for (const p of MAINNET_CURATED_POOLS) {
      expect(p.symbol.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
    }
  });
});

describe('getCuratedPoolsListItems', () => {
  it('returns one PoolsListItem per curated pool', () => {
    const items = getCuratedPoolsListItems();
    expect(items).toHaveLength(MAINNET_CURATED_POOLS.length);
  });

  it('id of each item matches the curated poolId', () => {
    const items = getCuratedPoolsListItems();
    const ids = items.map((i) => i.id).sort();
    const expected = MAINNET_CURATED_POOLS.map((p) => p.poolId).sort();
    expect(ids).toEqual(expected);
  });

  it('defaults quote to frBTC when quoteTokenId is unset', () => {
    const items = getCuratedPoolsListItems();
    const frbtcPool = MAINNET_CURATED_POOLS.find((p) => !p.quoteTokenId)!;
    const item = items.find((i) => i.id === frbtcPool.poolId)!;
    expect(item.token1.id).toBe('32:0');
    expect(item.token1.symbol).toBe('frBTC');
    expect(item.token1.name).toBe('frBTC');
  });

  it('respects an explicit quoteTokenId (bUSD case)', () => {
    const items = getCuratedPoolsListItems();
    const busdPool = MAINNET_CURATED_POOLS.find((p) => p.quoteTokenId === '2:56801');
    if (!busdPool) {
      // Pin alone — if all bUSD pools are dropped from the registry the
      // assertion still passes (this is a "structure when present" test).
      return;
    }
    const item = items.find((i) => i.id === busdPool.poolId)!;
    expect(item.token1.id).toBe('2:56801');
    expect(item.token1.symbol).toBe('bUSD');
  });

  it("pairLabel formats as '{tokenSymbol} / {quoteSymbol} LP'", () => {
    const items = getCuratedPoolsListItems();
    for (const item of items) {
      expect(item.pairLabel).toMatch(/^.+ \/ .+ LP$/);
      expect(item.pairLabel).toContain(item.token0.symbol);
      expect(item.pairLabel).toContain(item.token1.symbol);
    }
  });
});

describe('Derived sets', () => {
  it('CURATED_POOL_IDS contains exactly the poolIds from the registry', () => {
    expect(CURATED_POOL_IDS.size).toBe(MAINNET_CURATED_POOLS.length);
    for (const p of MAINNET_CURATED_POOLS) {
      expect(CURATED_POOL_IDS.has(p.poolId)).toBe(true);
    }
  });

  it('CURATED_TOKEN_IDS contains every tokenId from the registry (and may de-dupe pairs)', () => {
    for (const p of MAINNET_CURATED_POOLS) {
      expect(CURATED_TOKEN_IDS.has(p.tokenId)).toBe(true);
    }
    // De-duplication is intentional — DIESEL appears as tokenId for
    // multiple pools (vs frBTC, vs bUSD, vs METHANE) but the *token*
    // is one and the same.
    const uniqueTokens = new Set(MAINNET_CURATED_POOLS.map((p) => p.tokenId));
    expect(CURATED_TOKEN_IDS.size).toBe(uniqueTokens.size);
  });

  it('CURATED_FACTORY_ID is the mainnet AMM factory and never empty', () => {
    expect(CURATED_FACTORY_ID).toMatch(ID_PATTERN);
    // 2026-01-28 mainnet deployment — this is the load-bearing constant
    // every CreateNewPool / Swap / AddLiquidity flow targets.
    expect(CURATED_FACTORY_ID).toBe('4:65522');
  });
});

describe('fetchCuratedPoolsListItems — backward-compat wrapper', () => {
  it('returns the same items as getCuratedPoolsListItems (no actual fetch)', async () => {
    // Wrap fetch so any accidental network call would fail the test
    // loudly with a recognizable error.
    const fetchSpy = vi.fn(async () => {
      throw new Error('fetchCuratedPoolsListItems must not hit the network');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const items = await fetchCuratedPoolsListItems('https://should-be-ignored');
    expect(items).toEqual(getCuratedPoolsListItems());
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('returns a fresh array each call (callers can mutate without contaminating state)', async () => {
    const a = await fetchCuratedPoolsListItems();
    const b = await fetchCuratedPoolsListItems();
    // Same content, different array reference.
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('CuratedPool type — runtime sanity check on field nullability', () => {
  it('allows undefined for optional fields (lpTokenId, quoteTokenId, quoteSymbol, quoteName)', () => {
    // Type-level proof via construction: this compiles iff the optional
    // fields stay optional.
    const minimal: CuratedPool = {
      poolId: '2:99999',
      tokenId: '2:0',
      symbol: 'X',
      name: 'X',
      decimals: 8,
    };
    expect(minimal.lpTokenId).toBeUndefined();
    expect(minimal.quoteTokenId).toBeUndefined();
  });
});
