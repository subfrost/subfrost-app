/**
 * Test script for Vault and Swap functionality on regtest
 *
 * This script demonstrates:
 * 1. Querying vault/pool contracts via alkanes_simulate RPC
 * 2. Building vault deposit transactions
 * 3. Building swap transactions
 *
 * Usage: npx ts-node scripts/test-vault-swap.ts
 */

// Configuration for regtest contracts
const REGTEST_CONFIG = {
  rpcUrl: 'http://localhost:18888',

  // Deployed contracts on regtest (from deployment logs)
  contracts: {
    yvfrbtcVault: { block: '4', tx: '7937' },  // yv-fr-btc Vault
    dxbtcVault: { block: '4', tx: '7936' },    // dxBTC Vault
    frbtcToken: { block: '32', tx: '0' },
    dieselToken: { block: '2', tx: '0' },
    factory: { block: '4', tx: '65522' },      // AMM Factory
  },

  // Vault operation codes (from alkanes spec)
  opcodes: {
    // Vault operations
    VAULT_DEPOSIT: 0,
    VAULT_WITHDRAW: 1,
    VAULT_GET_INFO: 99,

    // Swap/Pool operations
    POOL_SWAP: 0,
    POOL_ADD_LIQUIDITY: 1,
    POOL_REMOVE_LIQUIDITY: 2,
    POOL_GET_RESERVES: 99,
  }
};

interface RpcResponse {
  jsonrpc: string;
  result?: string;
  error?: { code: number; message: string };
  id: number | string;
}

async function rpcCall(method: string, params: unknown[]): Promise<RpcResponse> {
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

// Convert number to protobuf uint128 hex bytes (little-endian)
function encodeUint128(value: bigint | number): string {
  const n = BigInt(value);
  const lo = n & BigInt('0xFFFFFFFFFFFFFFFF');
  const hi = (n >> BigInt(64)) & BigInt('0xFFFFFFFFFFFFFFFF');

  // Encode as little-endian bytes
  const loBytes = lo.toString(16).padStart(16, '0').match(/.{2}/g)!.reverse().join('');
  const hiBytes = hi.toString(16).padStart(16, '0').match(/.{2}/g)!.reverse().join('');

  return loBytes + hiBytes;
}

// Encode opcode as calldata
function encodeCalldata(opcode: number, ...args: (bigint | number)[]): string {
  let hex = opcode.toString(16).padStart(2, '0');
  for (const arg of args) {
    hex += encodeUint128(arg);
  }
  return '0x' + hex;
}

async function testVaultInfo() {
  console.log('\n=== Testing Vault Info Query ===\n');

  const vault = REGTEST_CONFIG.contracts.yvfrbtcVault;
  console.log(`Querying yvfrBTC Vault (${vault.block}:${vault.tx})...`);

  const result = await rpcCall('alkanes_simulate', [{
    target: vault,
    inputs: ['0x63'], // opcode 99 = get info
  }]);

  if (result.error) {
    console.log('Error:', result.error.message);
  } else {
    console.log('Result:', result.result);
    // Decode the protobuf response if needed
  }

  return result;
}

async function testPoolReserves() {
  console.log('\n=== Testing Pool Reserves Query ===\n');

  const factory = REGTEST_CONFIG.contracts.factory;
  console.log(`Querying Factory (${factory.block}:${factory.tx}) for pool reserves...`);

  // First, let's check if any pools exist
  const result = await rpcCall('alkanes_simulate', [{
    target: factory,
    inputs: ['0x63'], // opcode 99 = get info
  }]);

  if (result.error) {
    console.log('Error:', result.error.message);
    console.log('(This is expected if factory contract does not exist at this ID)');
  } else {
    console.log('Result:', result.result);
  }

  return result;
}

async function testGetBalances(address: string) {
  console.log('\n=== Testing Balance Query ===\n');
  console.log(`Querying balances for address: ${address}`);

  const result = await rpcCall('alkanes_protorunesbyaddress', [address]);

  if (result.error) {
    console.log('Error:', result.error.message);
  } else {
    console.log('Result:', result.result);
    if (result.result === '0x' || result.result === '') {
      console.log('(Empty result - no alkanes tokens at this address)');
    }
  }

  return result;
}

async function testMetashrewHeight() {
  console.log('\n=== Testing Metashrew Height ===\n');

  const result = await rpcCall('metashrew_height', []);

  if (result.error) {
    console.log('Error:', result.error.message);
  } else {
    console.log('Current block height:', result.result);
  }

  return result;
}

async function showVaultDepositExample() {
  console.log('\n=== Vault Deposit Transaction Example ===\n');

  console.log('To deposit into a vault, you need to:');
  console.log('1. Have the vault token (e.g., frBTC) in your wallet');
  console.log('2. Build a transaction with:');
  console.log('   - Input: UTXO containing the token');
  console.log('   - OP_RETURN with alkanes calldata');
  console.log('   - Output to vault contract\n');

  console.log('Example calldata for vault deposit:');
  const depositCalldata = encodeCalldata(
    REGTEST_CONFIG.opcodes.VAULT_DEPOSIT,
    BigInt(10000) // deposit 10000 satoshis worth
  );
  console.log(`  Opcode: ${REGTEST_CONFIG.opcodes.VAULT_DEPOSIT} (VAULT_DEPOSIT)`);
  console.log(`  Amount: 10000`);
  console.log(`  Encoded: ${depositCalldata}`);
}

async function showSwapExample() {
  console.log('\n=== Swap Transaction Example ===\n');

  console.log('To swap tokens, you need to:');
  console.log('1. Have input tokens in your wallet');
  console.log('2. Build a transaction with:');
  console.log('   - Input: UTXO containing input token');
  console.log('   - OP_RETURN with alkanes swap calldata');
  console.log('   - Output to pool contract\n');

  console.log('Example calldata for swap:');
  const swapCalldata = encodeCalldata(
    REGTEST_CONFIG.opcodes.POOL_SWAP,
    BigInt(5000),  // input amount
    BigInt(4500)   // minimum output (slippage protection)
  );
  console.log(`  Opcode: ${REGTEST_CONFIG.opcodes.POOL_SWAP} (POOL_SWAP)`);
  console.log(`  Input Amount: 5000`);
  console.log(`  Min Output: 4500`);
  console.log(`  Encoded: ${swapCalldata}`);
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        Vault & Swap Test Script (Regtest)                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    // Test basic connectivity
    await testMetashrewHeight();

    // Test vault info query
    await testVaultInfo();

    // Test pool reserves
    await testPoolReserves();

    // Test balance query with test address
    await testGetBalances('bcrt1qtest12345');

    // Show transaction examples
    await showVaultDepositExample();
    await showSwapExample();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ Test script completed');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Next steps to actually execute transactions:');
    console.log('1. Get a funded wallet with regtest BTC');
    console.log('2. Acquire frBTC tokens (mint or receive)');
    console.log('3. Use the app UI or build transactions programmatically');
    console.log('4. Sign and broadcast via the JSON-RPC endpoint\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
