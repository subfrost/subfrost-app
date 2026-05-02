/**
 * SendModal Alkane Send — Source Analysis Tests
 *
 * Verifies the alkane sending flow in SendModal.tsx now routes through the
 * SDK's `alkanesExecuteTyped` path (replacing the deleted manual
 * `buildAlkaneTransferPsbt` implementation).
 *
 * Tests are pure source assertions via fs.readFileSync — no DOM rendering.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------- Source file paths ----------

const SEND_MODAL_PATH = path.resolve(__dirname, '../SendModal.tsx');
const sendModalSource = fs.readFileSync(SEND_MODAL_PATH, 'utf-8');

// ========================================================================
// 1. Imports & module wiring
// ========================================================================

describe('SendModal.tsx — imports and SDK wiring', () => {
  it('imports alkanesExecuteTyped from lib/alkanes/execute', () => {
    expect(sendModalSource).toMatch(
      /import\s+\{\s*alkanesExecuteTyped\s*\}\s+from\s+['"]@\/lib\/alkanes\/execute['"]/,
    );
  });

  it('imports buildTransferProtostone and buildTransferInputRequirements from builders', () => {
    expect(sendModalSource).toMatch(/buildTransferProtostone/);
    expect(sendModalSource).toMatch(/buildTransferInputRequirements/);
  });

  it('imports getProtectOrdinalsAndRunes from utils/walletSettings', () => {
    expect(sendModalSource).toMatch(
      /import\s+\{\s*getProtectOrdinalsAndRunes\s*\}\s+from\s+['"]@\/utils\/walletSettings['"]/,
    );
  });

  it('imports patchInputsOnly + injectRedeemScripts for browser wallet PSBTs', () => {
    expect(sendModalSource).toMatch(
      /import\s+\{[^}]*patchInputsOnly[^}]*\}\s+from\s+['"]@\/lib\/psbt-patching['"]/,
    );
    expect(sendModalSource).toMatch(/injectRedeemScripts/);
  });

  it('imports extractPsbtBase64 to handle SDK PSBT formats', () => {
    expect(sendModalSource).toMatch(
      /import\s+\{[^}]*extractPsbtBase64[^}]*\}\s+from\s+['"]@\/lib\/alkanes\/helpers['"]/,
    );
  });

  it('does NOT import the deleted buildAlkaneTransferPsbt module', () => {
    expect(sendModalSource).not.toMatch(
      /import\s+\{[^}]*buildAlkaneTransferPsbt[^}]*\}\s+from/,
    );
  });
});

// ========================================================================
// 2. Component prop & state shape (preserved from old test suite)
// ========================================================================

describe('SendModal.tsx — high-level behaviour', () => {
  it('accepts initialAlkane prop', () => {
    expect(sendModalSource).toMatch(/initialAlkane\??:\s*AlkaneAsset\s*\|\s*null/);
  });

  it('has alkanes send mode state', () => {
    expect(sendModalSource).toMatch(/useState<['"]btc['"]\s*\|\s*['"]alkanes['"]>/);
  });

  it('switches to alkane mode when initialAlkane is provided', () => {
    expect(sendModalSource).toContain("setSendMode('alkanes')");
    expect(sendModalSource).toContain('setSelectedAlkaneId(initialAlkane.alkaneId)');
  });

  it('handles position, NFT, and token filter tabs', () => {
    expect(sendModalSource).toContain("setAlkaneFilter('positions')");
    expect(sendModalSource).toContain("setAlkaneFilter('nfts')");
    expect(sendModalSource).toContain("setAlkaneFilter('tokens')");
  });

  it('validates the recipient address before sending', () => {
    expect(sendModalSource).toContain('if (!validateAddress(recipientAddress))');
  });

  it('renders the alkane recipient input with bc1p... placeholder', () => {
    expect(sendModalSource).toMatch(/placeholder=["']bc1p\.\.\./);
  });
});

// ========================================================================
// 3. SDK call shape (alkanesExecuteTyped invocation)
// ========================================================================

describe('SendModal.tsx — alkanesExecuteTyped invocation', () => {
  it('calls alkanesExecuteTyped with provider and params object', () => {
    // Both branches (BTC + alkane) hand provider to alkanesExecuteTyped.
    expect(sendModalSource).toMatch(/alkanesExecuteTyped\(\s*provider,\s*\{/);
  });

  it('builds protostones via buildTransferProtostone with alkaneId + amount', () => {
    expect(sendModalSource).toMatch(
      /buildTransferProtostone\(\{[\s\S]*?alkaneId:\s*selectedAlkaneId[\s\S]*?amount:\s*amountBaseUnits\.toString\(\)/,
    );
  });

  it('builds inputRequirements via buildTransferInputRequirements', () => {
    expect(sendModalSource).toMatch(/buildTransferInputRequirements\(\{/);
  });

  it('passes ordinalsStrategy driven by getProtectOrdinalsAndRunes() with txContext default as floor', () => {
    // Browser wallets use the txContext default ('exclude') unless the user
    // has the WalletSettings "Protect ordinals/runes" toggle ON, in which
    // case it escalates to 'preserve'. Keystore stays at the txContext
    // default ('burn') — the toggle is browser-only.
    expect(sendModalSource).toMatch(/getProtectOrdinalsAndRunes\(\)/);
    expect(sendModalSource).toMatch(/protectFromSetting\s*\?\s*['"]preserve['"]\s*:\s*txContext\.defaultOrdinalsStrategy/);
  });

  it('passes txContext into the alkane alkanesExecuteTyped call', () => {
    // After 2026-04-30 the wrapper unpacks `txContext` into options_json;
    // the alkane branch passes the single `txContext` field (and a per-call
    // `ordinalsStrategy` override that escalates to 'preserve' when the
    // WalletSettings toggle is on).
    expect(sendModalSource).toMatch(
      /alkanesExecuteTyped\(\s*provider,\s*\{[\s\S]*?\btxContext\b[\s\S]*?\}\s*\)/,
    );
  });

  it('passes paymentUtxos sourced from getCleanBtcUtxosForWallet', () => {
    expect(sendModalSource).toMatch(/getCleanBtcUtxosForWallet/);
    expect(sendModalSource).toMatch(/paymentUtxos[,]/);
  });

  it('passes autoConfirm = isKeystoreWallet', () => {
    expect(sendModalSource).toMatch(/autoConfirm:\s*isKeystoreWallet/);
  });

  it('passes the network to alkanesExecuteTyped', () => {
    expect(sendModalSource).toMatch(/network[,\s]/);
  });

  it('passes recipient as v1 (toAddresses[1])', () => {
    // Post-2026-04-30 migration: toAddresses[0] is the alkane-change dest
    // sourced from `txContext.alkanesChangeAddress`; toAddresses[1] is the
    // recipient (v1, where the edict transfer lands).
    expect(sendModalSource).toMatch(
      /toAddresses[^=]*=\s*\[\s*txContext\.alkanesChangeAddress,\s*normalizedRecipientAddress\s*\]/,
    );
  });
});

// ========================================================================
// 4. Browser wallet signing path
// ========================================================================

describe('SendModal.tsx — browser wallet signing path', () => {
  it('extracts the readyToSign PSBT from the SDK result', () => {
    expect(sendModalSource).toMatch(/readyToSign\s*=\s*execResult\?\.readyToSign/);
    expect(sendModalSource).toMatch(/extractPsbtBase64\(readyToSign\.psbt\)/);
  });

  it('patches PSBT inputs for browser wallets', () => {
    expect(sendModalSource).toMatch(/patchInputsOnly\(\{/);
  });

  it('signs via signTaprootPsbt (single signing path)', () => {
    expect(sendModalSource).toMatch(/signTaprootPsbt\(psbtBase64\)/);
  });

  it('broadcasts the signed transaction via alkaneProvider', () => {
    expect(sendModalSource).toMatch(/alkaneProvider\.broadcastTransaction\(txHex\)/);
  });

  it('handles already-finalized PSBTs (UniSat autoFinalized: true)', () => {
    expect(sendModalSource).toContain('signedPsbt.extractTransaction()');
    expect(sendModalSource).toContain('signedPsbt.finalizeAllInputs()');
  });
});

// ========================================================================
// 5. Removed legacy concerns — should NOT regress
// ========================================================================

describe('SendModal.tsx — removed legacy concerns', () => {
  it('no longer references collateralWarning state shape', () => {
    expect(sendModalSource).not.toMatch(/setShowCollateralWarning/);
    expect(sendModalSource).not.toMatch(/setCollateralAcknowledged/);
    expect(sendModalSource).not.toMatch(/setPendingPsbtBase64/);
  });

  it('no longer hardcodes ignoreOrdinals / ignoreRunes', () => {
    expect(sendModalSource).not.toMatch(/const\s+ignoreOrdinals\s*=\s*true/);
    expect(sendModalSource).not.toMatch(/const\s+ignoreRunes\s*=\s*true/);
  });

  it('no longer renders proceedWithCollateralWarning button', () => {
    expect(sendModalSource).not.toMatch(/proceedWithCollateralWarning/);
    expect(sendModalSource).not.toMatch(/cancelCollateralWarning/);
  });
});
