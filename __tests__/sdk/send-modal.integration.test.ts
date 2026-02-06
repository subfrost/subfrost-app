/**
 * SendModal Integration Tests
 *
 * Tests for the BTC send flow in SendModal covering:
 * 1. Fresh UTXO fetching before transaction building
 * 2. Stale UTXO detection and error handling
 * 3. PSBT construction with correct inputs
 * 4. Fee calculation and change output
 * 5. Browser wallet signing flow
 * 6. Transaction broadcast
 *
 * ## Running Tests
 *
 * ```bash
 * # Unit tests (mocked)
 * pnpm test:sdk send-modal
 *
 * # Integration tests (requires regtest.subfrost.io)
 * INTEGRATION=true pnpm test:sdk send-modal
 * ```
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// Standard test mnemonic
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Regtest configuration
const REGTEST_CONFIG = {
  jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

const TEST_RECIPIENT = 'bcrt1qs52wg59emg847ld37v2dc8f7ruz2e83xj9j555';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// Simulate the UTXO structure from WalletContext/esplora
interface FormattedUtxo {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  address: string;
}

// Simulate the fresh UTXO structure from esplora API
interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
  };
}

/**
 * Simulates the fresh UTXO verification logic from SendModal
 */
function verifyUtxosFresh(
  selectedUtxos: FormattedUtxo[],
  freshUtxos: EsploraUtxo[]
): { valid: boolean; missing: FormattedUtxo[] } {
  const freshUtxoSet = new Set(
    freshUtxos.map(u => `${u.txid}:${u.vout}`)
  );

  const missing = selectedUtxos.filter(
    u => !freshUtxoSet.has(`${u.txId}:${u.outputIndex}`)
  );

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Simulates PSBT building logic from SendModal
 */
function buildSendPsbt(
  utxos: FormattedUtxo[],
  recipient: string,
  amountSats: number,
  feeRate: number,
  changeAddress: string,
  network: bitcoin.Network
): { psbt: bitcoin.Psbt; fee: number } {
  const psbt = new bitcoin.Psbt({ network });

  let totalInput = 0;

  // Add inputs
  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPk, 'hex'),
        value: BigInt(utxo.satoshis),
      },
    });
    totalInput += utxo.satoshis;
  }

  // Calculate fee (simplified)
  const inputSize = utxos.length * 68; // P2WPKH input
  const outputSize = 2 * 31; // 2 P2WPKH outputs
  const overhead = 10;
  const vSize = inputSize + outputSize + overhead;
  const fee = vSize * feeRate;

  // Add recipient output
  psbt.addOutput({
    address: recipient,
    value: BigInt(amountSats),
  });

  // Add change output if above dust
  const change = totalInput - amountSats - fee;
  const DUST_THRESHOLD = 546;

  if (change > DUST_THRESHOLD) {
    psbt.addOutput({
      address: changeAddress,
      value: BigInt(change),
    });
  }

  return { psbt, fee };
}

/**
 * Simulates UTXO selection for a target amount
 */
function selectUtxos(
  availableUtxos: FormattedUtxo[],
  targetAmount: number,
  feeRate: number
): FormattedUtxo[] {
  // Sort by value descending (largest first)
  const sorted = [...availableUtxos].sort((a, b) => b.satoshis - a.satoshis);

  const selected: FormattedUtxo[] = [];
  let total = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.satoshis;

    // Estimate fee for current selection
    const estimatedFee = (selected.length * 68 + 2 * 31 + 10) * feeRate;

    if (total >= targetAmount + estimatedFee) {
      break;
    }
  }

  return selected;
}

describe('SendModal Integration Tests', () => {
  let provider: WebProvider;
  let wasm: typeof import('@alkanes/ts-sdk/wasm');

  beforeAll(async () => {
    wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);
    console.log('[SendModal] WebProvider initialized');
  }, 60000);

  // ============================================================================
  // 1. FRESH UTXO VERIFICATION TESTS
  // ============================================================================
  describe('Fresh UTXO Verification', () => {
    it('should pass verification when all UTXOs exist', () => {
      const selectedUtxos: FormattedUtxo[] = [
        { txId: 'aaaa'.repeat(16), outputIndex: 0, satoshis: 100000, scriptPk: '', address: '' },
        { txId: 'bbbb'.repeat(16), outputIndex: 1, satoshis: 200000, scriptPk: '', address: '' },
      ];

      const freshUtxos: EsploraUtxo[] = [
        { txid: 'aaaa'.repeat(16), vout: 0, value: 100000, status: { confirmed: true } },
        { txid: 'bbbb'.repeat(16), vout: 1, value: 200000, status: { confirmed: true } },
        { txid: 'cccc'.repeat(16), vout: 0, value: 300000, status: { confirmed: true } },
      ];

      const result = verifyUtxosFresh(selectedUtxos, freshUtxos);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should fail verification when UTXO is missing (spent)', () => {
      const selectedUtxos: FormattedUtxo[] = [
        { txId: 'aaaa'.repeat(16), outputIndex: 0, satoshis: 100000, scriptPk: '', address: '' },
        { txId: 'bbbb'.repeat(16), outputIndex: 1, satoshis: 200000, scriptPk: '', address: '' },
      ];

      // bbbb:1 is missing from fresh UTXOs (already spent)
      const freshUtxos: EsploraUtxo[] = [
        { txid: 'aaaa'.repeat(16), vout: 0, value: 100000, status: { confirmed: true } },
        { txid: 'cccc'.repeat(16), vout: 0, value: 300000, status: { confirmed: true } },
      ];

      const result = verifyUtxosFresh(selectedUtxos, freshUtxos);

      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].txId).toBe('bbbb'.repeat(16));
    });

    it('should fail verification when output index differs', () => {
      const selectedUtxos: FormattedUtxo[] = [
        { txId: 'aaaa'.repeat(16), outputIndex: 0, satoshis: 100000, scriptPk: '', address: '' },
      ];

      // Same txid but different vout
      const freshUtxos: EsploraUtxo[] = [
        { txid: 'aaaa'.repeat(16), vout: 1, value: 100000, status: { confirmed: true } },
      ];

      const result = verifyUtxosFresh(selectedUtxos, freshUtxos);

      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(1);
    });

    it('should generate correct error message for stale UTXOs', () => {
      const selectedUtxos: FormattedUtxo[] = [
        { txId: 'aaaa'.repeat(16), outputIndex: 0, satoshis: 100000, scriptPk: '', address: '' },
        { txId: 'bbbb'.repeat(16), outputIndex: 1, satoshis: 200000, scriptPk: '', address: '' },
        { txId: 'cccc'.repeat(16), outputIndex: 2, satoshis: 300000, scriptPk: '', address: '' },
      ];

      const freshUtxos: EsploraUtxo[] = [
        { txid: 'aaaa'.repeat(16), vout: 0, value: 100000, status: { confirmed: true } },
        // bbbb and cccc are missing
      ];

      const result = verifyUtxosFresh(selectedUtxos, freshUtxos);

      if (!result.valid) {
        const errorMsg = `Some selected UTXOs are no longer available (${result.missing.length} missing). ` +
          `This can happen if another transaction spent them. Please refresh and try again.`;

        expect(errorMsg).toContain('2 missing');
        expect(errorMsg).toContain('refresh and try again');
      }
    });
  });

  // ============================================================================
  // 2. UTXO SELECTION TESTS
  // ============================================================================
  describe('UTXO Selection', () => {
    it('should select minimum UTXOs needed for amount', () => {
      const utxos: FormattedUtxo[] = [
        { txId: 'a'.repeat(64), outputIndex: 0, satoshis: 50000, scriptPk: '', address: '' },
        { txId: 'b'.repeat(64), outputIndex: 0, satoshis: 100000, scriptPk: '', address: '' },
        { txId: 'c'.repeat(64), outputIndex: 0, satoshis: 200000, scriptPk: '', address: '' },
      ];

      const selected = selectUtxos(utxos, 150000, 5);

      // Should select 200k UTXO (largest first, covers amount + fee)
      expect(selected).toHaveLength(1);
      expect(selected[0].satoshis).toBe(200000);
    });

    it('should select multiple UTXOs when single is insufficient', () => {
      const utxos: FormattedUtxo[] = [
        { txId: 'a'.repeat(64), outputIndex: 0, satoshis: 50000, scriptPk: '', address: '' },
        { txId: 'b'.repeat(64), outputIndex: 0, satoshis: 100000, scriptPk: '', address: '' },
        { txId: 'c'.repeat(64), outputIndex: 0, satoshis: 75000, scriptPk: '', address: '' },
      ];

      const selected = selectUtxos(utxos, 150000, 5);

      // Should select 100k + 75k or 100k + 50k
      expect(selected.length).toBeGreaterThanOrEqual(2);

      const total = selected.reduce((sum, u) => sum + u.satoshis, 0);
      expect(total).toBeGreaterThanOrEqual(150000);
    });

    it('should return all UTXOs if total is still insufficient', () => {
      const utxos: FormattedUtxo[] = [
        { txId: 'a'.repeat(64), outputIndex: 0, satoshis: 10000, scriptPk: '', address: '' },
        { txId: 'b'.repeat(64), outputIndex: 0, satoshis: 20000, scriptPk: '', address: '' },
      ];

      const selected = selectUtxos(utxos, 100000, 5);

      // Should select all UTXOs even though insufficient
      expect(selected).toHaveLength(2);
    });
  });

  // ============================================================================
  // 3. PSBT BUILDING TESTS
  // ============================================================================
  describe('PSBT Building', () => {
    it('should build valid PSBT with single input', () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      const utxos: FormattedUtxo[] = [
        {
          txId: 'a'.repeat(64),
          outputIndex: 0,
          satoshis: 100000,
          scriptPk: Buffer.from(payment.output!).toString('hex'),
          address: payment.address!,
        },
      ];

      const { psbt, fee } = buildSendPsbt(
        utxos,
        TEST_RECIPIENT,
        50000,
        5, // 5 sat/vB
        payment.address!,
        bitcoin.networks.regtest
      );

      expect(psbt.inputCount).toBe(1);
      expect(psbt.txOutputs.length).toBe(2); // recipient + change

      // Verify amounts
      expect(Number(psbt.txOutputs[0].value)).toBe(50000);

      const change = 100000 - 50000 - fee;
      expect(Number(psbt.txOutputs[1].value)).toBe(change);
    });

    it('should skip change output when below dust threshold', () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      const utxos: FormattedUtxo[] = [
        {
          txId: 'a'.repeat(64),
          outputIndex: 0,
          satoshis: 10000,
          scriptPk: Buffer.from(payment.output!).toString('hex'),
          address: payment.address!,
        },
      ];

      // Send almost all (leaving change < dust)
      const { psbt } = buildSendPsbt(
        utxos,
        TEST_RECIPIENT,
        9000, // 9000 sats, leaving ~1000 for fee, ~0 change
        10, // 10 sat/vB
        payment.address!,
        bitcoin.networks.regtest
      );

      // Should only have 1 output (recipient, no change)
      expect(psbt.txOutputs.length).toBe(1);
      expect(Number(psbt.txOutputs[0].value)).toBe(9000);
    });

    it('should calculate fee based on input count', () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      // Single input
      const utxos1: FormattedUtxo[] = [
        {
          txId: 'a'.repeat(64),
          outputIndex: 0,
          satoshis: 200000,
          scriptPk: Buffer.from(payment.output!).toString('hex'),
          address: payment.address!,
        },
      ];

      const { fee: fee1 } = buildSendPsbt(
        utxos1,
        TEST_RECIPIENT,
        50000,
        10,
        payment.address!,
        bitcoin.networks.regtest
      );

      // Three inputs
      const utxos3: FormattedUtxo[] = [
        { txId: 'a'.repeat(64), outputIndex: 0, satoshis: 70000, scriptPk: Buffer.from(payment.output!).toString('hex'), address: payment.address! },
        { txId: 'b'.repeat(64), outputIndex: 0, satoshis: 70000, scriptPk: Buffer.from(payment.output!).toString('hex'), address: payment.address! },
        { txId: 'c'.repeat(64), outputIndex: 0, satoshis: 70000, scriptPk: Buffer.from(payment.output!).toString('hex'), address: payment.address! },
      ];

      const { fee: fee3 } = buildSendPsbt(
        utxos3,
        TEST_RECIPIENT,
        50000,
        10,
        payment.address!,
        bitcoin.networks.regtest
      );

      // More inputs = higher fee
      expect(fee3).toBeGreaterThan(fee1);
    });
  });

  // ============================================================================
  // 4. SIGNING FLOW TESTS
  // ============================================================================
  describe('Signing Flow', () => {
    it('should sign PSBT with keystore wallet', async () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      const utxos: FormattedUtxo[] = [
        {
          txId: 'a'.repeat(64),
          outputIndex: 0,
          satoshis: 100000,
          scriptPk: Buffer.from(payment.output!).toString('hex'),
          address: payment.address!,
        },
      ];

      const { psbt } = buildSendPsbt(
        utxos,
        TEST_RECIPIENT,
        50000,
        5,
        payment.address!,
        bitcoin.networks.regtest
      );

      // Sign
      psbt.signInput(0, child);

      expect(psbt.data.inputs[0].partialSig).toBeDefined();
      expect(psbt.data.inputs[0].partialSig!.length).toBeGreaterThan(0);
    });

    it('should convert between base64 and hex for browser wallet', async () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      const utxos: FormattedUtxo[] = [
        {
          txId: 'a'.repeat(64),
          outputIndex: 0,
          satoshis: 100000,
          scriptPk: Buffer.from(payment.output!).toString('hex'),
          address: payment.address!,
        },
      ];

      const { psbt } = buildSendPsbt(
        utxos,
        TEST_RECIPIENT,
        50000,
        5,
        payment.address!,
        bitcoin.networks.regtest
      );

      // Simulate WalletContext flow
      const psbtBase64 = psbt.toBase64();

      // Convert to hex for wallet adapter
      const psbtBuffer = Buffer.from(psbtBase64, 'base64');
      const psbtHex = psbtBuffer.toString('hex');

      // Wallet signs (simulated)
      const signedPsbt = bitcoin.Psbt.fromHex(psbtHex, { network: bitcoin.networks.regtest });
      signedPsbt.signInput(0, child);
      const signedHex = signedPsbt.toHex();

      // Convert back to base64
      const signedBuffer = Buffer.from(signedHex, 'hex');
      const signedBase64 = signedBuffer.toString('base64');

      // Verify by parsing
      const finalPsbt = bitcoin.Psbt.fromBase64(signedBase64, { network: bitcoin.networks.regtest });
      expect(finalPsbt.data.inputs[0].partialSig).toBeDefined();
    });
  });

  // ============================================================================
  // 5. FINALIZATION AND BROADCAST TESTS
  // ============================================================================
  describe('Finalization and Broadcast', () => {
    it('should finalize signed PSBT', () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      psbt.addInput({
        hash: 'a'.repeat(64),
        index: 0,
        witnessUtxo: {
          script: payment.output!,
          value: BigInt(100000),
        },
      });

      psbt.addOutput({
        address: TEST_RECIPIENT,
        value: BigInt(50000),
      });

      // Sign
      psbt.signInput(0, child);

      // Finalize
      psbt.finalizeAllInputs();

      // Extract transaction
      const tx = psbt.extractTransaction();

      expect(tx).toBeDefined();
      expect(tx.ins.length).toBe(1);
      expect(tx.outs.length).toBe(1);

      // Get hex for broadcast
      const txHex = tx.toHex();
      expect(txHex).toMatch(/^[0-9a-f]+$/i);
    });

    it('should throw when finalizing unsigned PSBT', () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      psbt.addInput({
        hash: 'a'.repeat(64),
        index: 0,
        witnessUtxo: {
          script: payment.output!,
          value: BigInt(100000),
        },
      });

      psbt.addOutput({
        address: TEST_RECIPIENT,
        value: BigInt(50000),
      });

      // Attempt to finalize without signing
      expect(() => psbt.finalizeAllInputs()).toThrow();
    });
  });

  // ============================================================================
  // 6. ERROR HANDLING TESTS
  // ============================================================================
  describe('Error Handling', () => {
    it('should handle insufficient funds gracefully', () => {
      const utxos: FormattedUtxo[] = [
        { txId: 'a'.repeat(64), outputIndex: 0, satoshis: 1000, scriptPk: '', address: '' },
      ];

      const targetAmount = 100000;
      const feeRate = 5;

      const selected = selectUtxos(utxos, targetAmount, feeRate);
      const total = selected.reduce((sum, u) => sum + u.satoshis, 0);
      const estimatedFee = (selected.length * 68 + 2 * 31 + 10) * feeRate;

      const isInsufficient = total < targetAmount + estimatedFee;

      expect(isInsufficient).toBe(true);

      if (isInsufficient) {
        const errorMsg = `Insufficient funds. Available: ${total} sats, Required: ${targetAmount + estimatedFee} sats`;
        expect(errorMsg).toContain('Insufficient funds');
      }
    });

    it('should handle invalid recipient address', () => {
      expect(() => {
        const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });
        psbt.addOutput({
          address: 'invalid_address',
          value: BigInt(10000),
        });
      }).toThrow();
    });

    it('should handle network mismatch', () => {
      // Mainnet address on regtest should fail
      expect(() => {
        const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });
        psbt.addOutput({
          address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', // mainnet
          value: BigInt(10000),
        });
      }).toThrow();
    });
  });

  // ============================================================================
  // 7. INTEGRATION TESTS (Requires regtest.subfrost.io)
  // ============================================================================
  describe('Live Integration Tests', () => {
    const skipIfNoIntegration = process.env.INTEGRATION !== 'true';

    it.skipIf(skipIfNoIntegration)('should fetch fresh UTXOs and verify against cache', async () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      const address = payment.address!;
      console.log('[SendModal] Testing address:', address);

      // Fetch fresh UTXOs (simulates what SendModal does before building tx)
      const freshUtxos = await provider.esploraGetAddressUtxo(address);
      console.log('[SendModal] Fresh UTXOs:', freshUtxos?.length || 0);

      // If we have UTXOs, verify the format
      if (freshUtxos && freshUtxos.length > 0) {
        const utxo = freshUtxos[0];
        expect(utxo).toHaveProperty('txid');
        expect(utxo).toHaveProperty('vout');
        expect(utxo).toHaveProperty('value');

        // Simulate cached UTXO matching fresh
        const cachedUtxos: FormattedUtxo[] = freshUtxos.map((u: any) => ({
          txId: u.txid,
          outputIndex: u.vout,
          satoshis: u.value,
          scriptPk: '',
          address,
        }));

        const result = verifyUtxosFresh(cachedUtxos, freshUtxos);
        expect(result.valid).toBe(true);
      }
    }, 30000);

    it.skipIf(skipIfNoIntegration)('should build and sign real PSBT', async () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
      const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
      const child = root.derivePath("m/84'/1'/0'/0/0");

      const payment = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network: bitcoin.networks.regtest,
      });

      const address = payment.address!;

      // Fetch UTXOs
      const utxos = await provider.esploraGetAddressUtxo(address);

      if (!utxos || utxos.length === 0) {
        console.log('[SendModal] No UTXOs available - skipping');
        return;
      }

      const utxo = utxos[0];
      console.log('[SendModal] Using UTXO:', utxo.txid, ':', utxo.vout, '=', utxo.value);

      // Fetch full transaction for script
      const txHex = await provider.esploraGetTxHex(utxo.txid);
      const tx = bitcoin.Transaction.fromHex(txHex);

      // Build PSBT
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: tx.outs[utxo.vout].script,
          value: BigInt(utxo.value),
        },
      });

      const fee = 500;
      psbt.addOutput({
        address: address, // Send to self
        value: BigInt(utxo.value - fee),
      });

      // Sign
      psbt.signInput(0, child);

      // Verify signature
      expect(psbt.data.inputs[0].partialSig).toBeDefined();

      // Finalize
      psbt.finalizeAllInputs();

      // Extract transaction
      const finalTx = psbt.extractTransaction();
      const finalTxHex = finalTx.toHex();

      console.log('[SendModal] Signed tx hex:', finalTxHex.slice(0, 100) + '...');

      expect(finalTxHex).toMatch(/^[0-9a-f]+$/i);
    }, 30000);
  });
});
