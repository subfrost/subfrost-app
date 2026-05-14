/**
 * Reproduces the runtime bug behind task #32.
 *
 * Symptom (as observed during the camoufoxd mainnet run, 2026-05-03):
 *   - `useAtomicWrapSwapMutation` correctly defaults
 *     `splitTransactions = true` on mainnet.
 *   - That flag flows into `useSwapMutation.mutateAsync` and is forwarded
 *     to the `provider.alkanesExecuteTyped({...})` call as
 *     `splitTransactions: (swapData as any).splitTransactions === true`.
 *   - But only ONE `sendrawtransaction` is observed at runtime, never
 *     the parent+child CPFP pair the split path produces. The Rust
 *     gate in `execute.rs::execute_full` never fires.
 *
 * Source-only assertions (split-tx-mode.test.ts) pass because the call
 * site literally has the `splitTransactions:` field. They don't catch
 * the actual bug, which is one layer down: `lib/alkanes/execute.ts ::
 * alkanesExecuteTyped` builds the `options` JSON it forwards to the
 * WASM provider's `alkanesExecuteFull`, and that builder never reads
 * `params.splitTransactions`. The flag reaches the wrapper, gets
 * dropped on the floor, and the WASM provider sees `options` without
 * `split_transactions`. The Rust side defaults the field to `false`
 * and the gate is skipped — exactly the runtime symptom.
 *
 * This test mocks the WASM provider, calls `alkanesExecuteTyped`
 * with a wrap+execute protostone pair and `splitTransactions: true`,
 * and asserts that the options JSON forwarded to `alkanesExecuteFull`
 * contains `split_transactions: true`.
 *
 * Run with:
 *   pnpm test lib/alkanes/__tests__/executeTyped-splitTransactions.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { alkanesExecuteTyped } from '@/lib/alkanes/execute';

interface CapturedCall {
  toAddressesJson: string;
  inputRequirements: string;
  protostones: string;
  feeRate: number | null;
  envelopeHex: string | null;
  optionsJson: string;
  options: Record<string, any>;
}

function makeMockProvider(captured: { call?: CapturedCall }) {
  const provider: any = {
    alkanesExecuteFull: vi.fn(
      async (
        toAddressesJson: string,
        inputRequirements: string,
        protostones: string,
        feeRate: number | null,
        envelopeHex: string | null,
        optionsJson: string,
      ) => {
        captured.call = {
          toAddressesJson,
          inputRequirements,
          protostones,
          feeRate,
          envelopeHex,
          optionsJson,
          options: JSON.parse(optionsJson),
        };
        return JSON.stringify({ txid: 'fake-txid' });
      },
    ),
    sandshrew_rpc_url: () => 'https://mainnet.subfrost.io/v4/subfrost',
  };
  return provider;
}

const wrapAndSwapProtostones =
  '[32,0,77]:v1:v1,[4,65522,13,2,2,0,32,0,50000000,7069,947760]:v0:v0';

const baseParams = {
  protostones: wrapAndSwapProtostones,
  inputRequirements: 'B:600000:v0',
  toAddresses: ['bc1psigner', 'bc1puser'],
  feeRate: 1,
  // keystore-style: autoConfirm=true so we go through alkanesExecuteFull.
  autoConfirm: true,
  network: 'mainnet',
  fromAddresses: ['bc1puser'],
  changeAddress: 'bc1puser',
  alkanesChangeAddress: 'bc1puser',
} as const;

describe('alkanesExecuteTyped: splitTransactions forwarding', () => {
  let captured: { call?: CapturedCall };
  let provider: any;

  beforeEach(() => {
    captured = {};
    provider = makeMockProvider(captured);
  });

  it('forwards splitTransactions=true into options.split_transactions', async () => {
    await alkanesExecuteTyped(provider, {
      ...baseParams,
      splitTransactions: true,
    } as any);

    expect(provider.alkanesExecuteFull).toHaveBeenCalledTimes(1);
    expect(captured.call).toBeDefined();
    expect(captured.call!.options.split_transactions).toBe(true);
  });

  it('omits split_transactions when caller did not pass the flag', async () => {
    // No splitTransactions on params — wrapper must NOT inject `true`.
    await alkanesExecuteTyped(provider, baseParams as any);

    expect(captured.call).toBeDefined();
    expect(captured.call!.options.split_transactions).toBeUndefined();
  });

  it('forwards splitTransactions=false explicitly when caller asks for it', async () => {
    await alkanesExecuteTyped(provider, {
      ...baseParams,
      splitTransactions: false,
    } as any);

    expect(captured.call).toBeDefined();
    expect(captured.call!.options.split_transactions).toBe(false);
  });
});
