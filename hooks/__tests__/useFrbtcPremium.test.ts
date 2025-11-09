/**
 * Manual test for useFrbtcPremium hook
 * Run this to verify the premium fetching logic
 */

// Test the parseU128FromBytes function
function parseU128FromBytes(data: number[] | Uint8Array): bigint {
  if (!data || data.length === 0) {
    throw new Error('No data to parse');
  }
  
  const bytes = new Uint8Array(data);
  if (bytes.length < 16) {
    throw new Error(`Insufficient bytes for u128: ${bytes.length} < 16`);
  }
  
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(bytes[i]) << BigInt(i * 8);
  }
  
  return result;
}

// Test cases
console.log('Testing parseU128FromBytes function...\n');

// Test 1: Zero value
const test1 = new Uint8Array(16).fill(0);
const result1 = parseU128FromBytes(test1);
console.log('Test 1 - Zero value:');
console.log('  Input: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]');
console.log('  Result:', result1.toString());
console.log('  Expected: 0');
console.log('  Pass:', result1 === BigInt(0) ? '✅' : '❌');
console.log();

// Test 2: Small value (100,000 = 0.1% in premium format)
// 100,000 in hex is 0x186A0
// Little-endian: [A0, 86, 01, 00, ...]
const test2 = new Uint8Array(16).fill(0);
test2[0] = 0xA0;
test2[1] = 0x86;
test2[2] = 0x01;
const result2 = parseU128FromBytes(test2);
const feePerThousand2 = Number(result2) / 100_000;
console.log('Test 2 - Small value (100,000 = 0.1%):');
console.log('  Premium:', result2.toString());
console.log('  Fee per 1000:', feePerThousand2);
console.log('  Expected premium: 100000');
console.log('  Expected fee per 1000: 1');
console.log('  Pass:', result2 === BigInt(100_000) && feePerThousand2 === 1 ? '✅' : '❌');
console.log();

// Test 3: 0.2% fee (200,000 premium)
// 200,000 in hex is 0x30D40
// Little-endian: [40, 0D, 03, 00, ...]
const test3 = new Uint8Array(16).fill(0);
test3[0] = 0x40;
test3[1] = 0x0D;
test3[2] = 0x03;
const result3 = parseU128FromBytes(test3);
const feePerThousand3 = Number(result3) / 100_000;
console.log('Test 3 - Medium value (200,000 = 0.2%):');
console.log('  Premium:', result3.toString());
console.log('  Fee per 1000:', feePerThousand3);
console.log('  Expected premium: 200000');
console.log('  Expected fee per 1000: 2');
console.log('  Pass:', result3 === BigInt(200_000) && feePerThousand3 === 2 ? '✅' : '❌');
console.log();

// Test 4: Maximum value (100,000,000 = 100%)
// 100,000,000 in hex is 0x5F5E100
// Little-endian: [00, E1, F5, 05, ...]
const test4 = new Uint8Array(16).fill(0);
test4[0] = 0x00;
test4[1] = 0xE1;
test4[2] = 0xF5;
test4[3] = 0x05;
const result4 = parseU128FromBytes(test4);
const feePerThousand4 = Number(result4) / 100_000;
console.log('Test 4 - Maximum value (100,000,000 = 100%):');
console.log('  Premium:', result4.toString());
console.log('  Fee per 1000:', feePerThousand4);
console.log('  Expected premium: 100000000');
console.log('  Expected fee per 1000: 1000');
console.log('  Pass:', result4 === BigInt(100_000_000) && feePerThousand4 === 1000 ? '✅' : '❌');
console.log();

// Test 5: Error handling - insufficient bytes
try {
  const test5 = new Uint8Array(8); // Only 8 bytes
  parseU128FromBytes(test5);
  console.log('Test 5 - Error handling: ❌ (should have thrown)');
} catch (error) {
  console.log('Test 5 - Error handling:');
  console.log('  Error message:', (error as Error).message);
  console.log('  Pass:', (error as Error).message.includes('Insufficient bytes') ? '✅' : '❌');
}
console.log();

console.log('All tests completed!');
