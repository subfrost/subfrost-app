// @ts-nocheck
/**
 * Direct test for wrapping BTC to frBTC using the SDK
 *
 * This bypasses the UI and directly tests the wrap functionality.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as tinysecp from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';

// Initialize ECC library
bitcoin.initEccLib(tinysecp);

// Known test wallet
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const REGTEST_RPC = 'http://localhost:18888';
const TEST_ADDRESS = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';

// frBTC signer pubkey (x-only, 32 bytes) - queried from contract via opcode 103
const FRBTC_SIGNER_PUBKEY = Buffer.from('7940ef3b659179a1371dec05793cb027cde47806fb66ce1e3d1b69d56de629dc', 'hex');

// Helper to derive signer address from x-only pubkey
function getSignerAddress(network: bitcoin.networks.Network): string {
  const { address } = bitcoin.payments.p2tr({
    internalPubkey: FRBTC_SIGNER_PUBKEY,
    network
  });
  return address!;
}

// LEB128 encoding
function encodeLeb128(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = Number(remaining & BigInt(0x7f));
    remaining >>= BigInt(7);
    if (remaining !== BigInt(0)) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining !== BigInt(0));
  return new Uint8Array(bytes);
}

// Build wrap calldata
function buildWrapCalldata(wrapAmount: number): Buffer {
  const parts: Uint8Array[] = [];

  // Protocol tag (1 = alkanes protorunes)
  parts.push(encodeLeb128(BigInt(1)));

  // Target contract: alkane ID 32:0
  parts.push(encodeLeb128(BigInt(32)));
  parts.push(encodeLeb128(BigInt(0)));

  // Method opcode: 0 (wrap)
  parts.push(encodeLeb128(BigInt(0)));

  // Wrap amount in sats
  parts.push(encodeLeb128(BigInt(wrapAmount)));

  const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
  const calldata = Buffer.alloc(totalLength);
  let offset = 0;
  for (const part of parts) {
    calldata.set(part, offset);
    offset += part.length;
  }

  return calldata;
}

// Build OP_RETURN output
function buildOpReturnOutput(calldata: Buffer): Buffer {
  const pushOp = calldata.length < 76 ? Buffer.from([calldata.length]) :
                 calldata.length < 256 ? Buffer.from([0x4c, calldata.length]) :
                 Buffer.from([0x4d, calldata.length & 0xff, (calldata.length >> 8) & 0xff]);

  return Buffer.concat([
    Buffer.from([0x6a]), // OP_RETURN
    pushOp,
    calldata
  ]);
}

async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(REGTEST_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
  }
  return data.result;
}

async function getUtxos(address: string): Promise<any[]> {
  return await rpcCall('esplora_address::utxo', [address]);
}

async function getRawTx(txid: string): Promise<string> {
  return await rpcCall('btc_getrawtransaction', [txid, false]);
}

async function sendRawTx(hex: string): Promise<string> {
  return await rpcCall('btc_sendrawtransaction', [hex]);
}

async function getAlkaneBalance(address: string, alkaneId: string): Promise<any> {
  try {
    const result = await rpcCall('alkanes_getbalance', [address, alkaneId]);
    return result;
  } catch (e) {
    return { balance: '0' };
  }
}

async function main() {
  console.log('=== BTC to frBTC Wrap Test ===\n');

  // Step 1: Check current balances
  console.log('1. Checking current balances...');
  const utxos = await getUtxos(TEST_ADDRESS);
  const totalBtc = utxos.reduce((sum: number, u: any) => sum + u.value, 0);
  console.log(`   BTC balance: ${totalBtc / 1e8} BTC (${totalBtc} sats)`);
  console.log(`   UTXOs: ${utxos.length}`);

  if (utxos.length === 0) {
    console.log('   ERROR: No UTXOs available for wrap!');
    return;
  }

  // Check frBTC balance before
  const frbtcBefore = await getAlkaneBalance(TEST_ADDRESS, '32:0');
  console.log(`   frBTC balance before: ${frbtcBefore?.balance || '0'}`);

  // Step 2: Build wrap transaction
  console.log('\n2. Building wrap transaction...');

  const wrapAmount = 10000000; // 0.1 BTC = 10M sats
  const feeRate = 10; // sats/vB

  console.log(`   Wrap amount: ${wrapAmount / 1e8} BTC`);

  // Select oldest (most confirmed) UTXO by sorting by block height ascending
  const sortedUtxos = utxos.sort((a: any, b: any) =>
    (a.status?.block_height || 0) - (b.status?.block_height || 0)
  );
  const utxo = sortedUtxos[0];
  console.log(`   Using UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);

  // Build calldata
  const calldata = buildWrapCalldata(wrapAmount);
  console.log(`   Calldata (hex): ${calldata.toString('hex')}`);

  // Create PSBT
  const network = bitcoin.networks.regtest;
  const psbt = new bitcoin.Psbt({ network });

  // Get raw tx for witness data
  const rawTxHex = await getRawTx(utxo.txid);
  const rawTx = bitcoin.Transaction.fromHex(rawTxHex);

  // Derive key from mnemonic
  const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);

  const bip32 = BIP32Factory(tinysecp);
  const root = bip32.fromSeed(seed, network);

  // BIP86 path for taproot on regtest: m/86'/1'/0'/0/0 (coin type 1 for regtest/testnet)
  const path = "m/86'/1'/0'/0/0";
  const child = root.derivePath(path);

  if (!child.publicKey) {
    throw new Error('Failed to derive public key');
  }

  // X-only pubkey for taproot
  const xOnlyPubkey = child.publicKey.slice(1, 33);
  console.log(`   Pubkey (x-only): ${xOnlyPubkey.toString('hex')}`);

  // Add input
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: rawTx.outs[utxo.vout].script,
      value: BigInt(utxo.value),
    },
    tapInternalKey: xOnlyPubkey,
  });

  // Output 0: Send wrap amount to frBTC signer address
  // The frBTC contract requires BTC to be sent to the signer for wrapping
  const signerAddress = getSignerAddress(network);
  console.log(`   Signer address: ${signerAddress}`);
  psbt.addOutput({
    address: signerAddress,
    value: BigInt(wrapAmount),
  });

  // Output 1: OP_RETURN with calldata
  const opReturnScript = buildOpReturnOutput(calldata);
  psbt.addOutput({
    script: opReturnScript,
    value: BigInt(0),
  });

  // Calculate fee and change
  const estimatedVsize = 200; // ~200 vbytes for 1-input taproot tx with 2 outputs + OP_RETURN
  const fee = Math.ceil(estimatedVsize * feeRate);
  const change = utxo.value - wrapAmount - fee;

  console.log(`   Fee: ${fee} sats`);
  console.log(`   Change: ${change} sats`);

  // Output 2: Change back to ourselves (if above dust)
  if (change < 546) {
    console.log('   WARNING: Change below dust threshold, adding to fee');
  } else {
    psbt.addOutput({
      address: TEST_ADDRESS,
      value: BigInt(change),
    });
  }

  // Step 3: Sign the transaction
  console.log('\n3. Signing transaction...');

  // For taproot key-path spend with bitcoinjs-lib v7:
  // We need to tweak the private key and create a proper signer
  const tweakedChildNode = child.tweak(
    bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey)
  );

  // Sign using the tweaked signer
  psbt.signInput(0, tweakedChildNode);
  psbt.finalizeAllInputs();

  // For regtest, bypass the fee rate check
  const tx = psbt.extractTransaction(true);
  const txHex = tx.toHex();
  const txId = tx.getId();

  console.log(`   Transaction ID: ${txId}`);
  console.log(`   Raw TX (first 100 chars): ${txHex.substring(0, 100)}...`);

  // Step 4: Broadcast
  console.log('\n4. Broadcasting transaction...');
  try {
    const result = await sendRawTx(txHex);
    console.log(`   Broadcast result: ${result}`);
    console.log('   SUCCESS! Transaction broadcast.');

    // Mine a block to confirm
    console.log('\n5. Mining a block to confirm...');
    await rpcCall('btc_generatetoaddress', [1, TEST_ADDRESS]);
    console.log('   Block mined!');

    // Wait and check frBTC balance
    console.log('\n6. Checking frBTC balance...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const frbtcAfter = await getAlkaneBalance(TEST_ADDRESS, '32:0');
    console.log(`   frBTC balance after: ${frbtcAfter?.balance || '0'}`);

    console.log('\n=== WRAP TEST COMPLETE ===');

  } catch (e: any) {
    console.log(`   ERROR broadcasting: ${e.message}`);

    // Try to decode the error
    if (e.message.includes('bad-txns-inputs-missingorspent')) {
      console.log('   The UTXO may already be spent.');
    } else if (e.message.includes('non-mandatory-script-verify-flag')) {
      console.log('   Script verification failed - check signing.');
    }
  }
}

main().catch(console.error);
