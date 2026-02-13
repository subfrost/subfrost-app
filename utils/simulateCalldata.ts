/**
 * Encode calldata as a proper cellpack for alkanesSimulate.
 *
 * JOURNAL ENTRY (2026-02-13):
 * The SDK WASM's alkanesSimulate() uses metashrew_view("simulate", protobuf)
 * internally. The protobuf's calldata field must be a LEB128-encoded cellpack:
 *   [target_block, target_tx, ...inputs]
 * But the WASM does NOT prepend the contract target — it passes calldata as-is.
 * This utility encodes the target + inputs as LEB128 varints so the indexer
 * receives a valid cellpack. When the SDK WASM is eventually fixed upstream
 * (alkanes-rs PR #247), this can be removed and callers can go back to passing
 * raw input arrays.
 */

/**
 * Encode a single unsigned integer as LEB128 bytes.
 */
function encodeLeb128(value: number): number[] {
  if (value === 0) return [0];
  const bytes: number[] = [];
  let v = value;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return bytes;
}

/**
 * Encode a contract call as a LEB128 cellpack for use as the `calldata` field
 * in an alkanesSimulate context.
 *
 * @param contractId - Target contract in "block:tx" format (e.g. "32:0")
 * @param inputs     - Opcode + arguments as plain numbers (e.g. [104] or [2, 4, 65498])
 * @returns byte array suitable for the `calldata` field in MessageContextParcel JSON
 */
export function encodeSimulateCalldata(contractId: string, inputs: number[]): number[] {
  const parts = contractId.split(':');
  const block = Number(parts[0]);
  const tx = Number(parts[1]);
  const values = [block, tx, ...inputs];
  const bytes: number[] = [];
  for (const v of values) {
    bytes.push(...encodeLeb128(v));
  }
  return bytes;
}
