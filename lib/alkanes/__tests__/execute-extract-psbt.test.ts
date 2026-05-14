/**
 * Regression test for `extractPsbtBase64FromExecuteResult` in
 * `lib/alkanes/execute.ts`.
 *
 * Bug history (2026-05-05): the keystore preview branch in
 * `alkanesExecuteTyped` extracts the unsigned PSBT from the SDK's
 * polymorphic result and hands it to the caller's `previewBeforeBroadcast`
 * callback. The original extractor only recognised plain-string PSBTs.
 *
 * In production, `alkanesExecuteWithStrings` returns the PSBT as a
 * **numeric-key object** (a serialized Uint8Array crossing the WASM
 * bridge) — not a string. The old extractor returned undefined, the
 * central path silently fell back to `return parsed` without signing
 * or broadcasting, and `useAlkaneSendMutation` reported `success: true`
 * with `txid: null`. Users saw the UI claim "broadcast" with an empty
 * explorer link.
 *
 * Reproduced via `__tests__/repro/diesel-send-30000.test.ts` against
 * live mainnet RPC. This unit test captures the same expectation
 * locally so a future regression flips red without needing the live
 * RPC.
 *
 * `extractPsbtBase64FromExecuteResult` is module-private; we test it
 * indirectly by feeding `alkanesExecuteTyped` a fake provider that
 * returns the same Uint8Array shape and observing that the
 * `previewBeforeBroadcast` callback receives a base64 string starting
 * with the PSBT magic.
 */

import { describe, it, expect } from 'vitest';
import { alkanesExecuteTyped } from '../execute';

// PSBT magic header `psbt\xff` followed by 0x00 (separator).
const PSBT_BYTES = Uint8Array.from([0x70, 0x73, 0x62, 0x74, 0xff, 0x00]);
const EXPECTED_BASE64 = Buffer.from(PSBT_BYTES).toString('base64'); // "cHNidP8A"

function makeProviderReturning(psbtShape: any) {
  let signedHex = '';
  return {
    walletIsLoaded: () => true,
    waitForIndexer: async () => {},
    sandshrew_rpc_url: () => 'https://mainnet.subfrost.io/v4/test',
    alkanesExecuteWithStrings: async () => ({
      readyToSign: { psbt: psbtShape },
    }),
    alkanesExecuteFull: async () => {
      throw new Error('full path should not run for keystore preview');
    },
    walletSignPsbtBase64: async (psbt: string) => {
      // Round-trip the input back so the caller can verify it was
      // base64-encoded by the time it reached the signer.
      signedHex = `signed:${psbt}`;
      return signedHex;
    },
    broadcastTransaction: async (hex: string) => `txid:${hex.length}`,
    _getSignedHex: () => signedHex,
  };
}

const baseTxContext = {
  walletType: 'keystore' as const,
  feeSourceAddresses: ['bc1pexample'],
  btcChangeAddress: 'bc1pexample',
  alkanesChangeAddress: 'bc1pexample',
  shouldProtectTaproot: false,
  defaultOrdinalsStrategy: 'burn' as const,
  browserWalletId: undefined,
};

describe('extractPsbtBase64FromExecuteResult (via alkanesExecuteTyped preview path)', () => {
  it('decodes a numeric-key Uint8Array shape (the production case)', async () => {
    // Numeric-keyed object — what `alkanesExecuteWithStrings` actually
    // returns on mainnet today.
    const numericKey: Record<number, number> = {};
    PSBT_BYTES.forEach((b, i) => { numericKey[i] = b; });

    const provider = makeProviderReturning(numericKey);
    let captured: string | undefined;

    const result = await alkanesExecuteTyped(provider as any, {
      txContext: baseTxContext,
      inputRequirements: '2:0:1',
      protostones: '[2:0:1:v1]:v0:v0',
      feeRate: 2,
      autoConfirm: false,
      previewBeforeBroadcast: async (psbtBase64) => {
        captured = psbtBase64;
        return true;
      },
    });

    expect(captured).toBe(EXPECTED_BASE64);
    expect(result.txid).toMatch(/^txid:/);
    expect(provider._getSignedHex()).toBe(`signed:${EXPECTED_BASE64}`);
  });

  it('decodes a real Uint8Array shape', async () => {
    const provider = makeProviderReturning(PSBT_BYTES);
    let captured: string | undefined;

    await alkanesExecuteTyped(provider as any, {
      txContext: baseTxContext,
      inputRequirements: '2:0:1',
      protostones: '[2:0:1:v1]:v0:v0',
      feeRate: 2,
      previewBeforeBroadcast: async (psbtBase64) => {
        captured = psbtBase64;
        return true;
      },
    });

    expect(captured).toBe(EXPECTED_BASE64);
  });

  it('passes through plain base64 strings unchanged', async () => {
    const provider = makeProviderReturning(EXPECTED_BASE64);
    let captured: string | undefined;

    await alkanesExecuteTyped(provider as any, {
      txContext: baseTxContext,
      inputRequirements: '2:0:1',
      protostones: '[2:0:1:v1]:v0:v0',
      feeRate: 2,
      previewBeforeBroadcast: async (psbtBase64) => {
        captured = psbtBase64;
        return true;
      },
    });

    expect(captured).toBe(EXPECTED_BASE64);
  });

  it('throws "Transaction rejected by user" when previewBeforeBroadcast returns false', async () => {
    const provider = makeProviderReturning(PSBT_BYTES);

    await expect(
      alkanesExecuteTyped(provider as any, {
        txContext: baseTxContext,
        inputRequirements: '2:0:1',
        protostones: '[2:0:1:v1]:v0:v0',
        feeRate: 2,
        previewBeforeBroadcast: async () => false,
      }),
    ).rejects.toThrow(/Transaction rejected by user/);
  });
});
