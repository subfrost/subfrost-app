/**
 * SendModal Alkane Send — Source Analysis Tests
 *
 * SendModal now delegates the alkane transfer pipeline to
 * `useAlkaneSendMutation`. The SDK-call shape, PSBT patching, and
 * signing/broadcast assertions live alongside the hook in
 * `hooks/__tests__/mutations/alkane-send-mutation.test.ts`. Tests in this
 * file stay scoped to UI-level concerns: imports/wiring, prop shape, mode
 * switching, recipient validation, and the legacy concerns that should not
 * regress.
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
  it('delegates alkane sending to useAlkaneSendMutation', () => {
    expect(sendModalSource).toMatch(
      /import\s+\{[^}]*useAlkaneSendMutation[^}]*\}\s+from\s+['"]@\/hooks\/useAlkaneSendMutation['"]/,
    );
    expect(sendModalSource).toMatch(/alkaneSendMutation\.mutateAsync\(/);
  });

  it('does NOT import the deleted buildAlkaneTransferPsbt module', () => {
    expect(sendModalSource).not.toMatch(
      /import\s+\{[^}]*buildAlkaneTransferPsbt[^}]*\}\s+from/,
    );
  });

  it('does NOT inline alkanesExecuteTyped (logic moved to hook)', () => {
    expect(sendModalSource).not.toMatch(
      /import\s+\{\s*alkanesExecuteTyped\s*\}\s+from\s+['"]@\/lib\/alkanes\/execute['"]/,
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
// 3. Caller responsibilities that stay in SendModal
// ========================================================================

describe('SendModal.tsx — alkane caller responsibilities', () => {
  it('shows the keystore-only confirmation modal before invoking the hook', () => {
    expect(sendModalSource).toMatch(/walletType === ['"]keystore['"]/);
    expect(sendModalSource).toMatch(/requestConfirmation\(\{[\s\S]*?title:\s*t\(['"]send\.confirmAlkaneSend['"]\)/);
  });

  it('converts amount to base units (decimals-aware) before passing to the hook', () => {
    expect(sendModalSource).toMatch(/Math\.pow\(10,\s*decimals\)/);
    expect(sendModalSource).toMatch(/amountBaseUnits:\s*amountBaseUnits\.toString\(\)/);
  });

  it('passes the normalized recipient + selected alkaneId to the hook', () => {
    expect(sendModalSource).toMatch(/recipientAddress:\s*normalizedRecipientAddress/);
    expect(sendModalSource).toMatch(/alkaneId:\s*selectedAlkaneId/);
  });
});

// ========================================================================
// 4. Removed legacy concerns — should NOT regress
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
