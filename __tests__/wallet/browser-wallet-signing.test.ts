/**
 * Browser Wallet Mock Signing Tests
 *
 * Validates that all 11 mock wallet APIs can be installed, return correct
 * addresses, and sign PSBTs using real BIP32 key derivation — all within
 * vitest (no Puppeteer required).
 *
 * These tests verify:
 *   1. Each wallet's connection/address API returns the correct addresses
 *   2. Each wallet's signPsbt produces valid signatures on a test PSBT
 *   3. All 11 wallets can be installed and uninstalled without leaking state
 *   4. Addresses are real bcrt1p/bcrt1q, never symbolic p2tr:0/p2wpkh:0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  installMockWallet,
  uninstallMockWallet,
  ALL_WALLET_IDS,
  type MockWalletAddresses,
} from '../helpers/vitest-mock-wallet';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';

const ECPair = ECPairFactory(ecc);
try {
  bitcoin.initEccLib(ecc);
} catch {
  /* already initialized */
}

const REGTEST = bitcoin.networks.regtest;

// ---------------------------------------------------------------------------
// Helper: create a minimal PSBT with a taproot input that our test key can sign
// ---------------------------------------------------------------------------

function createTestPsbt(addrs: MockWalletAddresses): bitcoin.Psbt {
  const psbt = new bitcoin.Psbt({ network: REGTEST });

  // Create a fake previous output paying to the test taproot address
  const xOnlyPubKey = Buffer.from(addrs.taproot.xOnlyPublicKey, 'hex');
  const taprootPayment = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubKey,
    network: REGTEST,
  });

  const fakeTxId = 'a'.repeat(64); // 32-byte zero-ish txid
  const fakeValue = 100_000;

  // bitcoinjs-lib v7+ expects script as Uint8Array and value as bigint
  const scriptOutput = taprootPayment.output!;
  const scriptUint8 = new Uint8Array(scriptOutput.buffer, scriptOutput.byteOffset, scriptOutput.byteLength);

  psbt.addInput({
    hash: fakeTxId,
    index: 0,
    witnessUtxo: {
      script: scriptUint8,
      value: BigInt(fakeValue),
    },
    tapInternalKey: xOnlyPubKey,
  } as any);

  // Output: send most of the value to a random address, keeping some for fee
  psbt.addOutput({
    address: addrs.taproot.address,
    value: BigInt(fakeValue - 1000),
  } as any);

  return psbt;
}

/**
 * Verify that a signed PSBT hex has at least one taproot key-path signature.
 */
function psbtHasTaprootSignature(signedHex: string): boolean {
  const psbt = bitcoin.Psbt.fromHex(signedHex, { network: REGTEST });
  const input = psbt.data.inputs[0];
  // A taproot key-path signature is stored in tapKeySig
  return !!input?.tapKeySig && input.tapKeySig.length > 0;
}

function psbtBase64HasTaprootSignature(signedBase64: string): boolean {
  const hex = Buffer.from(signedBase64, 'base64').toString('hex');
  return psbtHasTaprootSignature(hex);
}

// ---------------------------------------------------------------------------
// Primary wallet tests
// ---------------------------------------------------------------------------

describe('Browser Wallet Mock Signing', () => {
  describe('OYL wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('oyl');
    });
    afterEach(() => {
      uninstallMockWallet('oyl');
    });

    it('should connect and return addresses', async () => {
      const oyl = (globalThis as any).oyl;
      expect(oyl).toBeDefined();

      const result = await oyl.getAddresses();
      expect(result.taproot.address).toBe(addrs.taproot.address);
      expect(result.taproot.publicKey).toBe(addrs.taproot.publicKey);
      expect(result.nativeSegwit.address).toBe(addrs.nativeSegwit.address);
      expect(result.nativeSegwit.publicKey).toBe(addrs.nativeSegwit.publicKey);
    });

    it('should report isConnected', async () => {
      const oyl = (globalThis as any).oyl;
      expect(await oyl.isConnected()).toBe(true);
    });

    it('should sign a PSBT (hex object format)', async () => {
      const oyl = (globalThis as any).oyl;
      const psbt = createTestPsbt(addrs);
      const result = await oyl.signPsbt({ psbt: psbt.toHex() });
      expect(result).toHaveProperty('psbt');
      expect(psbtHasTaprootSignature(result.psbt)).toBe(true);
    });

    it('should sign a PSBT (bare hex string)', async () => {
      const oyl = (globalThis as any).oyl;
      const psbt = createTestPsbt(addrs);
      const result = await oyl.signPsbt(psbt.toHex());
      expect(result).toHaveProperty('psbt');
      expect(psbtHasTaprootSignature(result.psbt)).toBe(true);
    });
  });

  describe('Xverse wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('xverse');
    });
    afterEach(() => {
      uninstallMockWallet('xverse');
    });

    it('should connect and return addresses via getAddresses', async () => {
      const provider = (globalThis as any).XverseProviders?.BitcoinProvider;
      expect(provider).toBeDefined();

      const result = await provider.request('getAddresses', {});
      expect(result.result.addresses).toHaveLength(2);
      expect(result.result.addresses[0].address).toBe(addrs.taproot.address);
      expect(result.result.addresses[1].address).toBe(
        addrs.nativeSegwit.address
      );
    });

    it('should connect and return accounts via getAccounts', async () => {
      const provider = (globalThis as any).XverseProviders?.BitcoinProvider;
      const result = await provider.request('getAccounts', {});
      expect(result.result).toHaveLength(2);
      expect(result.result[0].addressType).toBe('p2tr');
      expect(result.result[1].addressType).toBe('p2wpkh');
    });

    it('should sign a PSBT (base64 format)', async () => {
      const provider = (globalThis as any).XverseProviders?.BitcoinProvider;
      const psbt = createTestPsbt(addrs);
      const psbtBase64 = psbt.toBase64();

      const result = await provider.request('signPsbt', {
        psbt: psbtBase64,
        signInputs: {},
        broadcast: false,
      });

      expect(result.result).toHaveProperty('psbt');
      expect(psbtBase64HasTaprootSignature(result.result.psbt)).toBe(true);
    });
  });

  describe('UniSat wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('unisat');
    });
    afterEach(() => {
      uninstallMockWallet('unisat');
    });

    it('should connect and return taproot address', async () => {
      const unisat = (globalThis as any).unisat;
      expect(unisat).toBeDefined();

      const accounts = await unisat.requestAccounts();
      expect(accounts).toEqual([addrs.taproot.address]);

      const existingAccounts = await unisat.getAccounts();
      expect(existingAccounts).toEqual([addrs.taproot.address]);

      const pubKey = await unisat.getPublicKey();
      expect(pubKey).toBe(addrs.taproot.publicKey);
    });

    it('should sign a PSBT (hex format)', async () => {
      const unisat = (globalThis as any).unisat;
      const psbt = createTestPsbt(addrs);

      const signedHex = await unisat.signPsbt(psbt.toHex(), {
        autoFinalized: false,
        toSignInputs: [{ index: 0, address: addrs.taproot.address }],
      });

      expect(typeof signedHex).toBe('string');
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });

    it('should sign multiple PSBTs via signPsbts', async () => {
      const unisat = (globalThis as any).unisat;
      const psbt1 = createTestPsbt(addrs);
      const psbt2 = createTestPsbt(addrs);

      const signedArr = await unisat.signPsbts(
        [psbt1.toHex(), psbt2.toHex()],
        {
          autoFinalized: false,
          toSignInputs: [{ index: 0, address: addrs.taproot.address }],
        }
      );

      expect(signedArr).toHaveLength(2);
      expect(psbtHasTaprootSignature(signedArr[0])).toBe(true);
      expect(psbtHasTaprootSignature(signedArr[1])).toBe(true);
    });
  });

  describe('OKX wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('okx');
    });
    afterEach(() => {
      uninstallMockWallet('okx');
    });

    it('should connect and return address', async () => {
      const okx = (globalThis as any).okxwallet;
      expect(okx).toBeDefined();

      const result = await okx.bitcoin.connect();
      expect(result.address).toBe(addrs.taproot.address);
      expect(result.publicKey).toBe(addrs.taproot.publicKey);
    });

    it('should also be accessible via window.okx', async () => {
      const okx = (globalThis as any).okx;
      expect(okx).toBeDefined();
      const result = await okx.bitcoin.connect();
      expect(result.address).toBe(addrs.taproot.address);
    });

    it('should sign a PSBT (hex format)', async () => {
      const okx = (globalThis as any).okxwallet;
      const psbt = createTestPsbt(addrs);

      const signedHex = await okx.bitcoin.signPsbt(psbt.toHex(), {
        auto_finalized: false,
      });

      expect(typeof signedHex).toBe('string');
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Secondary wallets — connection + signing
  // -------------------------------------------------------------------------

  describe('Phantom wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('phantom');
    });
    afterEach(() => {
      uninstallMockWallet('phantom');
    });

    it('should connect and return taproot address', async () => {
      const phantom = (globalThis as any).phantom;
      const accounts = await phantom.bitcoin.requestAccounts();
      expect(accounts[0].address).toBe(addrs.taproot.address);
    });

    it('should sign a PSBT', async () => {
      const phantom = (globalThis as any).phantom;
      const psbt = createTestPsbt(addrs);
      const signedHex = await phantom.bitcoin.signPsbt(psbt.toHex());
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });
  });

  describe('Leather wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('leather');
    });
    afterEach(() => {
      uninstallMockWallet('leather');
    });

    it('should connect and return addresses', async () => {
      const leather = (globalThis as any).LeatherProvider;
      const result = await leather.request('getAddresses', {});
      expect(result.result.addresses).toHaveLength(2);
      expect(result.result.addresses[0].type).toBe('p2tr');
    });

    it('should sign a PSBT', async () => {
      const leather = (globalThis as any).LeatherProvider;
      const psbt = createTestPsbt(addrs);
      const result = await leather.request('signPsbt', {
        hex: psbt.toHex(),
      });
      expect(psbtHasTaprootSignature(result.result.hex)).toBe(true);
    });
  });

  describe('Magic Eden wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('magic-eden');
    });
    afterEach(() => {
      uninstallMockWallet('magic-eden');
    });

    it('should connect and return addresses', async () => {
      const me = (globalThis as any).magicEden;
      const result = await me.bitcoin.connect();
      expect(result.addresses).toHaveLength(2);
      expect(result.addresses[0].addressType).toBe('p2tr');
    });

    it('should sign a PSBT', async () => {
      const me = (globalThis as any).magicEden;
      const psbt = createTestPsbt(addrs);
      const signedHex = await me.bitcoin.signPsbt(psbt.toHex());
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });
  });

  describe('Orange wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('orange');
    });
    afterEach(() => {
      uninstallMockWallet('orange');
    });

    it('should connect and return addresses', async () => {
      const orange = (globalThis as any).OrangeBitcoinProvider;
      const result = await orange.connect();
      expect(result.addresses).toHaveLength(2);
    });

    it('should be accessible via nested providers', () => {
      expect((globalThis as any).OrangeWalletProviders).toBeDefined();
      expect(
        (globalThis as any).OrangeWalletProviders.OrangeBitcoinProvider
      ).toBeDefined();
      expect(
        (globalThis as any).OrangecryptoProviders.BitcoinProvider
      ).toBeDefined();
    });

    it('should sign a PSBT', async () => {
      const orange = (globalThis as any).OrangeBitcoinProvider;
      const psbt = createTestPsbt(addrs);
      const signedHex = await orange.signPsbt(psbt.toHex());
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });
  });

  describe('Tokeo wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('tokeo');
    });
    afterEach(() => {
      uninstallMockWallet('tokeo');
    });

    it('should connect and return accounts', async () => {
      const tokeo = (globalThis as any).tokeo;
      const accounts = await tokeo.bitcoin.requestAccounts();
      expect(accounts).toEqual([addrs.taproot.address]);

      const detailed = await tokeo.bitcoin.getAccounts();
      expect(detailed.accounts).toHaveLength(2);
    });

    it('should sign a PSBT', async () => {
      const tokeo = (globalThis as any).tokeo;
      const psbt = createTestPsbt(addrs);
      const signedHex = await tokeo.bitcoin.signPsbt(psbt.toHex());
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });
  });

  describe('Wizz wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('wizz');
    });
    afterEach(() => {
      uninstallMockWallet('wizz');
    });

    it('should connect and return segwit address', async () => {
      const wizz = (globalThis as any).wizz;
      const accounts = await wizz.requestAccounts();
      expect(accounts).toEqual([addrs.nativeSegwit.address]);
    });

    it('should sign a PSBT', async () => {
      const wizz = (globalThis as any).wizz;
      const psbt = createTestPsbt(addrs);
      const signedHex = await wizz.signPsbt(psbt.toHex());
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });
  });

  describe('Keplr wallet', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('keplr');
    });
    afterEach(() => {
      uninstallMockWallet('keplr');
    });

    it('should connect and return taproot address', async () => {
      const keplr = (globalThis as any).keplr;
      const accounts = await keplr.bitcoin.requestAccounts();
      expect(accounts).toEqual([addrs.taproot.address]);
    });

    it('should be accessible via bitcoin_keplr alias', async () => {
      const bk = (globalThis as any).bitcoin_keplr;
      expect(bk).toBeDefined();
      const accounts = await bk.requestAccounts();
      expect(accounts).toEqual([addrs.taproot.address]);
    });

    it('should sign a PSBT', async () => {
      const keplr = (globalThis as any).keplr;
      const psbt = createTestPsbt(addrs);
      const signedHex = await keplr.bitcoin.signPsbt(psbt.toHex());
      expect(psbtHasTaprootSignature(signedHex)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-wallet tests
  // -------------------------------------------------------------------------

  describe('All wallets', () => {
    it('should install and uninstall all 11 wallet mocks', () => {
      expect(ALL_WALLET_IDS).toHaveLength(11);

      for (const id of ALL_WALLET_IDS) {
        const addrs = installMockWallet(id);
        expect(addrs.taproot.address).toMatch(/^bcrt1p/);
        expect(addrs.nativeSegwit.address).toMatch(/^bcrt1q/);
        expect(addrs.taproot.xOnlyPublicKey).toHaveLength(64); // 32 bytes hex
        expect(addrs.taproot.publicKey).toHaveLength(66); // 33 bytes hex (compressed)
        uninstallMockWallet(id);
      }
    });

    it('should clean up globalThis after uninstall', () => {
      installMockWallet('oyl');
      expect((globalThis as any).oyl).toBeDefined();
      uninstallMockWallet('oyl');
      expect((globalThis as any).oyl).toBeUndefined();
    });

    it('should not leak state between wallet installs', () => {
      installMockWallet('oyl');
      expect((globalThis as any).oyl).toBeDefined();
      expect((globalThis as any).unisat).toBeUndefined();
      uninstallMockWallet('oyl');

      installMockWallet('unisat');
      expect((globalThis as any).unisat).toBeDefined();
      expect((globalThis as any).oyl).toBeUndefined();
      uninstallMockWallet('unisat');
    });

    it('should support multiple wallets installed simultaneously', () => {
      const oylAddrs = installMockWallet('oyl');
      const unisatAddrs = installMockWallet('unisat');

      expect((globalThis as any).oyl).toBeDefined();
      expect((globalThis as any).unisat).toBeDefined();

      // Both derive from same mnemonic, so addresses should match
      expect(oylAddrs.taproot.address).toBe(unisatAddrs.taproot.address);

      uninstallMockWallet('oyl');
      uninstallMockWallet('unisat');
    });
  });

  // -------------------------------------------------------------------------
  // Address safety
  // -------------------------------------------------------------------------

  describe('Address Safety', () => {
    it('should use actual bcrt1 addresses, never symbolic p2tr:0', () => {
      const addrs = installMockWallet('oyl');

      expect(addrs.taproot.address).not.toBe('p2tr:0');
      expect(addrs.taproot.address).not.toContain(':');
      expect(addrs.nativeSegwit.address).not.toBe('p2wpkh:0');
      expect(addrs.nativeSegwit.address).not.toContain(':');

      expect(addrs.taproot.address).toMatch(/^bcrt1p[a-z0-9]{58}$/);
      expect(addrs.nativeSegwit.address).toMatch(/^bcrt1q[a-z0-9]+$/);

      uninstallMockWallet('oyl');
    });

    it('should derive consistent addresses from the same mnemonic', () => {
      const addrs1 = installMockWallet('oyl');
      uninstallMockWallet('oyl');

      const addrs2 = installMockWallet('xverse');
      uninstallMockWallet('xverse');

      // Same mnemonic => same addresses regardless of wallet type
      expect(addrs1.taproot.address).toBe(addrs2.taproot.address);
      expect(addrs1.nativeSegwit.address).toBe(addrs2.nativeSegwit.address);
      expect(addrs1.taproot.publicKey).toBe(addrs2.taproot.publicKey);
    });

    it('should derive different addresses from different mnemonics', () => {
      const addrs1 = installMockWallet('oyl');
      uninstallMockWallet('oyl');

      const altMnemonic =
        'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
      const addrs2 = installMockWallet('oyl', altMnemonic);
      uninstallMockWallet('oyl');

      expect(addrs1.taproot.address).not.toBe(addrs2.taproot.address);
      expect(addrs1.nativeSegwit.address).not.toBe(
        addrs2.nativeSegwit.address
      );
    });
  });

  // -------------------------------------------------------------------------
  // PSBT signing validation
  // -------------------------------------------------------------------------

  describe('PSBT Signing Integrity', () => {
    let addrs: MockWalletAddresses;

    beforeEach(() => {
      addrs = installMockWallet('oyl');
    });
    afterEach(() => {
      uninstallMockWallet('oyl');
    });

    it('should produce a valid taproot key-path signature', async () => {
      const psbt = createTestPsbt(addrs);
      const oyl = (globalThis as any).oyl;
      const result = await oyl.signPsbt({ psbt: psbt.toHex() });

      const signedPsbt = bitcoin.Psbt.fromHex(result.psbt, {
        network: REGTEST,
      });
      const input = signedPsbt.data.inputs[0];

      // tapKeySig should be a 64-byte Schnorr signature
      expect(input.tapKeySig).toBeDefined();
      expect(input.tapKeySig!.length).toBe(64);
    });

    it('should not finalize the PSBT', async () => {
      const psbt = createTestPsbt(addrs);
      const oyl = (globalThis as any).oyl;
      const result = await oyl.signPsbt({ psbt: psbt.toHex() });

      const signedPsbt = bitcoin.Psbt.fromHex(result.psbt, {
        network: REGTEST,
      });
      const input = signedPsbt.data.inputs[0];

      // Should NOT be finalized (no finalScriptWitness)
      expect(input.finalScriptWitness).toBeUndefined();
    });

    it('should produce a finalizable PSBT', async () => {
      const psbt = createTestPsbt(addrs);
      const oyl = (globalThis as any).oyl;
      const result = await oyl.signPsbt({ psbt: psbt.toHex() });

      const signedPsbt = bitcoin.Psbt.fromHex(result.psbt, {
        network: REGTEST,
      });

      // Should succeed without throwing
      signedPsbt.finalizeAllInputs();

      // After finalization, should be able to extract the transaction
      const tx = signedPsbt.extractTransaction();
      expect(tx.getId()).toHaveLength(64);
    });
  });
});
