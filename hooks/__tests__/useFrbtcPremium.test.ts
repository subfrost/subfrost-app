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

// Test 1: Zero value
const test1 = new Uint8Array(16).fill(0);
const result1 = parseU128FromBytes(test1);

// Test 2: Small value (100,000 = 0.1% in premium format)
// 100,000 in hex is 0x186A0
// Little-endian: [A0, 86, 01, 00, ...]
const test2 = new Uint8Array(16).fill(0);
test2[0] = 0xA0;
test2[1] = 0x86;
test2[2] = 0x01;
const result2 = parseU128FromBytes(test2);
const feePerThousand2 = Number(result2) / 100_000;

// Test 3: 0.2% fee (200,000 premium)
// 200,000 in hex is 0x30D40
// Little-endian: [40, 0D, 03, 00, ...]
const test3 = new Uint8Array(16).fill(0);
test3[0] = 0x40;
test3[1] = 0x0D;
test3[2] = 0x03;
const result3 = parseU128FromBytes(test3);
const feePerThousand3 = Number(result3) / 100_000;

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

// Test 5: Error handling - insufficient bytes
try {
  const test5 = new Uint8Array(8); // Only 8 bytes
  parseU128FromBytes(test5);
} catch (error) {
}

