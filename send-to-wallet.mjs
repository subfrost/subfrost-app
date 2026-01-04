#!/usr/bin/env node
// Send BTC from abandon mnemonic to regtest wallet
import fs from 'fs';

process.env.RUST_LOG = 'warn';

const wasm = await import('@alkanes/ts-sdk/wasm');

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TO_ADDRESS = 'bcrt1pnd3plf7thp8nqe7afmggcdgqwf5df4lqd6s5lglumqmlhqfm8gkslznpk9';
const AMOUNT = 100000000; // 1 BTC in sats

console.log('Setting up local provider...');
const provider = new wasm.WebProvider('regtest');
provider.walletLoadMnemonic(MNEMONIC, null);

console.log('Sending 1 BTC to:', TO_ADDRESS);

try {
  const result = await provider.walletSend(TO_ADDRESS, AMOUNT.toString(), '2');
  console.log('Result:', result);
} catch (e) {
  console.error('Error:', e.message || e);
}
