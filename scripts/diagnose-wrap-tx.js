#!/usr/bin/env node

/**
 * Diagnostic script to analyze wrap transactions and check indexer status
 *
 * Usage: node scripts/diagnose-wrap-tx.js <txid> [network]
 *
 * This script will:
 * 1. Decode the raw transaction
 * 2. Verify protostone OP_RETURN data
 * 3. Check output addresses match expected wrap structure
 * 4. Query indexer to see if transaction was processed
 * 5. Provide recommendations if issues are found
 */

const https = require('https');
const http = require('http');

// Network configurations
const NETWORKS = {
  mainnet: {
    FRBTC_ALKANE_ID: '32:0',
    API_URL: 'https://api.alkanes.live',
    ESPLORA_URL: 'https://blockstream.info/api',
  },
  testnet: {
    FRBTC_ALKANE_ID: '32:0',
    API_URL: 'https://testnet-api.alkanes.live',
    ESPLORA_URL: 'https://blockstream.info/testnet/api',
  },
  regtest: {
    FRBTC_ALKANE_ID: '2:0',
    API_URL: 'http://localhost:3000',
    ESPLORA_URL: 'http://localhost:3002',
  },
};

// Expected signer pubkey (from fr-btc-support)
const SIGNER_PUBKEY_HEX = '7940ef3b659179a1371dec05793cb027cde47806fb66ce1e3d1b69d56de629dc';

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = url.startsWith('https') ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function decodeOpReturn(scriptHex) {
  // OP_RETURN format: 6a [length] [data]
  if (!scriptHex.startsWith('6a')) return null;

  // Skip 6a (OP_RETURN) and length byte
  const dataHex = scriptHex.slice(4);
  return Buffer.from(dataHex, 'hex').toString('utf8');
}

async function diagnoseTransaction(txid, network = 'regtest') {
  const config = NETWORKS[network];
  if (!config) {
    console.error(`Unknown network: ${network}`);
    console.error(`Available networks: ${Object.keys(NETWORKS).join(', ')}`);
    process.exit(1);
  }

  console.log('========================================');
  console.log('WRAP TRANSACTION DIAGNOSTIC');
  console.log('========================================');
  console.log(`Network: ${network}`);
  console.log(`Transaction ID: ${txid}`);
  console.log(`frBTC Alkane ID: ${config.FRBTC_ALKANE_ID}`);
  console.log('');

  // 1. Fetch raw transaction
  console.log('[1/5] Fetching transaction from blockchain...');
  let tx;
  try {
    tx = await fetchJson(`${config.ESPLORA_URL}/tx/${txid}`);
    console.log(`✓ Transaction found`);
    console.log(`  Status: ${tx.status.confirmed ? 'Confirmed' : 'In mempool'}`);
    if (tx.status.confirmed) {
      console.log(`  Block height: ${tx.status.block_height}`);
    }
  } catch (err) {
    console.error(`✗ Failed to fetch transaction: ${err.message}`);
    process.exit(1);
  }

  // 2. Analyze outputs
  console.log('');
  console.log('[2/5] Analyzing transaction outputs...');
  console.log(`  Total outputs: ${tx.vout.length}`);

  let hasOpReturn = false;
  let opReturnData = null;
  let signerOutput = null;
  let userOutput = null;

  tx.vout.forEach((output, idx) => {
    const scriptHex = output.scriptpubkey;
    const scriptType = output.scriptpubkey_type;
    const address = output.scriptpubkey_address || 'N/A';
    const value = output.value;

    console.log(`  Output ${idx}:`);
    console.log(`    Type: ${scriptType}`);
    console.log(`    Address: ${address}`);
    console.log(`    Value: ${value} sats`);

    if (scriptType === 'op_return') {
      hasOpReturn = true;
      opReturnData = decodeOpReturn(scriptHex);
      console.log(`    OP_RETURN data: ${opReturnData}`);
    }

    // Note: We'd need to compute signer address to verify, but we can check the pattern
    if (scriptType === 'v1_p2tr' && !userOutput) {
      userOutput = { idx, address, value };
    } else if (scriptType === 'v1_p2tr' && !signerOutput) {
      signerOutput = { idx, address, value };
    }
  });

  // 3. Verify protostone structure
  console.log('');
  console.log('[3/5] Verifying protostone structure...');
  if (!hasOpReturn) {
    console.error('✗ No OP_RETURN output found!');
    console.error('  Wrap transactions MUST include OP_RETURN with protostone data');
    console.error('  This is likely why the indexer is not processing the transaction');
  } else if (!opReturnData) {
    console.error('✗ OP_RETURN found but data is empty or unparseable');
  } else {
    console.log(`✓ OP_RETURN found: ${opReturnData}`);

    // Expected format: [block,tx,opcode]:pointer:refund
    const expectedProtostone = `[${config.FRBTC_ALKANE_ID.replace(':', ',')},77]:v0:v0`;
    if (opReturnData.includes(expectedProtostone)) {
      console.log(`✓ Protostone matches expected format: ${expectedProtostone}`);
    } else {
      console.warn(`⚠ Protostone may not match expected format`);
      console.warn(`  Expected pattern: ${expectedProtostone}`);
      console.warn(`  Actual: ${opReturnData}`);
    }
  }

  // 4. Check indexer status
  console.log('');
  console.log('[4/5] Checking indexer status...');

  if (!userOutput) {
    console.warn('⚠ Could not identify user output (first P2TR output)');
  } else {
    try {
      const balanceData = await postJson(`${config.API_URL}/get-address-balances`, {
        address: userOutput.address,
        include_outpoints: false,
      });

      console.log(`✓ Indexer responded for address ${userOutput.address}`);

      if (balanceData?.balances?.[config.FRBTC_ALKANE_ID]) {
        const balance = balanceData.balances[config.FRBTC_ALKANE_ID];
        console.log(`✓ Indexer shows frBTC balance: ${balance}`);
        console.log('  Transaction appears to be indexed correctly!');
      } else {
        console.warn('⚠ Indexer does not show frBTC balance for this address');
        console.warn('  Possible reasons:');
        console.warn('  - Transaction not yet confirmed');
        console.warn('  - Indexer has not processed this block yet');
        console.warn('  - Transaction structure does not match indexer expectations');
        console.warn('  - OP_RETURN protostone is malformed');
      }

      if (balanceData?.balances) {
        console.log('  All balances:', JSON.stringify(balanceData.balances, null, 2));
      }
    } catch (err) {
      console.error(`✗ Failed to check indexer: ${err.message}`);
    }
  }

  // 5. Summary and recommendations
  console.log('');
  console.log('[5/5] Summary and recommendations:');

  const issues = [];
  if (!hasOpReturn) issues.push('Missing OP_RETURN output');
  if (!tx.status.confirmed) issues.push('Transaction not yet confirmed');
  if (signerOutput && signerOutput.value === 0) issues.push('Signer output has 0 value (should contain wrap amount)');

  if (issues.length === 0) {
    console.log('✓ No obvious issues detected');
    console.log('  If indexer still not showing balance:');
    console.log('  1. Wait for block confirmation (if in mempool)');
    console.log('  2. Check indexer logs for processing errors');
    console.log('  3. Verify indexer is running and synced to correct block height');
  } else {
    console.log('✗ Issues detected:');
    issues.forEach(issue => console.log(`  - ${issue}`));
  }

  console.log('');
  console.log('========================================');
}

// Main
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/diagnose-wrap-tx.js <txid> [network]');
  console.log('');
  console.log('Networks: mainnet, testnet, regtest (default: regtest)');
  console.log('');
  console.log('Example: node scripts/diagnose-wrap-tx.js abc123... regtest');
  process.exit(1);
}

const txid = args[0];
const network = args[1] || 'regtest';

diagnoseTransaction(txid, network).catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
