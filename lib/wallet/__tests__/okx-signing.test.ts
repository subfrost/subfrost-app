/**
 * OKX Signing Helper Tests
 *
 * Asserts that `signWithOkx` calls the SDK adapter with `auto_finalized: true`
 * and reports `isFinalized: true` in the returned `SigningResult`.
 *
 * Why this test matters: OKX is taproot-only single-address (mirrors UniSat).
 * On 2026-04-28 a regression in `useUnwrapMutation` traced to UniSat going
 * through the generic SDK-adapter fall-through with `auto_finalized: false`,
 * which left taproot inputs in a state bitcoinjs-lib could not finalize.
 * Routing UniSat through `signWithUnisat` with `autoFinalized: true` fixed it.
 *
 * OKX has the same shape — single-address, taproot-only, `signPsbt` mirrors
 * UniSat — and the SDK's `OkxAdapter` defaults `autoFinalized: true`. We pass
 * `auto_finalized: true` proactively to (a) match the SDK adapter's own
 * default and (b) prevent re-introducing the UniSat regression on OKX. This
 * test guards the contract.
 */

import { describe, it, expect, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

import { signWithOkx } from '../browserWalletSigning';

try {
  bitcoin.initEccLib(ecc);
} catch {
  /* already initialized */
}

const REGTEST = bitcoin.networks.regtest;

/** Build a minimal PSBT — content is irrelevant; we only inspect call args. */
function makeAnyPsbt(): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: REGTEST });
  // 32 zero-bytes scriptPubKey wrapped as P2WSH-style placeholder
  const fakeScript = new Uint8Array(34);
  fakeScript[0] = 0x51; // OP_1
  fakeScript[1] = 0x20; // push 32
  psbt.addInput({
    hash: 'a'.repeat(64),
    index: 0,
    witnessUtxo: { script: fakeScript, value: BigInt(100_000) },
  } as any);
  return psbt;
}

describe('signWithOkx', () => {
  it('calls walletAdapter.signPsbt with auto_finalized: true', async () => {
    const fakeSignedHex =
      '70736274ff01000a01000000000000000000000000';
    const adapter = {
      signPsbt: vi.fn(async (_hex: string, _opts: any) => fakeSignedHex),
    };

    const psbt = makeAnyPsbt();
    await signWithOkx(psbt, adapter as any);

    expect(adapter.signPsbt).toHaveBeenCalledTimes(1);
    const [psbtArg, optsArg] = adapter.signPsbt.mock.calls[0]!;
    expect(typeof psbtArg).toBe('string');
    expect(optsArg).toEqual({ auto_finalized: true });
  });

  it('returns SigningResult with isFinalized: true and walletId: "okx"', async () => {
    const fakeSignedHex =
      '70736274ff01000a01000000000000000000000000';
    const adapter = {
      signPsbt: vi.fn(async () => fakeSignedHex),
    };

    const psbt = makeAnyPsbt();
    const result = await signWithOkx(psbt, adapter as any);

    expect(result.isFinalized).toBe(true);
    expect(result.walletId).toBe('okx');
    // signedPsbtBase64 is whatever the adapter returned, hex → base64 round-tripped.
    const expectedBase64 = Buffer.from(fakeSignedHex, 'hex').toString('base64');
    expect(result.signedPsbtBase64).toBe(expectedBase64);
  });

  it('passes the PSBT as hex to the adapter', async () => {
    const adapter = {
      signPsbt: vi.fn(async (hex: string) => hex),
    };

    const psbt = makeAnyPsbt();
    await signWithOkx(psbt, adapter as any);

    const [psbtArg] = adapter.signPsbt.mock.calls[0]!;
    expect(psbtArg).toBe(psbt.toHex());
  });

  it('propagates adapter errors', async () => {
    const adapter = {
      signPsbt: vi.fn(async () => {
        throw new Error('user rejected request');
      }),
    };

    const psbt = makeAnyPsbt();
    await expect(signWithOkx(psbt, adapter as any)).rejects.toThrow(
      /user rejected request/,
    );
  });
});
