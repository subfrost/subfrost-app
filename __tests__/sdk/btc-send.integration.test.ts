/**
 * BTC Send Integration Tests
 *
 * Tests for BTC sending functionality covering:
 * 1. Keystore wallet BTC sends (via WASM provider)
 * 2. Browser wallet BTC sends (PSBT building, signing, broadcasting)
 * 3. UTXO selection and fee calculation
 * 4. Change output handling
 * 5. Network-specific behavior
 *
 * ## Running Tests
 *
 * ### Unit tests only (skip integration tests):
 * ```bash
 * pnpm test:sdk btc-send
 * ```
 *
 * ### Run integration tests on regtest:
 * ```bash
 * # 1. Start the app (in another terminal)
 * pnpm dev
 *
 * # 2. Run integration tests
 * INTEGRATION=true pnpm test:sdk btc-send
 *
 * # 3. Skip Puppeteer tests (if app is not running)
 * INTEGRATION=true SKIP_PUPPETEER=true pnpm test:sdk btc-send
 * ```
 *
 * ### Requirements for integration tests:
 * - Regtest network running at regtest.subfrost.io
 * - Funded wallet with test BTC
 * - For Puppeteer tests: app running on localhost:3000
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { setupBrowserWallet, sendBtcWithBrowserWallet, type BrowserWalletSetup } from '../helpers/puppeteer-wallet';

bitcoin.initEccLib(ecc);

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// Regtest configuration
const REGTEST_CONFIG = {
  jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

// Standard test mnemonic (do NOT use in production!)
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Test addresses (regtest) - funded via CLI wallet
const TEST_SENDER_P2WPKH = 'bcrt1qd96g2nl5tnlpavp2t4r6eyqz7shvuk9lr0wqe8'; // CLI wallet index 0
const TEST_RECIPIENT = 'bcrt1qs52wg59emg847ld37v2dc8f7ruz2e83xj9j555'; // CLI wallet index 1

describe('BTC Send Integration Tests', () => {
  let provider: WebProvider;
  let wasm: typeof import('@alkanes/ts-sdk/wasm');

  beforeAll(async () => {
    wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);
    console.log('[BtcSend] WebProvider initialized');
  }, 60000);

  // ============================================================================
  // 1. PSBT BUILDING TESTS (Browser Wallet Flow)
  // ============================================================================
  describe('PSBT Building', () => {
    it('should create a valid PSBT with single input and two outputs', () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      // Mock UTXO data
      const mockTxHex =
        '020000000001010000000000000000000000000000000000000000000000000000000000000000ffffffff0401650101ffffffff0200f2052a0100000016001412345678901234567890123456789012345678900000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf90120000000000000000000000000000000000000000000000000000000000000000000000000';
      const mockTx = bitcoin.Transaction.fromHex(mockTxHex);

      // Add input (P2WPKH)
      psbt.addInput({
        hash: 'a'.repeat(64),
        index: 0,
        witnessUtxo: {
          script: Buffer.from(mockTx.outs[0].script),
          value: BigInt(50000000), // 0.5 BTC
        },
      });

      // Add recipient output
      const recipientAmount = 10000000; // 0.1 BTC
      psbt.addOutput({
        address: TEST_RECIPIENT,
        value: BigInt(recipientAmount),
      });

      // Add change output
      const feeRate = 5; // 5 sat/vB
      const estimatedSize = 180 + 2 * 34 + 10; // 1 input, 2 outputs
      const fee = estimatedSize * feeRate;
      const change = 50000000 - recipientAmount - fee;

      psbt.addOutput({
        address: TEST_RECIPIENT, // Using same address for simplicity
        value: BigInt(change),
      });

      expect(psbt.inputCount).toBe(1);
      expect(psbt.txOutputs.length).toBe(2);
      expect(Number(psbt.txOutputs[0].value)).toBe(recipientAmount);
      expect(Number(psbt.txOutputs[1].value)).toBe(change);
    });

    it('should handle dust threshold correctly', () => {
      const DUST_THRESHOLD = 546;
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      const mockTxHex =
        '020000000001010000000000000000000000000000000000000000000000000000000000000000ffffffff0401650101ffffffff0200f2052a0100000016001412345678901234567890123456789012345678900000000000000000266a24aa21a9ede2f61c3f71d1defd3fa999dfa36953755c690689799962b48bebd836974e8cf90120000000000000000000000000000000000000000000000000000000000000000000000000';
      const mockTx = bitcoin.Transaction.fromHex(mockTxHex);

      psbt.addInput({
        hash: 'a'.repeat(64),
        index: 0,
        witnessUtxo: {
          script: Buffer.from(mockTx.outs[0].script),
          value: BigInt(1000000), // 0.01 BTC
        },
      });

      const recipientAmount = 998500;
      const feeRate = 5;
      const estimatedSize = 180 + 2 * 34 + 10;
      const fee = estimatedSize * feeRate;
      const change = 1000000 - recipientAmount - fee;

      // Add recipient output
      psbt.addOutput({
        address: TEST_RECIPIENT,
        value: BigInt(recipientAmount),
      });

      // Only add change if above dust threshold
      if (change > DUST_THRESHOLD) {
        psbt.addOutput({
          address: TEST_RECIPIENT,
          value: BigInt(change),
        });
      }

      // With these numbers, change should be below dust threshold
      expect(change).toBeLessThan(DUST_THRESHOLD);
      expect(psbt.txOutputs.length).toBe(1); // Only recipient output
    });

    it('should calculate fees correctly for multiple inputs', () => {
      const feeRate = 10; // 10 sat/vB

      // Calculate fee for 3 inputs, 2 outputs
      const numInputs = 3;
      const numOutputs = 2;
      const estimatedSize = numInputs * 180 + numOutputs * 34 + 10;
      const expectedFee = estimatedSize * feeRate;

      expect(estimatedSize).toBe(3 * 180 + 2 * 34 + 10); // 618 bytes
      expect(expectedFee).toBe(6180); // 6180 sats
    });
  });

  // ============================================================================
  // 2. NETWORK MAPPING TESTS
  // ============================================================================
  describe('Network Mapping', () => {
    it('should map mainnet correctly', () => {
      const network = bitcoin.networks.bitcoin;
      expect(network.bech32).toBe('bc');
    });

    it('should map testnet correctly', () => {
      const network = bitcoin.networks.testnet;
      expect(network.bech32).toBe('tb');
    });

    it('should map regtest correctly', () => {
      const network = bitcoin.networks.regtest;
      expect(network.bech32).toBe('bcrt');
    });

    it('should validate addresses for correct network', () => {
      // Regtest address
      expect(TEST_RECIPIENT.startsWith('bcrt1')).toBe(true);

      // Mainnet addresses should start with bc1
      const mainnetAddr = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
      expect(mainnetAddr.startsWith('bc1')).toBe(true);
    });
  });

  // ============================================================================
  // 3. UTXO SELECTION TESTS
  // ============================================================================
  describe('UTXO Selection', () => {
    it('should select enough UTXOs to cover amount + fee', () => {
      const availableUtxos = [
        { txid: 'a'.repeat(64), vout: 0, value: 10000000 }, // 0.1 BTC
        { txid: 'b'.repeat(64), vout: 0, value: 20000000 }, // 0.2 BTC
        { txid: 'c'.repeat(64), vout: 0, value: 30000000 }, // 0.3 BTC
      ];

      const sendAmount = 25000000; // 0.25 BTC
      const feeRate = 5; // 5 sat/vB

      // Sort by largest first
      const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);

      let total = 0;
      const selected = [];

      for (const utxo of sorted) {
        const estimatedFee = (selected.length + 1) * 180 * feeRate + 2 * 34 * feeRate + 10 * feeRate;
        selected.push(utxo);
        total += utxo.value;

        if (total >= sendAmount + estimatedFee) {
          break;
        }
      }

      expect(selected.length).toBeGreaterThan(0);
      expect(total).toBeGreaterThanOrEqual(sendAmount);

      // Should select the 0.3 BTC UTXO which is sufficient
      expect(selected[0].value).toBe(30000000);
    });

    it('should handle insufficient funds gracefully', () => {
      const availableUtxos = [
        { txid: 'a'.repeat(64), vout: 0, value: 5000000 }, // 0.05 BTC
      ];

      const sendAmount = 10000000; // 0.1 BTC
      const feeRate = 5;

      let total = 0;
      const selected = [];

      for (const utxo of availableUtxos) {
        selected.push(utxo);
        total += utxo.value;
      }

      const estimatedFee = selected.length * 180 * feeRate + 2 * 34 * feeRate + 10 * feeRate;
      const required = sendAmount + estimatedFee;

      expect(total).toBeLessThan(required);
    });
  });

  // ============================================================================
  // 4. KEYSTORE WALLET SEND TESTS (via WASM Provider)
  // ============================================================================
  describe('Keystore Wallet Send', () => {
    it('should format walletSend parameters correctly', () => {
      const sendParams = {
        address: TEST_RECIPIENT,
        amount: 10000000, // 0.1 BTC in sats
        fee_rate: 5,
        from: ['bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x'],
        lock_alkanes: true,
        auto_confirm: true,
      };

      const paramsJson = JSON.stringify(sendParams);
      const parsed = JSON.parse(paramsJson);

      expect(parsed.address).toBe(TEST_RECIPIENT);
      expect(parsed.amount).toBe(10000000);
      expect(parsed.fee_rate).toBe(5);
      expect(Array.isArray(parsed.from)).toBe(true);
      expect(parsed.lock_alkanes).toBe(true);
    });
  });

  // ============================================================================
  // 5. BROWSER WALLET MOCKING TESTS
  // ============================================================================
  describe('Browser Wallet Signing', () => {
    it('should mock browser wallet signPsbt correctly', async () => {
      // Create a mock browser wallet
      const mockBrowserWallet = {
        signPsbt: vi.fn(async (psbtHex: string) => {
          // Mock: just return the same PSBT (in reality it would be signed)
          return psbtHex;
        }),
      };

      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });
      const psbtHex = psbt.toHex();

      const signedHex = await mockBrowserWallet.signPsbt(psbtHex);

      expect(mockBrowserWallet.signPsbt).toHaveBeenCalledWith(psbtHex);
      expect(signedHex).toBe(psbtHex);
    });

    it('should convert between base64 and hex correctly', () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      // Base64 encoding/decoding
      const base64 = psbt.toBase64();
      const fromBase64 = bitcoin.Psbt.fromBase64(base64, { network: bitcoin.networks.regtest });

      expect(fromBase64.toBase64()).toBe(base64);

      // Hex encoding/decoding
      const hex = psbt.toHex();
      const fromHex = bitcoin.Psbt.fromHex(hex, { network: bitcoin.networks.regtest });

      expect(fromHex.toHex()).toBe(hex);

      // Base64 <-> Hex conversion
      const buffer = Buffer.from(base64, 'base64');
      const hexFromBase64 = buffer.toString('hex');

      expect(hexFromBase64).toBe(hex);
    });
  });

  // ============================================================================
  // 6. ERROR HANDLING TESTS
  // ============================================================================
  describe('Error Handling', () => {
    it('should handle invalid recipient address', () => {
      expect(() => {
        const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });
        psbt.addOutput({
          address: 'invalid_address',
          value: 10000000,
        });
      }).toThrow();
    });

    it('should handle zero or negative amounts', () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      expect(() => {
        psbt.addOutput({
          address: TEST_RECIPIENT,
          value: 0,
        });
      }).toThrow();

      expect(() => {
        psbt.addOutput({
          address: TEST_RECIPIENT,
          value: -1000,
        });
      }).toThrow();
    });

    it('should validate PSBT before finalizing', () => {
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

      // Empty PSBT should not be finalized
      expect(() => {
        psbt.finalizeAllInputs();
      }).toThrow();
    });
  });

  // ============================================================================
  // 7. INTEGRATION TESTS (Requires Regtest Access)
  // ============================================================================
  describe('Integration Tests', () => {
    const skipIfNoIntegration = process.env.INTEGRATION !== 'true';
    let browserWallet: BrowserWalletSetup | null = null;

    afterAll(async () => {
      if (browserWallet) {
        await browserWallet.browser.close();
      }
    });

    it.skip('should send BTC using keystore wallet', async () => {
      // TODO: Requires funded wallet with test mnemonic
      // The test mnemonic needs to be funded on regtest first
      // For now, focus on browser wallet integration test below
      try {
        provider.walletLoadMnemonic(TEST_MNEMONIC, '');

        const sendParams = {
          address: TEST_RECIPIENT,
          amount: 1000000, // 0.01 BTC
          fee_rate: 1,
          lock_alkanes: true,
          auto_confirm: true,
        };

        const result = await provider.walletSend(JSON.stringify(sendParams));
        console.log('[BtcSend] Send result:', result);

        const txid = typeof result === 'string' ? result : result?.txid;
        expect(txid).toBeDefined();
        expect(txid.length).toBe(64); // Bitcoin txid is 64 hex chars
      } catch (e: any) {
        console.error('[BtcSend] Send failed:', e.message);
        throw e;
      }
    }, 60000);

    it.skipIf(skipIfNoIntegration || process.env.SKIP_PUPPETEER === 'true')(
      'should build and broadcast PSBT for browser wallet with Puppeteer',
      async () => {
        // Run with: INTEGRATION=true pnpm test:sdk btc-send
        // Skip Puppeteer: INTEGRATION=true SKIP_PUPPETEER=true pnpm test:sdk btc-send
        // This test runs FULLY AUTONOMOUSLY - it funds the wallet and mines blocks automatically

        console.log('[BtcSend] Setting up Puppeteer browser with mock wallet...');

        browserWallet = await setupBrowserWallet('http://localhost:3000');
        const { page } = browserWallet;

        // Fund the mock wallet address autonomously
        const mockWalletAddress = 'bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x';
        console.log('[BtcSend] Funding mock wallet address:', mockWalletAddress);

        const { execSync } = await import('child_process');
        const path = await import('path');

        // Generate blocks to the mock wallet address
        try {
          // Try common CLI locations
          const cliPaths = [
            path.join(process.env.HOME || '', 'Documents/GitHub/alkanes-rs-dev/target/release/alkanes-cli'),
            path.join(process.env.HOME || '', 'alkanes-rs-dev/target/release/alkanes-cli'),
            'alkanes-cli', // Check if it's in PATH
          ];

          let mined = false;
          for (const cliPath of cliPaths) {
            try {
              const mineOutput = execSync(
                `${cliPath} -p subfrost-regtest bitcoind generatetoaddress 101 ${mockWalletAddress}`,
                { encoding: 'utf8', stdio: 'pipe' }
              );
              console.log('[BtcSend] Mined 101 blocks to mock wallet using:', cliPath);
              mined = true;
              break;
            } catch (e: any) {
              // Try next path
              continue;
            }
          }

          if (!mined) {
            console.warn('[BtcSend] Could not find alkanes-cli in any expected location');
          }
        } catch (e: any) {
          console.warn('[BtcSend] Mining failed:', e.message);
        }

        // Wait for indexer to process blocks
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('[BtcSend] Navigating to wallet and initiating send...');

        // Send BTC using browser wallet
        const txid = await sendBtcWithBrowserWallet(page, {
          recipient: TEST_RECIPIENT,
          amount: '0.01',
          feeRate: 1,
        });

        console.log('[BtcSend] Transaction broadcast, txid:', txid);

        expect(txid).toBeDefined();
        expect(txid.length).toBe(64); // Bitcoin txid is 64 hex chars
      },
      180000
    );
  });
});
