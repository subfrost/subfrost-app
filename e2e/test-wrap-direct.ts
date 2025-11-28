// @ts-nocheck
/**
 * Direct test of BTC → frBTC wrap functionality
 * Bypasses Puppeteer UI to test SDK directly against regtest
 */

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const REGTEST_RPC = 'http://localhost:18888';
const REGTEST_API = 'http://localhost:50010';

// Expected taproot address for this mnemonic
const EXPECTED_ADDRESS = 'bcrt1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk';

async function rpcCall(method: string, params: any[]) {
  const response = await fetch(REGTEST_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const data = await response.json() as any;
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function main() {
  console.log('=== Direct Wrap Test ===\n');

  const address = EXPECTED_ADDRESS;
  console.log('Test wallet address:', address);

  // Step 2: Check UTXOs
  console.log('\nChecking UTXOs...');
  const utxos: any[] = await rpcCall('esplora_address::utxo', [address]);
  console.log('UTXOs found:', utxos.length);

  if (utxos.length === 0) {
    console.log('\nNo UTXOs found. Need to fund the wallet first.');
    return;
  }

  let totalSats = 0;
  for (const utxo of utxos) {
    console.log(`  - ${utxo.txid}:${utxo.vout} = ${utxo.value} sats`);
    totalSats += utxo.value;
  }
  console.log(`Total balance: ${totalSats} sats (${totalSats / 1e8} BTC)`);

  // Step 3: Check current block height
  console.log('\nChecking block height...');
  const blockCount = await rpcCall('getblockcount', []);
  console.log('Current block height:', blockCount);

  // Step 4: Check if frBTC token exists (32:0)
  console.log('\nChecking for frBTC token at address...');
  const protorunesResult = await rpcCall('alkanes_protorunesbyaddress', [{ address }]);
  console.log('Protorunes at address:', protorunesResult);

  // Step 5: Import SDK and test wrapBtc
  console.log('\nLoading SDK...');
  const bitcoin = await import('bitcoinjs-lib');
  const ecc = await import('@bitcoinerlab/secp256k1');
  const { ECPairFactory } = await import('ecpair');

  bitcoin.initEccLib(ecc);
  const ECPair = ECPairFactory(ecc);

  const { AlkanesProvider, wrapBtc, createWalletFromMnemonic } = await import('@alkanes/ts-sdk');

  const provider = new AlkanesProvider({
    url: REGTEST_RPC,
    dataApiUrl: REGTEST_API,
    network: bitcoin.networks.regtest,
    networkType: 'regtest',
  });

  console.log('Provider created:', (provider as any).url || REGTEST_RPC);

  // Create wallet from mnemonic
  console.log('\nCreating wallet from mnemonic...');
  const wallet = createWalletFromMnemonic(TEST_MNEMONIC, 'regtest');
  console.log('Wallet created');

  // Use known taproot pubkey for this mnemonic (x-only format)
  // The mnemonic "abandon...about" with derivation path m/86'/0'/0'/0/0 gives this pubkey
  const taprootXonlyPubkey = 'a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c';
  console.log('Using known taproot address:', address);

  // Prepare account object
  const account = {
    taproot: {
      address: address,
      pubkey: taprootXonlyPubkey,
    },
    nativeSegwit: {
      address: address,
      pubkey: taprootXonlyPubkey,
    },
    nestedSegwit: {
      address: address,
      pubkey: taprootXonlyPubkey,
    },
    legacy: {
      address: address,
      pubkey: taprootXonlyPubkey,
    },
    spendStrategy: {
      addressOrder: ['taproot'],
    },
  };

  // Create a signer shim
  const signer = {
    signAllInputs: async ({ rawPsbtHex }: { rawPsbtHex: string }) => {
      console.log('\n  [Signer] Received PSBT to sign');
      const psbt = bitcoin.Psbt.fromHex(rawPsbtHex, { network: bitcoin.networks.regtest });
      console.log('  [Signer] PSBT has', psbt.inputCount, 'inputs');

      // Sign each input with the wallet
      const signedPsbt = await wallet.signPsbt(psbt.toBase64());
      console.log('  [Signer] Signed PSBT');

      // Finalize
      const finalPsbt = bitcoin.Psbt.fromBase64(signedPsbt, { network: bitcoin.networks.regtest });
      for (let i = 0; i < finalPsbt.inputCount; i++) {
        try {
          finalPsbt.finalizeInput(i);
        } catch (e: any) {
          console.log(`  [Signer] Could not finalize input ${i}:`, e.message);
        }
      }

      return {
        signedPsbt: finalPsbt.toBase64(),
        signedHexPsbt: finalPsbt.toHex(),
      };
    },
    taprootKeyPair: ECPair.makeRandom({ network: bitcoin.networks.regtest }),
  };

  // Prepare UTXOs in expected format
  const formattedUtxos = utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    status: u.status,
  }));

  console.log('\nAttempting wrap...');
  console.log('  Amount: 0.1 BTC (10000000 sats)');
  console.log('  Fee rate: 10 sats/vB');

  try {
    const result = await wrapBtc({
      utxos: formattedUtxos,
      account,
      provider,
      signer,
      feeRate: 10,
      wrapAmount: 10000000, // 0.1 BTC in sats
    });

    console.log('\n=== Wrap Result ===');
    console.log('Success! Transaction ID:', (result as any)?.txId);

    // Mine a block to confirm
    console.log('\nMining a block to confirm...');
    const { execSync } = await import('child_process');
    execSync('docker exec alkanes-rs-bitcoind-1 bitcoin-cli -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc -regtest -generate 1', {
      encoding: 'utf-8',
    });

    // Check frBTC balance
    console.log('\nChecking frBTC balance after wrap...');
    await new Promise((r) => setTimeout(r, 2000)); // Wait for indexer
    const newProtorunes = await rpcCall('alkanes_protorunesbyaddress', [{ address }]);
    console.log('Protorunes after wrap:', newProtorunes);

  } catch (error) {
    console.error('\n=== Wrap Failed ===');
    console.error('Error:', error);
  }
}

main().catch(console.error);
