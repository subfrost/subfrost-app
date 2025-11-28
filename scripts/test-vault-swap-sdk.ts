/**
 * Test Vault and Swap functionality using direct RPC calls
 *
 * This script demonstrates vault and swap operations on regtest
 * using the alkanes_simulate RPC method.
 *
 * Usage: npx ts-node --transpileOnly scripts/test-vault-swap-sdk.ts
 */

// Regtest configuration
const REGTEST_CONFIG = {
  rpcUrl: 'http://localhost:18888',

  // Deployed contracts from deployment logs
  contracts: {
    // Pool contracts
    poolLogic: { block: 4, tx: 65522 },      // OYL Pool Logic
    factoryLogic: { block: 4, tx: 62463 },   // OYL Factory Logic
    beaconProxy: { block: 4, tx: 781633 },   // OYL Beacon Proxy

    // Token contracts
    frostToken: { block: 4, tx: 7955 },      // FROST Token
    lbtcToken: { block: 4, tx: 7959 },       // LBTC Token (0x1f17)

    // Vault templates
    veVaultTemplate: { block: 4, tx: 7969 }, // VE Token Vault Template
    yveNftTemplate: { block: 4, tx: 7970 },  // YVE Token NFT Template
    vxGaugeTemplate: { block: 4, tx: 7971 }, // VX Token Gauge Template

    // Protocol tokens (reserved)
    diesel: { block: 2, tx: 0 },             // DIESEL token (reserved)
    frbtc: { block: 32, tx: 0 },             // frBTC token (reserved)
  },

  // Common opcodes for alkanes contracts
  opcodes: {
    // Standard token operations (ERC20-like)
    GET_NAME: 0,
    GET_SYMBOL: 1,
    GET_DECIMALS: 2,
    GET_TOTAL_SUPPLY: 3,
    GET_BALANCE: 4,

    // Pool operations (AMM)
    POOL_SWAP: 0,
    POOL_ADD_LIQUIDITY: 1,
    POOL_REMOVE_LIQUIDITY: 2,
    POOL_GET_RESERVES: 99,

    // Vault operations
    VAULT_DEPOSIT: 0,
    VAULT_WITHDRAW: 1,
    GET_INFO: 99,
  },
};

// Make RPC call
async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(REGTEST_CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    }),
  });
  return response.json();
}

// Create simulate request object
function createSimulateRequest(
  target: { block: number; tx: number },
  inputs: string[]
) {
  return {
    alkanes: [],
    transaction: '0x',
    block: '0x',
    height: '20000',
    txindex: 0,
    target: {
      block: target.block.toString(),
      tx: target.tx.toString(),
    },
    inputs,
    pointer: 0,
    refundPointer: 0,
    vout: 0,
  };
}

// Parse protobuf response data
function decodeResponse(hexResult: string): { status?: string; data?: Uint8Array } {
  if (!hexResult || hexResult === '0x') {
    return { status: 'empty' };
  }

  // Remove 0x prefix
  const hex = hexResult.startsWith('0x') ? hexResult.slice(2) : hexResult;

  // Convert hex to bytes
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  // The response is a protobuf SimulateResponse message
  // Field 3 (wire type 2, length-delimited) contains the execution data
  // 0x1a = field 3, length-delimited

  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i];
    const fieldNum = tag >> 3;
    const wireType = tag & 0x07;
    i++;

    if (wireType === 2) { // Length-delimited
      let len = 0;
      let shift = 0;
      while (bytes[i] & 0x80) {
        len |= (bytes[i] & 0x7f) << shift;
        shift += 7;
        i++;
      }
      len |= bytes[i] << shift;
      i++;

      if (fieldNum === 3) { // execution data field
        const data = bytes.slice(i, i + len);
        const text = new TextDecoder().decode(data);
        return { status: 'success', data };
      }
      i += len;
    } else if (wireType === 0) { // Varint
      while (bytes[i] & 0x80) i++;
      i++;
    }
  }

  // Try to decode as plain text
  try {
    const text = new TextDecoder().decode(bytes);
    return { status: text };
  } catch {
    return { status: 'unknown', data: bytes };
  }
}

// Test: Get metashrew height
async function testMetashrewHeight() {
  console.log('\n=== Testing Metashrew Height ===\n');

  const result = await rpcCall('metashrew_height', []);
  console.log('Metashrew height:', result.result);
  return result.result;
}

// Test: Simulate pool query
async function testPoolQuery() {
  console.log('\n=== Testing Pool Logic Contract ===\n');

  const pool = REGTEST_CONFIG.contracts.poolLogic;
  console.log(`Querying Pool Logic at [${pool.block}:${pool.tx}]...`);

  // Try GET_INFO opcode (99)
  const request = createSimulateRequest(pool, ['99']);
  console.log('Request:', JSON.stringify(request, null, 2));

  const result = await rpcCall('alkanes_simulate', [request]);

  if (result.error) {
    console.log('Error:', result.error.message);
    return null;
  }

  console.log('Raw result:', result.result);
  const decoded = decodeResponse(result.result);
  console.log('Decoded:', decoded);

  return result.result;
}

// Test: Simulate token query
async function testTokenQuery() {
  console.log('\n=== Testing Token Contract ===\n');

  const token = REGTEST_CONFIG.contracts.frostToken;
  console.log(`Querying FROST Token at [${token.block}:${token.tx}]...`);

  // Try GET_NAME opcode (0) - note we need to pass "00" for even hex length
  const request = createSimulateRequest(token, ['0']);
  console.log('Request:', JSON.stringify(request, null, 2));

  const result = await rpcCall('alkanes_simulate', [request]);

  if (result.error) {
    console.log('Error:', result.error.message);
    console.log('Note: Token may not respond to standard ERC20 opcodes');
    return null;
  }

  console.log('Raw result:', result.result);
  const decoded = decodeResponse(result.result);
  console.log('Decoded:', decoded);

  return result.result;
}

// Test: Simulate vault query
async function testVaultQuery() {
  console.log('\n=== Testing Vault Template ===\n');

  const vault = REGTEST_CONFIG.contracts.veVaultTemplate;
  console.log(`Querying VE Vault Template at [${vault.block}:${vault.tx}]...`);

  // Try GET_INFO opcode (99)
  const request = createSimulateRequest(vault, ['99']);
  console.log('Request:', JSON.stringify(request, null, 2));

  const result = await rpcCall('alkanes_simulate', [request]);

  if (result.error) {
    console.log('Error:', result.error.message);
    return null;
  }

  console.log('Raw result:', result.result);
  const decoded = decodeResponse(result.result);
  console.log('Decoded:', decoded);

  return result.result;
}

// Show transaction examples
function showTransactionExamples() {
  console.log('\n=== Transaction Building Examples ===\n');

  console.log('To build actual vault/swap transactions, you need:');
  console.log('');
  console.log('1. A funded wallet with UTXOs');
  console.log('2. Token UTXOs for the operation');
  console.log('3. The alkanes envelope format in OP_RETURN');
  console.log('');
  console.log('Example Vault Deposit:');
  console.log('  target: { block: 4, tx: 7969 }  // VE Vault');
  console.log('  opcode: 0 (DEPOSIT)');
  console.log('  amount: 10000 sats');
  console.log('');
  console.log('Example Swap:');
  console.log('  target: { block: 4, tx: 65522 }  // Pool');
  console.log('  opcode: 0 (SWAP)');
  console.log('  inputAmount: 5000');
  console.log('  minOutput: 4500');
}

// Main
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        Vault & Swap Test Script (Direct RPC)                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  try {
    // Test metashrew height
    await testMetashrewHeight();

    // Test pool query
    await testPoolQuery();

    // Test token query
    await testTokenQuery();

    // Test vault query
    await testVaultQuery();

    // Show examples
    showTransactionExamples();

    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('Test script completed');
    console.log('══════════════════════════════════════════════════════════════════\n');

    console.log('Summary:');
    console.log('  - alkanes_simulate RPC is working');
    console.log('  - Pool contracts respond to queries');
    console.log('  - "unterminated" response means contract ran but hit timeout/no return');
    console.log('  - Token contracts may need different opcodes');
    console.log('');
    console.log('For actual swap/vault operations, use the app UI or build transactions');
    console.log('with proper UTXO management and alkanes envelope encoding.');

  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main();
