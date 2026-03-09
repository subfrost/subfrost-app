/**
 * SendModal BTC Send — PSBT Construction & Logic Tests
 *
 * Tests the core BTC send logic extracted from SendModal.tsx:
 * - Source code analysis (structural assertions on SendModal.tsx)
 * - Functional PSBT construction with real bitcoinjs-lib
 * - UTXO filtering logic
 * - Fee warning logic
 *
 * Does NOT test the React component (no DOM rendering needed).
 * Uses vitest + bitcoinjs-lib (no WASM required).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import * as fs from 'fs';
import * as path from 'path';
import { getBitcoinNetwork } from '@/lib/alkanes/helpers';
import { computeSendFee, estimateSelectionFee, DUST_THRESHOLD } from '@alkanes/ts-sdk';

// ---------- Setup ----------

// Initialize ECC immediately at module level (before any p2tr/p2wpkh calls)
bitcoin.initEccLib(ecc);

const REGTEST = bitcoin.networks.regtest;

// Generate deterministic keypairs for testing
function makeKeyPair(seed: number) {
  // Create a 32-byte private key from seed
  const privKey = Buffer.alloc(32, 0);
  privKey.writeUInt32BE(seed + 1, 28); // non-zero
  const pubKey = Buffer.from(ecc.pointFromScalar(privKey)!);
  const xOnlyPubKey = pubKey.slice(1, 33); // x-only (32 bytes)
  return { privKey, pubKey, xOnlyPubKey };
}

const taprootKP = makeKeyPair(1);
const segwitKP = makeKeyPair(2);

// Derive addresses
const taprootAddress = bitcoin.payments.p2tr({
  internalPubkey: taprootKP.xOnlyPubKey,
  network: REGTEST,
}).address!;

const segwitPayment = bitcoin.payments.p2wpkh({
  pubkey: segwitKP.pubKey,
  network: REGTEST,
});
const segwitAddress = segwitPayment.address!;

// Recipient address (another taproot)
const recipientKP = makeKeyPair(3);
const recipientAddress = bitcoin.payments.p2tr({
  internalPubkey: recipientKP.xOnlyPubKey,
  network: REGTEST,
}).address!;

// Helper: create a fake previous transaction that pays to a given address
function createFundingTx(address: string, valueSats: number): bitcoin.Transaction {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  // Dummy input
  tx.addInput(Buffer.alloc(32, 0xab), 0);
  // Output paying to address
  const outputScript = bitcoin.address.toOutputScript(address, REGTEST);
  tx.addOutput(outputScript, BigInt(valueSats));
  return tx;
}

// ---------- 1. Source Code Analysis ----------

describe('Source code analysis — SendModal.tsx', () => {
  const sendModalPath = path.resolve(
    __dirname,
    '..',
    'SendModal.tsx'
  );
  const source = fs.readFileSync(sendModalPath, 'utf-8');

  it('sets tapInternalKey for taproot inputs (bc1p/tb1p/bcrt1p)', () => {
    // The source must detect taproot addresses and attach tapInternalKey
    expect(source).toContain('isTaprootInput');
    expect(source).toContain('tapInternalKey');
    // Specific pattern: tapInternalKey is added conditionally for taproot inputs
    expect(source).toMatch(/if\s*\(\s*isTaprootInput\s*&&\s*tapInternalKey\s*\)/);
    expect(source).toContain('inputData.tapInternalKey = tapInternalKey');
  });

  it('aggregates UTXOs from both segwit and taproot addresses', () => {
    // allBtcAddresses should include both paymentAddress and taprootAddress
    expect(source).toContain(
      'const allBtcAddresses = [paymentAddress, taprootAddress].filter(Boolean)'
    );
    // UTXO filtering includes both addresses
    expect(source).toContain('allBtcAddresses.includes(utxo.address)');
  });

  it('has fee warning logic with feeWarningAcknowledged state', () => {
    // State declaration
    expect(source).toContain('feeWarningAcknowledged');
    expect(source).toContain('useState(false)');
    // The guard that prevents re-triggering after acknowledgment
    expect(source).toContain('!feeWarningAcknowledged');
    // Acknowledging sets the flag
    expect(source).toContain('setFeeWarningAcknowledged(true)');
    // Resets when modal closes
    expect(source).toContain('setFeeWarningAcknowledged(false)');
  });

  it('has smart finalization: try extractTransaction first, fallback to finalizeAllInputs', () => {
    // The pattern: try extract first (for pre-finalized PSBTs like UniSat autoFinalized)
    expect(source).toContain('signedPsbt.extractTransaction()');
    expect(source).toContain('signedPsbt.finalizeAllInputs()');
    // The try-catch pattern for smart finalization
    expect(source).toMatch(/try\s*\{[^}]*extractTransaction[^}]*\}\s*catch/s);
  });

  it('fetches UTXOs via esplora REST API (not JSON-RPC)', () => {
    // Must use /api/esplora/ proxy, not JSON-RPC
    expect(source).toContain('/api/esplora/address/');
    expect(source).toContain('/utxo?network=');
  });

  it('excludes inscriptions, runes, and alkanes from BTC UTXO selection', () => {
    expect(source).toContain('utxo.inscriptions && utxo.inscriptions.length > 0');
    expect(source).toContain('utxo.runes && Object.keys(utxo.runes).length > 0');
    expect(source).toContain('utxo.alkanes && Object.keys(utxo.alkanes).length > 0');
  });

  it('normalizes bech32 addresses to lowercase', () => {
    expect(source).toContain('normalizedRecipientAddress');
    // Bech32 normalization present
    expect(source).toMatch(/\.toLowerCase\(\)/);
  });

  it('uses computeSendFee from SDK for fee calculation', () => {
    expect(source).toContain('computeSendFee');
    expect(source).toContain("import { computeSendFee, estimateSelectionFee, DUST_THRESHOLD } from '@alkanes/ts-sdk'");
  });
});

// ---------- 2. Functional PSBT Construction Tests ----------

describe('Functional PSBT construction', () => {
  // Create funding transactions for our test UTXOs
  const taprootFundingTx1 = createFundingTx(taprootAddress, 50000);
  const taprootFundingTx2 = createFundingTx(taprootAddress, 30000);
  const segwitFundingTx = createFundingTx(segwitAddress, 20000);

  it('builds a PSBT with 2 taproot inputs + 1 segwit input', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // Input 0: Taproot
    psbt.addInput({
      hash: taprootFundingTx1.getHash(),
      index: 0,
      witnessUtxo: {
        script: taprootFundingTx1.outs[0].script,
        value: BigInt(50000),
      },
      tapInternalKey: taprootKP.xOnlyPubKey,
    });

    // Input 1: Taproot
    psbt.addInput({
      hash: taprootFundingTx2.getHash(),
      index: 0,
      witnessUtxo: {
        script: taprootFundingTx2.outs[0].script,
        value: BigInt(30000),
      },
      tapInternalKey: taprootKP.xOnlyPubKey,
    });

    // Input 2: Segwit (no tapInternalKey)
    psbt.addInput({
      hash: segwitFundingTx.getHash(),
      index: 0,
      witnessUtxo: {
        script: segwitFundingTx.outs[0].script,
        value: BigInt(20000),
      },
    });

    expect(psbt.txInputs.length).toBe(3);
    expect(psbt.data.inputs.length).toBe(3);
  });

  it('tapInternalKey is only present on taproot inputs, not segwit', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // Taproot input
    psbt.addInput({
      hash: taprootFundingTx1.getHash(),
      index: 0,
      witnessUtxo: {
        script: taprootFundingTx1.outs[0].script,
        value: BigInt(50000),
      },
      tapInternalKey: taprootKP.xOnlyPubKey,
    });

    // Segwit input (no tapInternalKey)
    psbt.addInput({
      hash: segwitFundingTx.getHash(),
      index: 0,
      witnessUtxo: {
        script: segwitFundingTx.outs[0].script,
        value: BigInt(20000),
      },
    });

    // Taproot input has tapInternalKey
    expect(psbt.data.inputs[0].tapInternalKey).toBeDefined();
    expect(Buffer.from(psbt.data.inputs[0].tapInternalKey!)).toEqual(
      taprootKP.xOnlyPubKey
    );

    // Segwit input does NOT have tapInternalKey
    expect(psbt.data.inputs[1].tapInternalKey).toBeUndefined();
  });

  it('witnessUtxo scripts match the address type', () => {
    const psbt = new bitcoin.Psbt({ network: REGTEST });

    const taprootScript = taprootFundingTx1.outs[0].script;
    const segwitScript = segwitFundingTx.outs[0].script;

    psbt.addInput({
      hash: taprootFundingTx1.getHash(),
      index: 0,
      witnessUtxo: { script: taprootScript, value: BigInt(50000) },
      tapInternalKey: taprootKP.xOnlyPubKey,
    });

    psbt.addInput({
      hash: segwitFundingTx.getHash(),
      index: 0,
      witnessUtxo: { script: segwitScript, value: BigInt(20000) },
    });

    // Taproot script: OP_1 <32-byte-pubkey> (version 1 witness program)
    const inp0Script = psbt.data.inputs[0].witnessUtxo!.script;
    expect(inp0Script[0]).toBe(0x51); // OP_1
    expect(inp0Script[1]).toBe(0x20); // 32 bytes push
    expect(inp0Script.length).toBe(34);

    // Segwit script: OP_0 <20-byte-hash> (version 0 witness program)
    const inp1Script = psbt.data.inputs[1].witnessUtxo!.script;
    expect(inp1Script[0]).toBe(0x00); // OP_0
    expect(inp1Script[1]).toBe(0x14); // 20 bytes push
    expect(inp1Script.length).toBe(22);
  });

  it('output amounts: recipient + change = totalInput - fee', () => {
    const totalInputValue = 100000; // 50k + 30k + 20k
    const sendAmount = 60000;
    const feeRate = 2; // sat/vB

    const feeResult = computeSendFee({
      inputCount: 3,
      sendAmount,
      totalInputValue,
      feeRate,
    });

    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // Add 3 inputs
    psbt.addInput({
      hash: taprootFundingTx1.getHash(),
      index: 0,
      witnessUtxo: {
        script: taprootFundingTx1.outs[0].script,
        value: BigInt(50000),
      },
      tapInternalKey: taprootKP.xOnlyPubKey,
    });
    psbt.addInput({
      hash: taprootFundingTx2.getHash(),
      index: 0,
      witnessUtxo: {
        script: taprootFundingTx2.outs[0].script,
        value: BigInt(30000),
      },
      tapInternalKey: taprootKP.xOnlyPubKey,
    });
    psbt.addInput({
      hash: segwitFundingTx.getHash(),
      index: 0,
      witnessUtxo: {
        script: segwitFundingTx.outs[0].script,
        value: BigInt(20000),
      },
    });

    // Add recipient output
    psbt.addOutput({
      address: recipientAddress,
      value: BigInt(sendAmount),
    });

    // Add change output if applicable
    if (feeResult.numOutputs === 2 && feeResult.change > 0) {
      psbt.addOutput({
        address: segwitAddress,
        value: BigInt(feeResult.change),
      });
    }

    // Verify fee = totalInput - (send + change)
    const outputTotal = psbt.txOutputs.reduce(
      (sum, o) => sum + Number(o.value),
      0
    );
    const actualFee = totalInputValue - outputTotal;

    expect(actualFee).toBe(feeResult.fee);
    expect(actualFee).toBeGreaterThan(0);
    expect(actualFee).toBeLessThan(totalInputValue);
  });

  it('change goes to the designated change address', () => {
    const totalInputValue = 100000;
    const sendAmount = 50000;
    const feeRate = 1;

    const feeResult = computeSendFee({
      inputCount: 1,
      sendAmount,
      totalInputValue,
      feeRate,
    });

    const psbt = new bitcoin.Psbt({ network: REGTEST });

    // Single large input
    const largeFundingTx = createFundingTx(taprootAddress, totalInputValue);
    psbt.addInput({
      hash: largeFundingTx.getHash(),
      index: 0,
      witnessUtxo: {
        script: largeFundingTx.outs[0].script,
        value: BigInt(totalInputValue),
      },
      tapInternalKey: taprootKP.xOnlyPubKey,
    });

    // Recipient
    psbt.addOutput({
      address: recipientAddress,
      value: BigInt(sendAmount),
    });

    // Change to segwit address (mimicking btcChangeAddress = paymentAddress)
    if (feeResult.numOutputs === 2 && feeResult.change > 0) {
      psbt.addOutput({
        address: segwitAddress,
        value: BigInt(feeResult.change),
      });
    }

    // Verify change output exists and goes to segwit address
    expect(psbt.txOutputs.length).toBe(2);
    const changeOutput = psbt.txOutputs[1];
    expect(changeOutput.address).toBe(segwitAddress);
    expect(Number(changeOutput.value)).toBe(feeResult.change);
  });

  it('no change output when remainder is below dust threshold', () => {
    // Use enough total input so the fee is covered, but change would be sub-dust.
    // With 1 input at feeRate=10, estimated 1-output fee is ~1095 sats.
    // If totalInput=52000, sendAmount=51400, remainder=600 which is above fee
    // but change = 600 - 1095 < 0, so no change output.
    //
    // Strategy: pick values where (totalInput - sendAmount - fee_1output) < DUST_THRESHOLD
    const feeRate = 10;

    // First compute the 2-output fee to understand the boundary
    const twoOutputFee = computeSendFee({
      inputCount: 1,
      sendAmount: 50000,
      totalInputValue: 100000,
      feeRate,
    });

    // Now pick totalInput so that remainder after send+fee is below dust
    // remainder = totalInput - sendAmount - fee_for_1_output
    // We want 0 < remainder < DUST_THRESHOLD
    const sendAmount = 50000;
    const totalInputValue = sendAmount + twoOutputFee.fee + Math.floor(DUST_THRESHOLD / 2);

    const feeResult = computeSendFee({
      inputCount: 1,
      sendAmount,
      totalInputValue,
      feeRate,
    });

    // Should produce 1 output (no change) since potential change is sub-dust
    expect(feeResult.numOutputs).toBe(1);
    expect(feeResult.change).toBe(0);
    // Fee should be positive
    expect(feeResult.fee).toBeGreaterThan(0);
  });
});

// ---------- 3. UTXO Filtering Tests ----------

describe('UTXO filtering logic', () => {
  interface TestUTXO {
    txid: string;
    vout: number;
    value: number;
    address: string;
    status: { confirmed: boolean; block_height?: number };
    inscriptions?: any[];
    runes?: Record<string, any>;
    alkanes?: Record<string, any>;
  }

  const paymentAddr = 'bcrt1qexampleaddr00000000000000000000000segwit';
  const taprootAddr = 'bcrt1pexampletaprootaddr000000000000000000taprt';
  const allBtcAddresses = [paymentAddr, taprootAddr];

  // Replicate the filtering logic from SendModal
  function filterAvailableUtxos(
    utxos: TestUTXO[],
    frozenUtxos: Set<string> = new Set()
  ): TestUTXO[] {
    return utxos.filter((utxo) => {
      if (!utxo.status.confirmed) return false;
      if (!allBtcAddresses.includes(utxo.address)) return false;
      const utxoKey = `${utxo.txid}:${utxo.vout}`;
      if (frozenUtxos.has(utxoKey)) return false;
      if (utxo.inscriptions && utxo.inscriptions.length > 0) return false;
      if (utxo.runes && Object.keys(utxo.runes).length > 0) return false;
      if (utxo.alkanes && Object.keys(utxo.alkanes).length > 0) return false;
      return true;
    });
  }

  const baseUtxos: TestUTXO[] = [
    // Good UTXOs
    {
      txid: 'aaaa',
      vout: 0,
      value: 50000,
      address: paymentAddr,
      status: { confirmed: true, block_height: 100 },
    },
    {
      txid: 'bbbb',
      vout: 0,
      value: 30000,
      address: taprootAddr,
      status: { confirmed: true, block_height: 101 },
    },
    // Unconfirmed
    {
      txid: 'cccc',
      vout: 0,
      value: 10000,
      address: paymentAddr,
      status: { confirmed: false },
    },
    // Has inscriptions
    {
      txid: 'dddd',
      vout: 0,
      value: 546,
      address: taprootAddr,
      status: { confirmed: true },
      inscriptions: [{ id: 'inscr1' }],
    },
    // Has runes
    {
      txid: 'eeee',
      vout: 0,
      value: 546,
      address: taprootAddr,
      status: { confirmed: true },
      runes: { RUNE_X: { amount: '1000' } },
    },
    // Has alkanes
    {
      txid: 'ffff',
      vout: 0,
      value: 546,
      address: taprootAddr,
      status: { confirmed: true },
      alkanes: { 'DIESEL': { amount: '100000000' } },
    },
    // From a different address (should be excluded)
    {
      txid: 'gggg',
      vout: 0,
      value: 25000,
      address: 'bcrt1qotherunknownaddress',
      status: { confirmed: true },
    },
  ];

  it('includes confirmed UTXOs from both segwit and taproot addresses', () => {
    const filtered = filterAvailableUtxos(baseUtxos);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((u) => u.txid)).toEqual(
      expect.arrayContaining(['aaaa', 'bbbb'])
    );
  });

  it('excludes unconfirmed UTXOs', () => {
    const filtered = filterAvailableUtxos(baseUtxos);
    const txids = filtered.map((u) => u.txid);
    expect(txids).not.toContain('cccc');
  });

  it('excludes UTXOs with inscriptions', () => {
    const filtered = filterAvailableUtxos(baseUtxos);
    const txids = filtered.map((u) => u.txid);
    expect(txids).not.toContain('dddd');
  });

  it('excludes UTXOs with runes', () => {
    const filtered = filterAvailableUtxos(baseUtxos);
    const txids = filtered.map((u) => u.txid);
    expect(txids).not.toContain('eeee');
  });

  it('excludes UTXOs with alkanes', () => {
    const filtered = filterAvailableUtxos(baseUtxos);
    const txids = filtered.map((u) => u.txid);
    expect(txids).not.toContain('ffff');
  });

  it('excludes UTXOs from addresses not in allBtcAddresses', () => {
    const filtered = filterAvailableUtxos(baseUtxos);
    const txids = filtered.map((u) => u.txid);
    expect(txids).not.toContain('gggg');
  });

  it('excludes frozen UTXOs', () => {
    const frozen = new Set(['aaaa:0']);
    const filtered = filterAvailableUtxos(baseUtxos, frozen);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].txid).toBe('bbbb');
  });

  it('returns empty array when all UTXOs are excluded', () => {
    const allBad: TestUTXO[] = [
      {
        txid: 'xxxx',
        vout: 0,
        value: 1000,
        address: paymentAddr,
        status: { confirmed: false },
      },
    ];
    const filtered = filterAvailableUtxos(allBad);
    expect(filtered).toHaveLength(0);
  });
});

// ---------- 4. Fee Warning Tests ----------

describe('Fee warning logic', () => {
  // Replicate the checkFeeAndBroadcast warning conditions from SendModal
  interface FeeWarningParams {
    estimatedFeeSats: number;
    amountSats: number;
    feeRateNum: number;
    numInputs: number;
    feeWarningAcknowledged: boolean;
  }

  function shouldShowFeeWarning(params: FeeWarningParams): boolean {
    const { estimatedFeeSats, amountSats, feeRateNum, numInputs, feeWarningAcknowledged } =
      params;

    const feePercentage = (estimatedFeeSats / amountSats) * 100;
    const feeTooHigh = estimatedFeeSats > 0.01 * 100000000; // > 1M sats
    const feeRateTooHigh = feeRateNum > 1000;
    const tooManyInputs = numInputs > 100;
    const feePercentageTooHigh = feePercentage > 2;

    if (
      !feeWarningAcknowledged &&
      (feeTooHigh || feeRateTooHigh || tooManyInputs || feePercentageTooHigh)
    ) {
      return true;
    }
    return false;
  }

  it('triggers warning when fee > 2% of send amount', () => {
    // 1000 sats send, 50 sats fee = 5% > 2%
    expect(
      shouldShowFeeWarning({
        estimatedFeeSats: 50,
        amountSats: 1000,
        feeRateNum: 1,
        numInputs: 1,
        feeWarningAcknowledged: false,
      })
    ).toBe(true);
  });

  it('triggers warning when fee > 0.01 BTC (1,000,000 sats)', () => {
    expect(
      shouldShowFeeWarning({
        estimatedFeeSats: 1_100_000,
        amountSats: 500_000_000, // 5 BTC — fee is only 0.22%, but absolute threshold hit
        feeRateNum: 5,
        numInputs: 10,
        feeWarningAcknowledged: false,
      })
    ).toBe(true);
  });

  it('triggers warning when fee rate > 1000 sat/vB', () => {
    expect(
      shouldShowFeeWarning({
        estimatedFeeSats: 500,
        amountSats: 100_000_000, // fee is 0.0005%, well under 2%
        feeRateNum: 1500,
        numInputs: 1,
        feeWarningAcknowledged: false,
      })
    ).toBe(true);
  });

  it('triggers warning when > 100 inputs', () => {
    expect(
      shouldShowFeeWarning({
        estimatedFeeSats: 500,
        amountSats: 100_000_000,
        feeRateNum: 1,
        numInputs: 150,
        feeWarningAcknowledged: false,
      })
    ).toBe(true);
  });

  it('does NOT trigger when all conditions are below thresholds', () => {
    // 1 BTC send, 200 sats fee (0.0002%), 5 sat/vB, 2 inputs
    expect(
      shouldShowFeeWarning({
        estimatedFeeSats: 200,
        amountSats: 100_000_000,
        feeRateNum: 5,
        numInputs: 2,
        feeWarningAcknowledged: false,
      })
    ).toBe(false);
  });

  it('feeWarningAcknowledged=true prevents re-triggering', () => {
    // Same conditions that would normally trigger (5% fee)
    expect(
      shouldShowFeeWarning({
        estimatedFeeSats: 50,
        amountSats: 1000,
        feeRateNum: 1,
        numInputs: 1,
        feeWarningAcknowledged: true, // User already acknowledged
      })
    ).toBe(false);
  });

  it('feeWarningAcknowledged bypasses ALL warning conditions simultaneously', () => {
    // Every condition triggers: >2%, >0.01 BTC, >1000 sat/vB, >100 inputs
    expect(
      shouldShowFeeWarning({
        estimatedFeeSats: 2_000_000,
        amountSats: 5000, // 40000% fee ratio
        feeRateNum: 5000,
        numInputs: 200,
        feeWarningAcknowledged: true,
      })
    ).toBe(false);
  });
});

// ---------- 5. UTXO Selection Algorithm Tests ----------

describe('UTXO selection algorithm', () => {
  interface SimpleUTXO {
    txid: string;
    vout: number;
    value: number;
  }

  // Replicate the selection logic from handleNext in SendModal
  function selectUtxos(
    availableUtxos: SimpleUTXO[],
    amountSats: number,
    feeRateNum: number
  ): { selected: Set<string>; total: number } | null {
    const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);
    let total = 0;
    const selected = new Set<string>();
    const MAX_UTXOS = 100;

    for (const utxo of sorted) {
      const potentialFee = estimateSelectionFee(selected.size + 1, feeRateNum);
      const needed = amountSats + potentialFee;

      selected.add(`${utxo.txid}:${utxo.vout}`);
      total += utxo.value;

      if (total >= needed + 10000) break; // 10k sats buffer
      if (selected.size >= MAX_UTXOS) break;
    }

    const feeResult = computeSendFee({
      inputCount: selected.size,
      sendAmount: amountSats,
      totalInputValue: total,
      feeRate: feeRateNum,
    });
    const required = amountSats + feeResult.fee;

    if (total < required) return null;
    return { selected, total };
  }

  it('selects largest UTXOs first', () => {
    const utxos: SimpleUTXO[] = [
      { txid: 'small', vout: 0, value: 1000 },
      { txid: 'large', vout: 0, value: 100000 },
      { txid: 'medium', vout: 0, value: 50000 },
    ];
    const result = selectUtxos(utxos, 5000, 1);
    expect(result).not.toBeNull();
    // Should select the largest UTXO first and stop (100k > 5k + fee + 10k buffer)
    expect(result!.selected.size).toBe(1);
    expect(result!.selected.has('large:0')).toBe(true);
  });

  it('selects multiple UTXOs when single is insufficient', () => {
    const utxos: SimpleUTXO[] = [
      { txid: 'a', vout: 0, value: 30000 },
      { txid: 'b', vout: 0, value: 25000 },
      { txid: 'c', vout: 0, value: 20000 },
    ];
    // Need 60000 + fee — single UTXO (30k) is not enough
    const result = selectUtxos(utxos, 60000, 1);
    expect(result).not.toBeNull();
    expect(result!.selected.size).toBeGreaterThanOrEqual(3);
  });

  it('returns null when total balance is insufficient', () => {
    const utxos: SimpleUTXO[] = [
      { txid: 'a', vout: 0, value: 1000 },
      { txid: 'b', vout: 0, value: 2000 },
    ];
    // Need 100k — only have 3k
    const result = selectUtxos(utxos, 100000, 1);
    expect(result).toBeNull();
  });

  it('respects 100 UTXO limit', () => {
    // Create 150 small UTXOs
    const utxos: SimpleUTXO[] = Array.from({ length: 150 }, (_, i) => ({
      txid: `tx${i.toString().padStart(4, '0')}`,
      vout: 0,
      value: 1000,
    }));
    const result = selectUtxos(utxos, 50000, 1);
    // Should not select more than 100
    if (result) {
      expect(result.selected.size).toBeLessThanOrEqual(100);
    }
  });
});

// ---------- 6. Helper Function Tests ----------

describe('getBitcoinNetwork helper', () => {
  it('returns regtest for subfrost-regtest', () => {
    expect(getBitcoinNetwork('subfrost-regtest')).toBe(bitcoin.networks.regtest);
  });

  it('returns mainnet for mainnet', () => {
    expect(getBitcoinNetwork('mainnet')).toBe(bitcoin.networks.bitcoin);
  });

  it('returns testnet for signet', () => {
    expect(getBitcoinNetwork('signet')).toBe(bitcoin.networks.testnet);
  });

  it('defaults to mainnet for unknown networks', () => {
    expect(getBitcoinNetwork('unknown-network')).toBe(bitcoin.networks.bitcoin);
  });
});

describe('Address type detection (from SendModal source)', () => {
  // Replicate detectAddressType from SendModal
  function detectAddressType(address: string): {
    type: 'p2tr' | 'p2wpkh' | 'p2sh' | 'p2pkh' | 'unknown';
    signingMethod: 'taproot' | 'segwit' | 'legacy';
  } {
    const lower = address.toLowerCase();
    if (lower.startsWith('bc1p') || lower.startsWith('tb1p') || lower.startsWith('bcrt1p')) {
      return { type: 'p2tr', signingMethod: 'taproot' };
    }
    if (lower.startsWith('bc1q') || lower.startsWith('tb1q') || lower.startsWith('bcrt1q')) {
      return { type: 'p2wpkh', signingMethod: 'segwit' };
    }
    if (address.startsWith('3') || address.startsWith('2')) {
      return { type: 'p2sh', signingMethod: 'segwit' };
    }
    if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
      return { type: 'p2pkh', signingMethod: 'legacy' };
    }
    return { type: 'unknown', signingMethod: 'taproot' };
  }

  it('detects mainnet taproot', () => {
    expect(detectAddressType('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0').type).toBe('p2tr');
  });

  it('detects regtest taproot', () => {
    expect(detectAddressType('bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648').type).toBe('p2tr');
  });

  it('detects mainnet segwit', () => {
    expect(detectAddressType('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4').type).toBe('p2wpkh');
  });

  it('detects regtest segwit', () => {
    expect(detectAddressType('bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x').type).toBe('p2wpkh');
  });

  it('detects P2SH (mainnet)', () => {
    expect(detectAddressType('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy').type).toBe('p2sh');
  });

  it('detects P2PKH (mainnet)', () => {
    expect(detectAddressType('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2').type).toBe('p2pkh');
  });

  it('returns unknown for invalid addresses', () => {
    expect(detectAddressType('xyz123').type).toBe('unknown');
  });
});

// ---------- 7. computeSendFee SDK Integration ----------

describe('computeSendFee integration', () => {
  it('returns correct structure', () => {
    const result = computeSendFee({
      inputCount: 2,
      sendAmount: 50000,
      totalInputValue: 100000,
      feeRate: 5,
    });

    expect(result).toHaveProperty('fee');
    expect(result).toHaveProperty('change');
    expect(result).toHaveProperty('numOutputs');
    expect(result).toHaveProperty('effectiveFeeRate');
    expect(typeof result.fee).toBe('number');
    expect(typeof result.change).toBe('number');
    expect(result.numOutputs).toBeGreaterThanOrEqual(1);
    expect(result.numOutputs).toBeLessThanOrEqual(2);
  });

  it('fee + change + sendAmount = totalInputValue', () => {
    const totalInputValue = 200000;
    const sendAmount = 100000;
    const result = computeSendFee({
      inputCount: 1,
      sendAmount,
      totalInputValue,
      feeRate: 10,
    });

    expect(sendAmount + result.fee + result.change).toBe(totalInputValue);
  });

  it('fee increases with more inputs', () => {
    const base = computeSendFee({
      inputCount: 1,
      sendAmount: 50000,
      totalInputValue: 100000,
      feeRate: 5,
    });
    const more = computeSendFee({
      inputCount: 10,
      sendAmount: 50000,
      totalInputValue: 100000,
      feeRate: 5,
    });

    expect(more.fee).toBeGreaterThan(base.fee);
  });

  it('fee increases with higher fee rate', () => {
    const low = computeSendFee({
      inputCount: 2,
      sendAmount: 50000,
      totalInputValue: 100000,
      feeRate: 1,
    });
    const high = computeSendFee({
      inputCount: 2,
      sendAmount: 50000,
      totalInputValue: 100000,
      feeRate: 50,
    });

    expect(high.fee).toBeGreaterThan(low.fee);
  });

  it('DUST_THRESHOLD is a reasonable value', () => {
    // Bitcoin Core default dust threshold is 546 for P2PKH, ~330 for P2TR
    expect(DUST_THRESHOLD).toBeGreaterThanOrEqual(294);
    expect(DUST_THRESHOLD).toBeLessThanOrEqual(1000);
  });
});
