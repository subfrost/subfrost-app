/**
 * Alkane Send Mutation — Source Analysis Tests
 *
 * Mirrors the structure of `btc-send-mutation.test.ts`. Verifies the alkane
 * transfer hook (`useAlkaneSendMutation`) preserves the safety guarantees
 * and SDK-call shape that motivated the extraction from SendModal.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HOOK_PATH = path.resolve(__dirname, '..', '..', 'useAlkaneSendMutation.ts');
const src = fs.readFileSync(HOOK_PATH, 'utf-8');

describe('useAlkaneSendMutation — public surface', () => {
  it('exports useAlkaneSendMutation as a named export', () => {
    expect(src).toMatch(/export function useAlkaneSendMutation\(\)/);
  });

  it('exports AlkaneSendData and AlkaneSendResult types', () => {
    expect(src).toMatch(/export type AlkaneSendData/);
    expect(src).toMatch(/export type AlkaneSendResult/);
  });
});

describe('useAlkaneSendMutation — wallet wiring', () => {
  it('destructures txContext from useWallet (per address-handling rule)', () => {
    expect(src).toMatch(/useWallet\(\)/);
    expect(src).toMatch(/\btxContext\b/);
  });

  it('uses useSandshrewProvider (matches established mutation-hook pattern)', () => {
    expect(src).toMatch(/useSandshrewProvider/);
  });

  it('guards on !txContext before any send work', () => {
    expect(src).toMatch(/if \(!txContext\)/);
  });

  it('guards on !provider.walletIsLoaded()', () => {
    expect(src).toMatch(/walletIsLoaded\(\)/);
  });
});

describe('useAlkaneSendMutation — SDK call shape', () => {
  it('builds the transfer protostone via buildTransferProtostone', () => {
    expect(src).toMatch(/buildTransferProtostone\(\{/);
    expect(src).toMatch(/alkaneId:\s*data\.alkaneId/);
    expect(src).toMatch(/amount:\s*data\.amountBaseUnits/);
  });

  it('builds inputRequirements via buildTransferInputRequirements', () => {
    expect(src).toMatch(/buildTransferInputRequirements\(\{/);
  });

  it('routes through provider.alkanesExecuteTyped with txContext', () => {
    expect(src).toMatch(/provider\.alkanesExecuteTyped\(\{[\s\S]*?\btxContext\b/);
  });

  it('sets toAddresses = [alkanesChangeAddress, recipient] (v0 change, v1 recipient)', () => {
    expect(src).toMatch(/toAddresses[^=]*=\s*\[txContext\.alkanesChangeAddress,\s*data\.recipientAddress\]/);
  });

  it('passes autoConfirm = isKeystoreWallet (SDK signs+broadcasts internally for keystore)', () => {
    expect(src).toMatch(/autoConfirm:\s*isKeystoreWallet/);
  });
});

describe('useAlkaneSendMutation — ordinals / paymentUtxos', () => {
  it('delegates ordinals / paymentUtxos to alkanesExecuteTyped auto-defaults', () => {
    // Browser → 'preserve' (split-tx + alkane-aware routing) and UniSat
    // clean-utxos for fees are auto-applied by alkanesExecuteTyped from
    // txContext.walletType. Hook stays thin — no manual fetching here.
    expect(src).not.toMatch(/getProtectOrdinalsAndRunes/);
    expect(src).not.toMatch(/getCleanBtcUtxosForWallet/);
    expect(src).not.toMatch(/ordinalsStrategy:/);
    expect(src).not.toMatch(/paymentUtxos:/);
  });
});

describe('useAlkaneSendMutation — browser PSBT pipeline', () => {
  it('extracts SDK-returned PSBT via extractPsbtBase64', () => {
    expect(src).toMatch(/extractPsbtBase64\(readyToSign\.psbt\)/);
  });

  it('patches inputs via patchInputsOnly (handles both witnessUtxo + redeemScript)', () => {
    expect(src).toMatch(/patchInputsOnly\(\{/);
  });

  it('signs via signTaprootPsbt (dispatches to per-wallet adapter)', () => {
    expect(src).toMatch(/signTaprootPsbt\(psbtBase64\)/);
  });

  it('handles both finalized and un-finalized PSBT shapes from wallets', () => {
    expect(src).toMatch(/extractTransaction\(\)/);
    expect(src).toMatch(/finalizeAllInputs\(\)/);
  });

  it('broadcasts via provider.broadcastTransaction', () => {
    expect(src).toMatch(/provider\.broadcastTransaction\(tx\.toHex\(\)\)/);
  });
});

describe('useAlkaneSendMutation — query invalidation', () => {
  it('invalidates wallet + alkane-balance queries on success', () => {
    expect(src).toMatch(/invalidateQueries/);
    expect(src).toMatch(/['"]alkane-balances['"]/);
    expect(src).toMatch(/['"]btc-balance['"]/);
  });
});
