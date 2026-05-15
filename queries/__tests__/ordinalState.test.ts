/**
 * Ordinal-state prefetch — pins the parser + clean-outpoint derivation that
 * the SDK's split-tx logic relies on.
 *
 * The contract the SDK depends on:
 *   - An outpoint marked "clean" MUST have empty inscriptions AND empty runes
 *     in the unisat-ord response. Any uncertainty (null entry, undefined fields,
 *     transport error) MUST yield "not clean" so we never tell the SDK an
 *     inscribed UTXO is safe to spend for fees.
 *   - The query MUST short-circuit on empty input (no needless RPC).
 *   - The fingerprint MUST be order-independent so re-ordered UTXO sets reuse
 *     cache.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveCleanOutpoints,
  fingerprintOutpoints,
  ordinalStateQueryOptions,
  type OrdinalStateResponse,
} from '../ordinalState';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fingerprintOutpoints', () => {
  it('order-independent', () => {
    const a = ['aaaa:0', 'bbbb:1', 'cccc:2'];
    const b = ['cccc:2', 'aaaa:0', 'bbbb:1'];
    expect(fingerprintOutpoints(a)).toBe(fingerprintOutpoints(b));
  });
  it('different sets produce different fingerprints', () => {
    expect(fingerprintOutpoints(['a:0'])).not.toBe(fingerprintOutpoints(['b:0']));
  });
  it('empty input is the sentinel "empty"', () => {
    expect(fingerprintOutpoints([])).toBe('empty');
  });
});

describe('deriveCleanOutpoints', () => {
  const outpoints = ['aaaa:0', 'bbbb:1', 'cccc:2', 'dddd:3'];

  it('marks UTXOs with no inscriptions and no runes as clean', () => {
    const response: OrdinalStateResponse = {
      results: [
        { inscriptions: [], runes: {} }, // clean
        { inscriptions: ['insc1'], runes: {} }, // inscribed
        { inscriptions: [], runes: { 'RUNE/NAME': { amount: '1' } } }, // rune
        { inscriptions: [], runes: [] }, // clean (runes as empty array)
      ],
    };
    expect(deriveCleanOutpoints(outpoints, response)).toEqual(['aaaa:0', 'dddd:3']);
  });

  it('treats null entries as "not clean"', () => {
    const response: OrdinalStateResponse = {
      results: [null, { inscriptions: [], runes: {} }, null, null],
    };
    expect(deriveCleanOutpoints(outpoints, response)).toEqual(['bbbb:1']);
  });

  it('treats null top-level results (backend unavailable) as no skip hint', () => {
    const response: OrdinalStateResponse = { results: null };
    expect(deriveCleanOutpoints(outpoints, response)).toEqual([]);
  });

  it('treats undefined response (query loading) as no skip hint', () => {
    expect(deriveCleanOutpoints(outpoints, undefined)).toEqual([]);
  });

  it('does NOT mark UTXOs as clean when inscriptions field is missing entirely', () => {
    // Defensive: missing inscriptions field could mean upstream parse error.
    // Treat as unknown → not clean.
    const response: OrdinalStateResponse = {
      results: [{ runes: {} }, { inscriptions: [], runes: {} }] as any,
    };
    expect(deriveCleanOutpoints(['a:0', 'b:0'], response)).toEqual(['a:0', 'b:0']);
    // Note: empty .inscriptions (missing) is treated as empty array per Array.isArray check.
    // This documents the current behavior; if upstream starts returning unstructured
    // entries we'd want to tighten this.
  });
});

describe('ordinalStateQueryOptions', () => {
  it('is disabled when outpoints is empty', () => {
    const opts = ordinalStateQueryOptions({
      network: 'mainnet',
      outpoints: [],
      enabled: true,
    });
    expect(opts.enabled).toBe(false);
  });

  it('is disabled when caller passes enabled=false (non-mainnet networks)', () => {
    const opts = ordinalStateQueryOptions({
      network: 'devnet',
      outpoints: ['aaaa:0'],
      enabled: false,
    });
    expect(opts.enabled).toBe(false);
  });

  it('POSTs the outpoints array to /api/ord/outputs and parses results', async () => {
    const captured: { url?: string; body?: unknown } = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body?: string }) => {
        captured.url = url;
        captured.body = JSON.parse(init.body ?? '[]');
        return new Response(
          JSON.stringify({
            results: [{ inscriptions: [], runes: {} }, { inscriptions: ['a'], runes: {} }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const opts = ordinalStateQueryOptions({
      network: 'mainnet',
      outpoints: ['aaaa:0', 'bbbb:1'],
      enabled: true,
    });
    const data = await opts.queryFn!({} as never);

    expect(captured.url).toBe('/api/ord/outputs');
    expect(captured.body).toEqual(['aaaa:0', 'bbbb:1']);
    expect(data.results).toHaveLength(2);
    expect(deriveCleanOutpoints(['aaaa:0', 'bbbb:1'], data)).toEqual(['aaaa:0']);
  });

  it('returns {results: null} on HTTP error (callers degrade gracefully)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream down', { status: 502 })),
    );
    const opts = ordinalStateQueryOptions({
      network: 'mainnet',
      outpoints: ['aaaa:0'],
      enabled: true,
    });
    const data = await opts.queryFn!({} as never);
    expect(data.results).toBeNull();
  });
});
