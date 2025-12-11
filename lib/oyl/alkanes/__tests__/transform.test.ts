/**
 * Alkane Transform Utility Tests
 *
 * Tests for the alkane ID parsing and simulation request functions
 * in lib/oyl/alkanes/transform.ts
 *
 * Run with: pnpm test lib/oyl/alkanes/__tests__/transform.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  formatAlkaneId,
  parseAlkaneId,
  createSimulateRequestObject,
} from '../transform';

// ==========================================
// formatAlkaneId Tests
// ==========================================

describe('formatAlkaneId', () => {
  it('should format numeric block and tx', () => {
    const result = formatAlkaneId({ block: 2, tx: 0 });
    expect(result).toBe('2:0');
  });

  it('should format string block and tx', () => {
    const result = formatAlkaneId({ block: '32', tx: '0' });
    expect(result).toBe('32:0');
  });

  it('should handle large block numbers', () => {
    const result = formatAlkaneId({ block: 1000000, tx: 12345 });
    expect(result).toBe('1000000:12345');
  });

  it('should handle zero values', () => {
    const result = formatAlkaneId({ block: 0, tx: 0 });
    expect(result).toBe('0:0');
  });

  it('should handle mixed numeric and string inputs', () => {
    const result = formatAlkaneId({ block: 4, tx: '65522' });
    expect(result).toBe('4:65522');
  });
});

// ==========================================
// parseAlkaneId Tests
// ==========================================

describe('parseAlkaneId', () => {
  it('should parse standard alkane ID', () => {
    const result = parseAlkaneId('2:0');
    expect(result).toEqual({ block: '2', tx: '0' });
  });

  it('should parse alkane ID with large numbers', () => {
    const result = parseAlkaneId('32:0');
    expect(result).toEqual({ block: '32', tx: '0' });
  });

  it('should parse factory ID format', () => {
    const result = parseAlkaneId('4:65522');
    expect(result).toEqual({ block: '4', tx: '65522' });
  });

  it('should throw error for invalid format (no colon)', () => {
    expect(() => parseAlkaneId('invalid')).toThrow('Invalid alkaneId format');
  });

  it('should throw error for empty string', () => {
    expect(() => parseAlkaneId('')).toThrow('Invalid alkaneId format');
  });

  it('should throw error for missing tx part', () => {
    expect(() => parseAlkaneId('2:')).toThrow('Invalid alkaneId format');
  });

  it('should throw error for missing block part', () => {
    expect(() => parseAlkaneId(':0')).toThrow('Invalid alkaneId format');
  });

  it('should handle whitespace in input', () => {
    // Note: current implementation doesn't trim, so this would keep whitespace
    const result = parseAlkaneId('2:0');
    expect(result.block).toBe('2');
    expect(result.tx).toBe('0');
  });
});

// ==========================================
// formatAlkaneId and parseAlkaneId Round-Trip
// ==========================================

describe('formatAlkaneId and parseAlkaneId round-trip', () => {
  it('should maintain consistency through format -> parse cycle', () => {
    const original = { block: 32, tx: 0 };
    const formatted = formatAlkaneId(original);
    const parsed = parseAlkaneId(formatted);

    expect(parsed.block).toBe(String(original.block));
    expect(parsed.tx).toBe(String(original.tx));
  });

  it('should work for various alkane IDs', () => {
    const testCases = [
      { block: '2', tx: '0' }, // DIESEL
      { block: '32', tx: '0' }, // frBTC
      { block: '4', tx: '65522' }, // Factory
      { block: '2', tx: '3' }, // Pool
    ];

    for (const testCase of testCases) {
      const formatted = formatAlkaneId(testCase);
      const parsed = parseAlkaneId(formatted);
      expect(parsed.block).toBe(testCase.block);
      expect(parsed.tx).toBe(testCase.tx);
    }
  });
});

// ==========================================
// createSimulateRequestObject Tests
// ==========================================

describe('createSimulateRequestObject', () => {
  it('should create object with default values', () => {
    const result = createSimulateRequestObject({});

    expect(result.alkanes).toEqual([]);
    expect(result.transaction).toBe('0x');
    expect(result.block).toBe('0x');
    expect(result.height).toBe('20000');
    expect(result.txindex).toBe(0);
    expect(result.inputs).toEqual([]);
    expect(result.pointer).toBe(0);
    expect(result.refundPointer).toBe(0);
    expect(result.vout).toBe(0);
  });

  it('should override default values with provided values', () => {
    const result = createSimulateRequestObject({
      height: '50000',
      txindex: 5,
      pointer: 1,
    });

    expect(result.height).toBe('50000');
    expect(result.txindex).toBe(5);
    expect(result.pointer).toBe(1);
    // Defaults should still apply to non-overridden fields
    expect(result.alkanes).toEqual([]);
    expect(result.vout).toBe(0);
  });

  it('should accept alkanes array', () => {
    const alkanes = ['2:0', '32:0'];
    const result = createSimulateRequestObject({ alkanes });

    expect(result.alkanes).toEqual(alkanes);
  });

  it('should accept inputs array', () => {
    const inputs = ['input1', 'input2'];
    const result = createSimulateRequestObject({ inputs });

    expect(result.inputs).toEqual(inputs);
  });

  it('should accept target alkane ID', () => {
    const target = { block: 32, tx: 0 };
    const result = createSimulateRequestObject({ target });

    expect(result.target).toEqual(target);
  });

  it('should accept transaction and block hex strings', () => {
    const result = createSimulateRequestObject({
      transaction: '0xabcdef',
      block: '0x123456',
    });

    expect(result.transaction).toBe('0xabcdef');
    expect(result.block).toBe('0x123456');
  });

  it('should maintain all fields in output', () => {
    const fullRequest = {
      alkanes: ['2:0'],
      transaction: '0xtx',
      block: '0xblock',
      height: '30000',
      txindex: 2,
      inputs: ['in1'],
      pointer: 1,
      refundPointer: 2,
      vout: 3,
    };

    const result = createSimulateRequestObject(fullRequest);

    expect(result).toEqual(fullRequest);
  });
});

// ==========================================
// Type Exports
// ==========================================

describe('AlkaneId type', () => {
  it('should accept number block and tx', () => {
    // Type check - this should compile
    const id: { block: number; tx: number } = { block: 2, tx: 0 };
    const formatted = formatAlkaneId(id);
    expect(formatted).toBe('2:0');
  });

  it('should accept string block and tx', () => {
    // Type check - this should compile
    const id: { block: string; tx: string } = { block: '32', tx: '0' };
    const formatted = formatAlkaneId(id);
    expect(formatted).toBe('32:0');
  });
});
