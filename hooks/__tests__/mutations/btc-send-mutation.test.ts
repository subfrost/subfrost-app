/**
 * BTC Send Mutation — Source Analysis Tests
 *
 * Static-source assertions for `hooks/useBtcSendMutation.ts`. Verifies the
 * hook follows the established mutation-hook structure (txContext, single
 * mutationFn dispatching by walletType) and preserves the safety guarantees
 * that motivated the extraction (stale-UTXO error, v1 safety output for
 * keystore, no manual edicts).
 *
 * Run with: pnpm test hooks/__tests__/mutations/btc-send-mutation.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Also import the runtime symbols to confirm they exist on the public surface.
import { BtcSendStaleUtxosError } from '@/hooks/useBtcSendMutation';

const HOOK_PATH = path.resolve(__dirname, '..', '..', 'useBtcSendMutation.ts');
const src = fs.readFileSync(HOOK_PATH, 'utf-8');

describe('useBtcSendMutation — public surface', () => {
  it('exports BtcSendStaleUtxosError as a runtime class', () => {
    const err = new BtcSendStaleUtxosError(['abc:0']);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BtcSendStaleUtxosError');
    expect(err.missingKeys).toEqual(['abc:0']);
  });

  it('exports useBtcSendMutation as a named export', () => {
    expect(src).toMatch(/export function useBtcSendMutation\(\)/);
  });

  it('exports BtcSendData and BtcSendResult types', () => {
    expect(src).toMatch(/export type BtcSendData/);
    expect(src).toMatch(/export type BtcSendResult/);
  });
});

describe('useBtcSendMutation — wallet wiring', () => {
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

describe('useBtcSendMutation — dispatch by walletType', () => {
  it('branches on walletType === "browser" before falling through to keystore', () => {
    expect(src).toMatch(/walletType === ['"]browser['"]/);
  });

  it('routes browser wallets through a manual PSBT builder (sendBrowser)', () => {
    expect(src).toMatch(/async function sendBrowser/);
    expect(src).toMatch(/new bitcoin\.Psbt/);
    expect(src).toMatch(/signTaprootPsbt\(psbtBase64\)/);
  });

  it('routes keystore wallets through alkanesExecuteTyped (sendKeystore)', () => {
    expect(src).toMatch(/async function sendKeystore/);
    expect(src).toMatch(/provider\.alkanesExecuteTyped/);
  });
});

describe('useBtcSendMutation — browser path safety', () => {
  it('tries wallet-native sendBtc capability first, falls back to manual PSBT', () => {
    // UniSat (and future wallets) expose a native sendBitcoin API that picks
    // clean UTXOs and signs / broadcasts internally. The hook short-circuits
    // when the capability returns a txid; the manual PSBT pipeline only runs
    // for wallets without the capability (OYL / Leather / legacy Xverse).
    expect(src).toMatch(/sendBtcViaWallet\(/);
    expect(src).toMatch(/import\s+\{[^}]*sendBtcViaWallet[^}]*\}\s+from\s+['"]@\/lib\/wallet\/walletCapabilities['"]/);
    // The native call must precede the PSBT construction.
    const nativeIdx = src.indexOf('sendBtcViaWallet');
    const psbtIdx = src.indexOf('new bitcoin.Psbt');
    expect(nativeIdx).toBeGreaterThan(0);
    expect(psbtIdx).toBeGreaterThan(nativeIdx);
  });

  it('fetches fresh UTXOs from esplora REST proxy for each caller-supplied fromAddress', () => {
    // The hook iterates `data.fromAddresses` (caller controls scope) instead
    // of `txContext.feeSourceAddresses` (which always lists both addresses
    // for dual-address wallets). This lets dual-address browser wallets
    // restrict BTC sends to the segwit payment address only.
    expect(src).toMatch(/for \(const addr of fromAddresses\)/);
    expect(src).toMatch(/\/api\/esplora\/address\/\$\{addr\}\/utxo\?network=\$\{network\}/);
    expect(src).not.toMatch(/for \(const addr of txContext\.feeSourceAddresses\)/);
  });

  it('throws BtcSendStaleUtxosError when selected UTXOs vanish', () => {
    expect(src).toMatch(/throw new BtcSendStaleUtxosError/);
  });

  it('delegates per-utxo input shaping to addInputDynamic (4-address-type switchboard)', () => {
    // tapInternalKey selection, P2SH-P2WPKH redeemScript building, P2PKH
    // nonWitnessUtxo, and P2WPKH witnessUtxo all live in lib/wallet/inputBuilder.
    // This hook only needs to import + call the helper with the right opts.
    expect(src).toMatch(/from '@\/lib\/wallet\/inputBuilder'/);
    expect(src).toMatch(/addInputDynamic\(/);
    expect(src).toMatch(/taprootPubKeyXOnly:\s*account\?\.taproot\?\.pubKeyXOnly/);
    expect(src).toMatch(/nativeSegwitPubkeyHex:\s*account\?\.nativeSegwit\?\.pubkey/);
  });

  it('uses computeSendFee for change output (handles dust threshold)', () => {
    expect(src).toMatch(/computeSendFee/);
    expect(src).toMatch(/numOutputs === 2/);
  });

  it('handles both finalized and un-finalized PSBT shapes from wallets', () => {
    expect(src).toMatch(/extractTransaction\(\)/);
    expect(src).toMatch(/finalizeAllInputs\(\)/);
  });
});

describe('useBtcSendMutation — keystore path safety', () => {
  it('uses B:N:v0,B:546:v1 input layout to capture alkane edicts safely', () => {
    expect(src).toMatch(/inputRequirements:\s*`B:\$\{amountSats\}:v0,B:546:v1`/);
  });

  it('uses no-op v1:v1 protostone (alkane-aware safety output, not a real call)', () => {
    expect(src).toMatch(/protostones:\s*['"]v1:v1['"]/);
  });

  it('routes alkane change to txContext.alkanesChangeAddress (taproot for keystore)', () => {
    expect(src).toMatch(/txContext\.alkanesChangeAddress/);
  });

  it('passes autoConfirm: true so SDK signs + broadcasts internally', () => {
    expect(src).toMatch(/autoConfirm:\s*true/);
  });

  it('does NOT migrate to walletSend (documented WASM bugs)', () => {
    // walletSend in alkanes-rs/crates/alkanes-web-sys/src/provider.rs ignores
    // change_address, lock_alkanes, and ordinals_strategy — confirmed against
    // origin/develop @ 6be90fb1. Stay on alkanesExecuteTyped until upstream fix.
    expect(src).not.toMatch(/provider\.walletSend\(/);
  });
});

describe('useBtcSendMutation — query invalidation', () => {
  it('invalidates wallet queries on success', () => {
    expect(src).toMatch(/invalidateQueries/);
    expect(src).toMatch(/['"]btc-balance['"]/);
    expect(src).toMatch(/['"]utxos['"]/);
  });
});
