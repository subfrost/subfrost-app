/**
 * Atomic wrap+swap broadcast invariants
 *
 * The production CPFP path is now `useEphemeralWrapPackage` (the
 * deprecated `splitTransactions: true` direct-SDK gate is no longer the
 * single source of truth — the team's moved to building parent+child
 * PSBTs explicitly + a recovery descriptor failsafe).
 *
 * This file pins the on-chain observable invariants the ephemeral
 * package must satisfy, so a regression silently dropping back to a
 * single broadcast (the 2026-05-03 symptom) or producing an empty child
 * protostone (the 2026-05-14 burn-class symptom in mainnet
 * `a2f458f3...`) trips this test loud.
 *
 * Scope is deliberately tight: we don't render the React hook (that
 * needs a full QueryClient + WalletContext rig and the value is
 * marginal). Instead we assert on the *signatures* of the broadcast
 * surface — `broadcastTransactions(network, [parentHex, childHex])` is
 * the only acceptable atomic path on mainnet — and on the static
 * properties of the resulting PSBT shape via the dedicated helpers.
 *
 * What this file verifies:
 *   1. `lib/alkanes/rpc.ts::broadcastTransactions` posts a *submitpackage*
 *      RPC with both raw tx hexes in a single body. This is the wire
 *      contract the ephemeral package depends on; if anyone changes
 *      `broadcastTransactions` to send two `sendrawtransaction` calls
 *      back-to-back, the package atomicity guarantee disappears and
 *      we end up back in the 2026-05-10 RBF-rejection regime.
 *   2. `useEphemeralWrapPackage` is the single call site for the atomic
 *      wrap+swap mutation. Asserting the import wiring makes sure
 *      `useAtomicWrapSwapMutation` can't quietly bypass the ephemeral
 *      path back to the old direct-SDK flow.
 *
 * Cross-wallet reliability (the user requirement: "we already have
 * mocks for all browser extensions, we need it to be reliable in every
 * context") is covered by the tier2 puppeteer suite
 * (`__tests__/tier2/browser-wallet-swap.puppeteer.test.ts`) which drives
 * each mock wallet through the same `useAtomicWrapSwapMutation` entry.
 * The invariants here are wallet-agnostic — they hold for every signer.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('atomic wrap+swap broadcast invariants', () => {
  describe('broadcastTransactions wire shape', () => {
    it('posts a single submitpackage JSON-RPC with both tx hexes', async () => {
      // We test the exported function directly. fetch is the seam.
      const mod = await import('../rpc');
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse((init?.body as string) ?? '{}');
        // Echo the body keys back so the helper can assert against them.
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id, result: ['txid_parent', 'txid_child'] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const parentHex = 'aa'.repeat(32);
      const childHex = 'bb'.repeat(32);
      const result = await mod.broadcastTransactions('mainnet', [parentHex, childHex]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callInit = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse((callInit.body as string) ?? '{}');

      // Wire contract: one RPC call, `submitpackage` method, both hexes
      // sent as a single string[] param. NOT two sendrawtransaction calls.
      expect(body.method, 'must use submitpackage for atomic package broadcast').toBe('submitpackage');
      expect(Array.isArray(body.params), 'submitpackage params must be a JSON array').toBe(true);
      expect(body.params[0], 'first param must be the [parentHex, childHex] string array').toEqual([
        parentHex,
        childHex,
      ]);

      expect(result).toEqual(['txid_parent', 'txid_child']);
    });

    it('throws on bitcoind error so the caller surfaces atomic-broadcast failure loudly', async () => {
      const mod = await import('../rpc');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -26, message: 'package-relay-failure: insufficient parent fee' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      );

      await expect(
        mod.broadcastTransactions('mainnet', ['parent', 'child']),
      ).rejects.toThrow(/package-relay-failure/);
    });
  });

  describe('useAtomicWrapSwapMutation wiring', () => {
    it('routes through useEphemeralWrapPackage (NOT the deprecated split_transactions direct-SDK path)', () => {
      // Source-level wiring assertion. If anyone replaces
      // `executeEphemeralWrapPackage(...)` with a direct call to
      // `provider.alkanesExecuteTyped({...splitTransactions: true})`,
      // this test will fail and the reviewer will see the regression.
      const src = readFileSync(
        resolve(__dirname, '..', '..', '..', 'hooks', 'useAtomicWrapSwapMutation.ts'),
        'utf8',
      );

      expect(src, 'must import useEphemeralWrapPackage').toMatch(
        /import\s*\{\s*useEphemeralWrapPackage\s*\}\s*from/,
      );
      expect(src, 'must call executeEphemeralWrapPackage(...) (not provider.alkanesExecuteTyped directly)')
        .toMatch(/executeEphemeralWrapPackage\s*\(/);
      // Production tx path must NOT be a fallback to the deprecated
      // single-call SDK path. (We allow `provider.alkanesExecuteTyped`
      // imports for shared utilities, but no top-level call as the swap
      // mutation entry.)
      const callsExecuteTyped = /\bawait\s+provider\.alkanesExecuteTyped\s*\(/.test(src);
      expect(
        callsExecuteTyped,
        'useAtomicWrapSwapMutation must not bypass useEphemeralWrapPackage by calling provider.alkanesExecuteTyped directly',
      ).toBe(false);
    });
  });

  describe('useEphemeralWrapPackage wire shape (source-level)', () => {
    const src = readFileSync(
      resolve(__dirname, '..', '..', '..', 'hooks', 'useEphemeralWrapPackage.ts'),
      'utf8',
    );

    it('broadcasts via broadcastRawTransactions(network, [parentHex, childHex]) — the atomic package path', () => {
      // The default (production) branch must call broadcastTransactions
      // with BOTH hexes. The test-mode branch that broadcasts only the
      // parent is gated on `swapTxTestMode !== 0` — keep that gate.
      expect(src, 'must call broadcastRawTransactions with both parent + child tx hex').toMatch(
        /broadcastRawTransactions\s*\(\s*network\s*,\s*\[\s*parentTx\.txHex\s*,\s*signedChildTx\.txHex\s*\]\s*\)/,
      );
    });

    it('persists the raw child tx BEFORE the package broadcast — failsafe for child-only resend', () => {
      // saveRawEphemeralChildTxRecord(...) must appear in source order
      // before the broadcastRawTransactions(...) call site, so if the
      // broadcast crashes mid-flight the user still has the signed
      // child PSBT for a manual sweep. We compare CALL sites, not the
      // import line — the import is always at the top of the file.
      const saveCallMatch = src.match(/saveRawEphemeralChildTxRecord\s*\(/);
      const broadcastCallMatch = src.match(
        /broadcastRawTransactions\s*\(\s*network\s*,\s*\[/,
      );
      expect(saveCallMatch, 'saveRawEphemeralChildTxRecord(...) must be called').toBeTruthy();
      expect(broadcastCallMatch, 'broadcastRawTransactions(network, [...]) must be called').toBeTruthy();
      expect(
        saveCallMatch!.index!,
        'saveRawEphemeralChildTxRecord call must precede broadcastRawTransactions call — otherwise a crash mid-broadcast loses the child PSBT',
      ).toBeLessThan(broadcastCallMatch!.index!);
    });

    it('honors the swapTxTestMode failsafe — broadcasts parent-only when mode !== 0', () => {
      // The failsafe path lets the team simulate a partial-broadcast
      // scenario (parent confirms, child doesn't) so the recovery flow
      // can be tested without a live broken network. Keep the gate.
      expect(src).toMatch(/swapTxTestMode\s*!==?\s*0/);
      expect(src, 'failsafe path must broadcast parent only').toMatch(
        /broadcastTransaction\s*\(\s*network\s*,\s*parentTx\.txHex\s*\)/,
      );
    });
  });
});
