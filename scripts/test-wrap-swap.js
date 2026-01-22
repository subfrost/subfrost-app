#!/usr/bin/env node
/**
 * Test script for BTC wrap and swap using @alkanes/ts-sdk
 *
 * Usage:
 *   node scripts/test-wrap-swap.js balance
 *   node scripts/test-wrap-swap.js wrap <amount_sats>
 *   node scripts/test-wrap-swap.js swap <sell_token_id> <amount>
 *
 * Examples:
 *   node scripts/test-wrap-swap.js balance
 *   node scripts/test-wrap-swap.js wrap 100000000       # Wrap 1 BTC to frBTC
 *   node scripts/test-wrap-swap.js swap 32:0 10000000   # Swap 0.1 frBTC for DIESEL
 */

const { AlkanesProvider } = require('@alkanes/ts-sdk');
const fs = require('fs');

// Configuration
const NETWORK = 'subfrost-regtest';
const RPC_URL = 'https://regtest.subfrost.io/v4/subfrost';
const WALLET_FILE = process.env.HOME + '/.alkanes/wallet.json';

// Contract IDs
const FRBTC_ID = '32:0';
const DIESEL_ID = '2:0';
const POOL_ID = '2:3';  // DIESEL/frBTC pool
const FACTORY_ID = '4:65522';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage:');
    console.log('  node scripts/test-wrap-swap.js balance');
    console.log('  node scripts/test-wrap-swap.js wrap <amount_sats>');
    console.log('  node scripts/test-wrap-swap.js swap <sell_token_id> <amount>');
    console.log('\nExamples:');
    console.log('  node scripts/test-wrap-swap.js wrap 100000000     # Wrap 1 BTC');
    console.log('  node scripts/test-wrap-swap.js swap 32:0 10000000 # Swap frBTC->DIESEL');
    process.exit(1);
  }

  // Initialize provider
  console.log('Initializing AlkanesProvider for', NETWORK);
  const provider = new AlkanesProvider({
    network: NETWORK,
    rpcUrl: RPC_URL,
  });
  await provider.initialize();
  console.log('Provider initialized');

  // Load wallet
  console.log('Loading wallet from', WALLET_FILE);
  const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  const mnemonic = walletData.mnemonic;
  if (!mnemonic) {
    console.error('No mnemonic found in wallet file');
    process.exit(1);
  }
  provider.rawProvider.walletLoadMnemonic(mnemonic, null);
  console.log('Wallet loaded');

  // Get addresses
  const p2trAddresses = provider.rawProvider.walletGetAddresses('p2tr', 0, 1);
  const p2wpkhAddresses = provider.rawProvider.walletGetAddresses('p2wpkh', 0, 1);
  const taprootAddress = p2trAddresses[0]?.address;
  const segwitAddress = p2wpkhAddresses[0]?.address;
  console.log('Taproot address:', taprootAddress);
  console.log('SegWit address:', segwitAddress);

  if (command === 'balance') {
    await showBalance(provider, taprootAddress);
  } else if (command === 'wrap') {
    const amountSats = parseInt(args[1]) || 100000000;
    await wrapBtc(provider, taprootAddress, segwitAddress, amountSats);
  } else if (command === 'swap') {
    const sellTokenId = args[1] || FRBTC_ID;
    const amount = args[2] || '10000000';
    await executeSwap(provider, taprootAddress, segwitAddress, sellTokenId, amount);
  } else {
    console.log('Unknown command:', command);
  }
}

async function showBalance(provider, address) {
  console.log('\n=== Checking Balances ===');

  try {
    const balances = await provider.alkanes.getByAddress(address);
    console.log('Alkane balances for', address);
    if (balances && balances.length > 0) {
      for (const bal of balances) {
        console.log(`  ${bal.alkane_id || bal.id}: ${bal.amount || bal.balance}`);
      }
    } else {
      console.log('  No alkane balances found');
    }
  } catch (e) {
    console.error('Failed to get alkane balances:', e.message);
  }

  try {
    const addressInfo = await provider.esplora.getAddressInfo(address);
    console.log('\nBTC balance:');
    const balance = (addressInfo?.chain_stats?.funded_txo_sum || 0) -
                   (addressInfo?.chain_stats?.spent_txo_sum || 0);
    console.log('  Available:', balance, 'sats', '(' + (balance / 100000000).toFixed(8) + ' BTC)');
  } catch (e) {
    console.error('Failed to get BTC balance:', e.message);
  }
}

async function wrapBtc(provider, taprootAddress, segwitAddress, amountSats) {
  console.log('\n=== Wrapping BTC to frBTC ===');
  console.log('Amount:', amountSats, 'sats', '(' + (amountSats / 100000000).toFixed(8) + ' BTC)');

  // Required params for alkanesWrapBtc
  const params = {
    amount: amountSats,
    to_address: taprootAddress,
    feeRate: 2,
    raw_output: false,
    auto_confirm: true,
    trace_enabled: true,
    mine_enabled: true,
    from_addresses: [segwitAddress, taprootAddress],
    change_address: segwitAddress,
    alkanes_change_address: taprootAddress,
  };

  try {
    console.log('Executing wrap...');
    const result = await provider._provider.alkanesWrapBtc(JSON.stringify(params));
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    if (parsed?.txid || parsed?.reveal_txid) {
      console.log('\n✅ Wrap broadcast successfully!');
      console.log('Transaction ID:', parsed.txid || parsed.reveal_txid);
    } else if (parsed?.readyToSign) {
      console.log('\n📝 PSBT created (needs manual signing)');
      console.log('Use the frontend app to complete signing.');
    } else {
      console.log('\nResult:', JSON.stringify(parsed, null, 2).substring(0, 500));
    }
  } catch (e) {
    console.error('\n❌ Wrap failed:', String(e));
  }
}

async function executeSwap(provider, taprootAddress, segwitAddress, sellTokenId, amount) {
  console.log('\n=== Executing Swap ===');
  console.log('Selling:', sellTokenId, 'amount:', amount);

  const tokenOut = sellTokenId === DIESEL_ID ? FRBTC_ID : DIESEL_ID;
  console.log('For:', tokenOut);

  const blockCount = await provider.bitcoin.getBlockCount();
  const deadline = blockCount + 100;
  console.log('Block:', blockCount, 'Deadline:', deadline);

  // Two-protostone pattern for swap
  const [sellBlock, sellTx] = sellTokenId.split(':');
  const [poolBlock, poolTx] = POOL_ID.split(':');

  // p0: Transfer sell tokens to p1 (edict)
  const p0 = `[${sellBlock}:${sellTx}:${amount}:p1]:v0:v0`;
  // p1: Call pool with swap opcode (3), minOutput=0, deadline
  const p1 = `[${poolBlock},${poolTx},3,0,${deadline}]:v0:v0`;
  const protostone = `${p0},${p1}`;

  // Input requirements: the tokens we're selling
  const inputRequirements = `${sellBlock}:${sellTx}:${amount}`;

  console.log('Protostone:', protostone);
  console.log('Input:', inputRequirements);

  const toAddresses = JSON.stringify([taprootAddress]);
  const options = {
    trace_enabled: true,
    mine_enabled: true,
    auto_confirm: true,
    change_address: segwitAddress,
    alkanes_change_address: taprootAddress,
    from_addresses: [taprootAddress],
    lock_alkanes: true,
  };

  try {
    console.log('Executing swap...');
    const result = await provider._provider.alkanesExecuteWithStrings(
      toAddresses,
      inputRequirements,
      protostone,
      2,  // fee rate
      undefined,  // envelope
      JSON.stringify(options)
    );

    if (result?.txid || result?.reveal_txid) {
      console.log('\n✅ Swap broadcast successfully!');
      console.log('Transaction ID:', result.txid || result.reveal_txid);
    } else if (result?.readyToSign) {
      console.log('\n📝 PSBT created (needs manual signing)');
      console.log('Use the frontend app to complete signing.');
    } else if (result?.complete) {
      console.log('\n✅ Swap complete!');
      console.log('Transaction ID:', result.complete?.reveal_txid);
    } else {
      console.log('\nResult type:', Object.keys(result || {}));
    }
  } catch (e) {
    console.error('\n❌ Swap failed:', String(e));
  }
}

main().catch(console.error);
