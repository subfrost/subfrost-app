/**
 * SendModal Alkane Send — Source Analysis & Module Tests
 *
 * Tests the alkane sending functionality in SendModal.tsx:
 * - Source code analysis (structural assertions via fs.readFileSync)
 * - buildAlkaneTransferPsbt module exports and function signature
 * - CollateralWarning type export verification
 *
 * Does NOT test the React component (no DOM rendering needed).
 * Uses vitest + fs/path for source analysis.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------- Source file paths ----------

const SEND_MODAL_PATH = path.resolve(__dirname, '../SendModal.tsx');
const BUILD_ALKANE_PATH = path.resolve(__dirname, '../../../../lib/alkanes/buildAlkaneTransferPsbt.ts');

// Read source files once for all tests
const sendModalSource = fs.readFileSync(SEND_MODAL_PATH, 'utf-8');
const buildAlkanePsbtSource = fs.readFileSync(BUILD_ALKANE_PATH, 'utf-8');

// ========================================================================
// 1. Source Analysis Tests — SendModal.tsx
// ========================================================================

describe('SendModal.tsx — source analysis', () => {
  describe('imports and module wiring', () => {
    it('imports buildAlkaneTransferPsbt from lib/alkanes', () => {
      expect(sendModalSource).toMatch(
        /import\s+\{[^}]*buildAlkaneTransferPsbt[^}]*\}\s+from\s+['"]@\/lib\/alkanes\/buildAlkaneTransferPsbt['"]/
      );
    });

    it('imports bitcoinjs-lib for PSBT operations', () => {
      expect(sendModalSource).toMatch(/import\s+\*\s+as\s+bitcoin\s+from\s+['"]bitcoinjs-lib['"]/);
    });

    it('imports injectRedeemScripts for P2SH wallet support', () => {
      expect(sendModalSource).toMatch(/import\s+\{[^}]*injectRedeemScripts[^}]*\}/);
    });
  });

  describe('alkane tab/mode', () => {
    it('accepts initialAlkane prop in the component interface', () => {
      expect(sendModalSource).toMatch(/initialAlkane\??:\s*AlkaneAsset\s*\|\s*null/);
    });

    it('destructures initialAlkane from props', () => {
      expect(sendModalSource).toMatch(/\{\s*isOpen.*initialAlkane.*onSuccess\s*\}/);
    });

    it('has alkanes send mode state', () => {
      expect(sendModalSource).toMatch(/useState<['"]btc['"]\s*\|\s*['"]alkanes['"]>/);
    });

    it('sets sendMode to alkanes when initialAlkane is provided', () => {
      expect(sendModalSource).toContain("setSendMode('alkanes')");
      expect(sendModalSource).toContain('setSelectedAlkaneId(initialAlkane.alkaneId)');
    });

    it('handles position, NFT, and token filter tabs for alkane selection', () => {
      expect(sendModalSource).toContain("setAlkaneFilter('positions')");
      expect(sendModalSource).toContain("setAlkaneFilter('nfts')");
      expect(sendModalSource).toContain("setAlkaneFilter('tokens')");
    });
  });

  describe('collateral warning state management', () => {
    it('declares collateralWarning state with correct shape', () => {
      expect(sendModalSource).toMatch(/const\s+\[collateralWarning,\s*setCollateralWarning\]\s*=\s*useState/);
    });

    it('collateralWarning state includes hasInscriptions field', () => {
      // The useState type annotation should include hasInscriptions
      expect(sendModalSource).toMatch(/collateralWarning.*useState<\{[^}]*hasInscriptions:\s*boolean/s);
    });

    it('collateralWarning state includes hasRunes field', () => {
      expect(sendModalSource).toMatch(/collateralWarning.*useState<\{[^}]*hasRunes:\s*boolean/s);
    });

    it('collateralWarning state includes unverifiedInscriptionRunes field', () => {
      expect(sendModalSource).toMatch(/unverifiedInscriptionRunes\??\s*:\s*boolean/);
    });

    it('declares showCollateralWarning state', () => {
      expect(sendModalSource).toMatch(/const\s+\[showCollateralWarning,\s*setShowCollateralWarning\]\s*=\s*useState/);
    });

    it('declares collateralAcknowledged state', () => {
      expect(sendModalSource).toMatch(/const\s+\[collateralAcknowledged,\s*setCollateralAcknowledged\]\s*=\s*useState/);
    });

    it('declares pendingPsbtBase64 state for storing PSBT while awaiting acknowledgment', () => {
      expect(sendModalSource).toMatch(/const\s+\[pendingPsbtBase64,\s*setPendingPsbtBase64\]\s*=\s*useState/);
    });
  });

  describe('collateral warning UI rendering paths', () => {
    it('renders collateral warning overlay when showCollateralWarning is true', () => {
      expect(sendModalSource).toMatch(/showCollateralWarning\s*&&\s*collateralWarning/);
    });

    it('handles unverifiedInscriptionRunes in warning display', () => {
      expect(sendModalSource).toMatch(/collateralWarning\.unverifiedInscriptionRunes/);
    });

    it('displays hasInscriptions warning text', () => {
      expect(sendModalSource).toMatch(/collateralWarning\.hasInscriptions/);
    });

    it('displays hasRunes warning text', () => {
      expect(sendModalSource).toMatch(/collateralWarning\.hasRunes/);
    });

    it('displays otherAlkanesCount info', () => {
      expect(sendModalSource).toMatch(/collateralWarning\.otherAlkanesCount/);
    });

    it('renders cancelCollateralWarning button handler', () => {
      expect(sendModalSource).toMatch(/onClick=\{cancelCollateralWarning\}/);
    });

    it('renders proceedWithCollateralWarning button handler', () => {
      expect(sendModalSource).toMatch(/onClick=\{proceedWithCollateralWarning\}/);
    });
  });

  describe('proceedWithCollateralWarning and cancelCollateralWarning handlers', () => {
    it('proceedWithCollateralWarning sets showCollateralWarning to false', () => {
      // Extract the handler body
      const proceedMatch = sendModalSource.match(
        /const\s+proceedWithCollateralWarning\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/
      );
      expect(proceedMatch).not.toBeNull();
      const body = proceedMatch![1];
      expect(body).toContain('setShowCollateralWarning(false)');
    });

    it('proceedWithCollateralWarning sets collateralAcknowledged to true', () => {
      const proceedMatch = sendModalSource.match(
        /const\s+proceedWithCollateralWarning\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/
      );
      expect(proceedMatch).not.toBeNull();
      expect(proceedMatch![1]).toContain('setCollateralAcknowledged(true)');
    });

    it('proceedWithCollateralWarning re-triggers handleBroadcast', () => {
      const proceedMatch = sendModalSource.match(
        /const\s+proceedWithCollateralWarning\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/
      );
      expect(proceedMatch).not.toBeNull();
      expect(proceedMatch![1]).toContain('handleBroadcast()');
    });

    it('cancelCollateralWarning resets warning state', () => {
      const cancelMatch = sendModalSource.match(
        /const\s+cancelCollateralWarning\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/
      );
      expect(cancelMatch).not.toBeNull();
      const body = cancelMatch![1];
      expect(body).toContain('setShowCollateralWarning(false)');
      expect(body).toContain('setCollateralWarning(null)');
      expect(body).toContain('setPendingPsbtBase64(null)');
    });

    it('cancelCollateralWarning returns to input step', () => {
      const cancelMatch = sendModalSource.match(
        /const\s+cancelCollateralWarning\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/
      );
      expect(cancelMatch).not.toBeNull();
      expect(cancelMatch![1]).toContain("setStep('input')");
    });
  });

  describe('address validation for alkane recipient', () => {
    it('has a validateAddress function', () => {
      expect(sendModalSource).toMatch(/const\s+validateAddress\s*=\s*\(addr:\s*string\)/);
    });

    it('validates bech32 addresses (bc1/tb1/bcrt1 prefixes)', () => {
      expect(sendModalSource).toMatch(/normalizedAddr\.startsWith\(['"]bc1['"]\)/);
      expect(sendModalSource).toMatch(/normalizedAddr\.startsWith\(['"]tb1['"]\)/);
      expect(sendModalSource).toMatch(/normalizedAddr\.startsWith\(['"]bcrt1['"]\)/);
    });

    it('validates legacy and P2SH addresses', () => {
      expect(sendModalSource).toMatch(/addr\.startsWith\(['"]1['"]\)/);
      expect(sendModalSource).toMatch(/addr\.startsWith\(['"]3['"]\)/);
    });

    it('calls validateAddress during alkane send flow', () => {
      // In handleNext, when sendMode === 'alkanes', it validates the address
      expect(sendModalSource).toContain("if (!validateAddress(recipientAddress))");
    });

    it('shows recipient address placeholder as bc1p...', () => {
      expect(sendModalSource).toMatch(/placeholder=["']bc1p\.\.\./);
    });
  });

  describe('buildAlkaneTransferPsbt invocation', () => {
    it('passes senderTaprootAddress from alkaneSendAddress', () => {
      expect(sendModalSource).toMatch(/senderTaprootAddress:\s*alkaneSendAddress/);
    });

    it('passes recipientAddress from normalizedRecipientAddress', () => {
      expect(sendModalSource).toMatch(/recipientAddress:\s*normalizedRecipientAddress/);
    });

    it('passes alkaneId from selectedAlkaneId', () => {
      expect(sendModalSource).toMatch(/alkaneId:\s*selectedAlkaneId/);
    });

    it('passes amount as amountBaseUnits (bigint)', () => {
      expect(sendModalSource).toMatch(/amount:\s*amountBaseUnits/);
    });

    it('passes tapInternalKeyHex from account taproot pubKeyXOnly', () => {
      expect(sendModalSource).toMatch(/tapInternalKeyHex:\s*account\?\.taproot\?\.pubKeyXOnly/);
    });

    it('passes paymentPubkeyHex from account nativeSegwit pubkey', () => {
      expect(sendModalSource).toMatch(/paymentPubkeyHex:\s*account\?\.nativeSegwit\?\.pubkey/);
    });

    it('passes feeRate', () => {
      expect(sendModalSource).toMatch(/feeRate[,\s]/);
    });

    it('passes network and networkName', () => {
      expect(sendModalSource).toMatch(/network:\s*btcNetwork/);
      expect(sendModalSource).toMatch(/networkName:\s*network/);
    });

    it('conditionally passes senderPaymentAddress for dual-address wallets', () => {
      expect(sendModalSource).toMatch(
        /senderPaymentAddress:\s*hasBothAddresses\s*\?\s*btcSendAddress\s*:\s*undefined/
      );
    });

    it('checks collateralWarning from build result', () => {
      expect(sendModalSource).toContain('result.collateralWarning');
      expect(sendModalSource).toContain('result.collateralWarning.hasInscriptions');
      expect(sendModalSource).toContain('result.collateralWarning.hasRunes');
      expect(sendModalSource).toContain('result.collateralWarning.unverifiedInscriptionRunes');
    });

    it('sets collateral warning and stops if not acknowledged', () => {
      expect(sendModalSource).toContain('if (!collateralAcknowledged)');
      expect(sendModalSource).toContain('setCollateralWarning(result.collateralWarning)');
      expect(sendModalSource).toContain('setShowCollateralWarning(true)');
      expect(sendModalSource).toContain('setPendingPsbtBase64(rawPsbtBase64)');
    });
  });

  describe('fee warning acknowledgment pattern', () => {
    it('declares feeWarningAcknowledged state', () => {
      expect(sendModalSource).toMatch(
        /const\s+\[feeWarningAcknowledged,\s*setFeeWarningAcknowledged\]\s*=\s*useState\(false\)/
      );
    });

    it('checks feeWarningAcknowledged before showing warning', () => {
      expect(sendModalSource).toMatch(/!feeWarningAcknowledged\s*&&/);
    });

    it('resets feeWarningAcknowledged when modal closes', () => {
      expect(sendModalSource).toContain('setFeeWarningAcknowledged(false)');
    });
  });

  describe('browser wallet detection pattern', () => {
    it('checks walletType for browser in handleBroadcast', () => {
      expect(sendModalSource).toMatch(/walletType\s*===\s*['"]browser['"]/);
    });

    it('uses isBrowserWallet variable for alkane signing path', () => {
      expect(sendModalSource).toMatch(/const\s+isBrowserWallet\s*=\s*walletType\s*===\s*['"]browser['"]/);
    });

    it('has separate signing path for browser wallets (single call)', () => {
      // Browser wallets use a single signTaprootPsbt call
      expect(sendModalSource).toMatch(/if\s*\(isBrowserWallet\)\s*\{[\s\S]*?signTaprootPsbt/);
    });

    it('has dual-key signing for keystore wallets', () => {
      // Keystore dual-address: signSegwitPsbt then signTaprootPsbt
      expect(sendModalSource).toMatch(/signSegwitPsbt\(psbtBase64\)[\s\S]*?signTaprootPsbt\(signedPsbtBase64\)/);
    });
  });

  describe('modal state resets on close', () => {
    it('resets collateral warning state on close', () => {
      expect(sendModalSource).toContain('setCollateralWarning(null)');
      expect(sendModalSource).toContain('setShowCollateralWarning(false)');
      expect(sendModalSource).toContain('setCollateralAcknowledged(false)');
      expect(sendModalSource).toContain('setPendingPsbtBase64(null)');
    });

    it('resets sendMode to btc on close', () => {
      expect(sendModalSource).toContain("setSendMode('btc')");
    });

    it('resets selectedAlkaneId on close', () => {
      expect(sendModalSource).toContain('setSelectedAlkaneId(null)');
    });
  });
});

// ========================================================================
// 2. buildAlkaneTransferPsbt Module Tests
// ========================================================================

describe('buildAlkaneTransferPsbt module', () => {
  describe('exports', () => {
    it('exports buildAlkaneTransferPsbt function', async () => {
      const mod = await import('@/lib/alkanes/buildAlkaneTransferPsbt');
      expect(mod.buildAlkaneTransferPsbt).toBeDefined();
      expect(typeof mod.buildAlkaneTransferPsbt).toBe('function');
    });

    it('exports BuildAlkaneTransferParams interface (verified via source)', () => {
      expect(buildAlkanePsbtSource).toMatch(/export\s+interface\s+BuildAlkaneTransferParams/);
    });

    it('exports BuildAlkaneTransferResult interface (verified via source)', () => {
      expect(buildAlkanePsbtSource).toMatch(/export\s+interface\s+BuildAlkaneTransferResult/);
    });

    it('exports CollateralWarning interface (verified via source)', () => {
      expect(buildAlkanePsbtSource).toMatch(/export\s+interface\s+CollateralWarning/);
    });
  });

  describe('BuildAlkaneTransferParams shape (source analysis)', () => {
    it('requires alkaneId as string', () => {
      expect(buildAlkanePsbtSource).toMatch(/alkaneId:\s*string/);
    });

    it('requires amount as bigint', () => {
      expect(buildAlkanePsbtSource).toMatch(/amount:\s*bigint/);
    });

    it('requires senderTaprootAddress as string', () => {
      expect(buildAlkanePsbtSource).toMatch(/senderTaprootAddress:\s*string/);
    });

    it('has optional senderPaymentAddress for dual-address wallets', () => {
      expect(buildAlkanePsbtSource).toMatch(/senderPaymentAddress\?:\s*string/);
    });

    it('requires recipientAddress as string', () => {
      expect(buildAlkanePsbtSource).toMatch(/recipientAddress:\s*string/);
    });

    it('has optional tapInternalKeyHex for P2TR inputs', () => {
      expect(buildAlkanePsbtSource).toMatch(/tapInternalKeyHex\?:\s*string/);
    });

    it('has optional paymentPubkeyHex for P2SH-P2WPKH', () => {
      expect(buildAlkanePsbtSource).toMatch(/paymentPubkeyHex\?:\s*string/);
    });

    it('requires feeRate as number', () => {
      expect(buildAlkanePsbtSource).toMatch(/feeRate:\s*number/);
    });

    it('requires network as bitcoin.Network', () => {
      expect(buildAlkanePsbtSource).toMatch(/network:\s*bitcoin\.Network/);
    });

    it('requires networkName as string', () => {
      expect(buildAlkanePsbtSource).toMatch(/networkName:\s*string/);
    });
  });

  describe('CollateralWarning shape (source analysis)', () => {
    it('has hasInscriptions boolean field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+CollateralWarning\s*\{([\s\S]*?)\}/
      );
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/hasInscriptions:\s*boolean/);
    });

    it('has hasRunes boolean field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+CollateralWarning\s*\{([\s\S]*?)\}/
      );
      expect(match![1]).toMatch(/hasRunes:\s*boolean/);
    });

    it('has otherAlkanesCount number field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+CollateralWarning\s*\{([\s\S]*?)\}/
      );
      expect(match![1]).toMatch(/otherAlkanesCount:\s*number/);
    });

    it('has utxoCount number field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+CollateralWarning\s*\{([\s\S]*?)\}/
      );
      expect(match![1]).toMatch(/utxoCount:\s*number/);
    });

    it('has unverifiedInscriptionRunes boolean field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+CollateralWarning\s*\{([\s\S]*?)\}/
      );
      expect(match![1]).toMatch(/unverifiedInscriptionRunes:\s*boolean/);
    });
  });

  describe('BuildAlkaneTransferResult shape (source analysis)', () => {
    it('has psbtBase64 string field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+BuildAlkaneTransferResult\s*\{([\s\S]*?)\}/
      );
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/psbtBase64:\s*string/);
    });

    it('has estimatedFee number field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+BuildAlkaneTransferResult\s*\{([\s\S]*?)\}/
      );
      expect(match![1]).toMatch(/estimatedFee:\s*number/);
    });

    it('has optional collateralWarning field', () => {
      const match = buildAlkanePsbtSource.match(
        /export\s+interface\s+BuildAlkaneTransferResult\s*\{([\s\S]*?)\}/
      );
      expect(match![1]).toMatch(/collateralWarning\?:\s*CollateralWarning/);
    });
  });

  describe('UTXO selection logic (source analysis)', () => {
    it('uses DUST_VALUE of 600 sats (not 546)', () => {
      expect(buildAlkanePsbtSource).toMatch(/const\s+DUST_VALUE\s*=\s*600/);
    });

    it('uses PROTOCOL_TAG_ALKANES = 1n', () => {
      expect(buildAlkanePsbtSource).toMatch(/const\s+PROTOCOL_TAG_ALKANES\s*=\s*1n/);
    });

    it('calls fetchAlkaneOutpoints to discover alkane UTXOs', () => {
      expect(buildAlkanePsbtSource).toContain('fetchAlkaneOutpoints(senderTaprootAddress');
    });

    it('calls fetchOrdOutputs to detect inscriptions and runes', () => {
      expect(buildAlkanePsbtSource).toContain('fetchOrdOutputs(senderTaprootAddress');
    });

    it('filters outpoints to target alkane ID only', () => {
      expect(buildAlkanePsbtSource).toMatch(
        /outpoint\.alkanes\.some\(a\s*=>\s*`\$\{a\.block\}:\$\{a\.tx\}`\s*===\s*targetAlkaneId\)/
      );
    });

    it('sorts UTXOs by cleanliness score (clean first, inscriptions/runes last)', () => {
      expect(buildAlkanePsbtSource).toContain('cleanlinessScore');
      // Inscriptions/runes get score 100+
      expect(buildAlkanePsbtSource).toMatch(/hasInscriptions\s*\|\|\s*o\.hasRunes\s*\?\s*100\s*:\s*0/);
    });

    it('uses greedy selection to pick fewest UTXOs', () => {
      expect(buildAlkanePsbtSource).toMatch(/if\s*\(selectedAmount\s*>=\s*amount\)\s*break/);
    });

    it('throws error when no UTXOs contain the target alkane', () => {
      expect(buildAlkanePsbtSource).toMatch(/throw\s+new\s+Error\(`No UTXOs found containing alkane/);
    });

    it('throws error on insufficient balance', () => {
      expect(buildAlkanePsbtSource).toMatch(/throw\s+new\s+Error\(`Insufficient balance/);
    });

    it('throws error on insufficient BTC for fee', () => {
      expect(buildAlkanePsbtSource).toMatch(/throw\s+new\s+Error\(`Insufficient BTC for fee/);
    });
  });

  describe('PSBT output structure (source analysis)', () => {
    it('v0 is sender alkane change (dust output to senderTaprootAddress)', () => {
      // First addOutput should be sender change
      expect(buildAlkanePsbtSource).toMatch(
        /\/\/\s*v0:\s*Sender alkane change[\s\S]*?address:\s*senderTaprootAddress[\s\S]*?value:\s*BigInt\(DUST_VALUE\)/
      );
    });

    it('v1 is recipient (dust output to recipientAddress)', () => {
      expect(buildAlkanePsbtSource).toMatch(
        /\/\/\s*v1:\s*Recipient[\s\S]*?address:\s*recipientAddress[\s\S]*?value:\s*BigInt\(DUST_VALUE\)/
      );
    });

    it('v2 is OP_RETURN protostone', () => {
      expect(buildAlkanePsbtSource).toMatch(/\/\/\s*v2:\s*OP_RETURN\s*\(protostone\)/);
    });

    it('v3 is BTC change (only if above dust)', () => {
      expect(buildAlkanePsbtSource).toMatch(/if\s*\(btcChange\s*>=\s*DUST_VALUE\)/);
    });

    it('edict targets output 1 (recipient)', () => {
      expect(buildAlkanePsbtSource).toMatch(/output:\s*1,?\s*\/\/\s*v1\s*=\s*recipient/);
    });

    it('protostone pointer is 0 (unedicted remainder to sender change)', () => {
      expect(buildAlkanePsbtSource).toMatch(/pointer:\s*0,?\s*\/\/\s*unedicted remainder.*v0/);
    });
  });

  describe('tapInternalKey handling (source analysis)', () => {
    it('parses tapInternalKeyHex with optional prefix removal', () => {
      // Handles both 64-char (raw) and 66-char (02-prefixed) hex
      expect(buildAlkanePsbtSource).toMatch(/tapInternalKeyHex\.length\s*===\s*66/);
    });

    it('conditionally adds tapInternalKey to alkane inputs', () => {
      expect(buildAlkanePsbtSource).toMatch(/tapInternalKey\s*\?\s*\{\s*tapInternalKey\s*\}/);
    });

    it('conditionally adds tapInternalKey to BTC fee inputs (only for P2TR)', () => {
      expect(buildAlkanePsbtSource).toMatch(/btcFeeIsP2TR\s*&&\s*tapInternalKey/);
    });
  });
});
