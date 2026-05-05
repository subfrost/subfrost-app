/**
 * Tests for poolSimulation: protostone decoder + chain-aware reserve
 * replay. Golden vectors come from the two real reverted mainnet swaps
 * (`2c51b734…` and `c52ef600…`) we forensically decoded on 2026-05-05.
 *
 * Both txs encode `factory.SwapExactTokensForTokens` with path
 * (32:0 frBTC) → (2:0 DIESEL). We verify:
 *   - The decoder pulls the right amount_in / amount_out_min / path.
 *   - applyPendingSwapsToReserves shifts reserves by the correct delta.
 *   - A pool-mismatched swap is filtered out.
 *   - Malformed bytes return null (no throws).
 */

import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import {
  extractProtostoneVarints,
  decodeSwapProtostone,
  annotateSellsToken0,
  decodePendingSwapsOnPool,
  simulateExactInSwap,
  applyPendingSwapsToReserves,
  type PoolReserves,
} from '../poolSimulation';
import type { PendingTxSummary } from '@/hooks/usePendingTxs';

const FACTORY_ID = '4:65522';
const POOL_TOKEN0 = '2:0';   // DIESEL — lower id by canonical order
const POOL_TOKEN1 = '32:0';  // frBTC

// Real mainnet OP_RETURN script (full scriptPubKey hex from
// mempool.space/api/tx/2c51b734…) — `6a 5d 32` prefix + 50-byte payload.
const TX_2C51_OP_RETURN_SCRIPT_HEX =
  '6a5d321600ff7f8190ec8ad0abc0a884c9ffff89bab0c09001ff7f80898284bbb7eeff82818688a5b3baebef01ff7fbb81fabd9f07';
const TX_C52E_OP_RETURN_SCRIPT_HEX =
  '6a5d321600ff7f8190ec8ad0abc0a884c9ffff89bab0c09001ff7f808982848ed3b5d281d5868885f7aaf39401ff7f9981fabd9f07';

const hexToU8 = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));

describe('extractProtostoneVarints', () => {
  it('decodes the runestone wrapper from a real mainnet tx', () => {
    const v = extractProtostoneVarints(hexToU8(TX_2C51_OP_RETURN_SCRIPT_HEX));
    expect(v).not.toBeNull();
    // After 15-byte u128 reconstruction the protostone-level varint
    // stream is the field sequence (protocol_tag=1, length=8, then 8
    // body varints encoding {ProtoPointer=91 → 1, Refund=93 → 1,
    // Message=81 → chunk1, Message=81 → chunk2}). The cellpack
    // (4, 65522, 13, …, amount_in, amount_out_min, deadline) lives
    // INSIDE the Message chunks, not at the protostone-level stream.
    const asStrings = (v ?? []).map(x => x.toString());
    expect(asStrings[0]).toBe('1');           // protocol_tag = alkanes
    expect(asStrings[1]).toBe('8');           // body length
    expect(asStrings).toContain('91');        // ProtoPointer tag
    expect(asStrings).toContain('93');        // Refund tag
    expect(asStrings).toContain('81');        // Message tag (multiple)
  });

  it('returns null for a non-runestone OP_RETURN', () => {
    expect(extractProtostoneVarints(hexToU8('6a020102'))).toBeNull();
  });

  it('returns null for too-short scripts', () => {
    expect(extractProtostoneVarints(hexToU8('6a'))).toBeNull();
    expect(extractProtostoneVarints(new Uint8Array(0))).toBeNull();
  });
});

describe('decodeSwapProtostone', () => {
  it('decodes a frBTC→DIESEL exact-in swap from the real tx', () => {
    const v = extractProtostoneVarints(hexToU8(TX_2C51_OP_RETURN_SCRIPT_HEX))!;
    const swap = decodeSwapProtostone(v, FACTORY_ID);
    expect(swap).not.toBeNull();
    expect(swap!.isExactIn).toBe(true);
    // The cellpack stores amount_in as 12543414 (note: the on-chain
    // trace shows 12543415 because the SDK feeds N+1; the recorded
    // protostone uses N. Either way it's the user's frBTC dust value.)
    expect(swap!.amountIn).toBe(12543414n);
    expect(swap!.amountOutMin).toBe(119700000000n);
    expect(swap!.poolPath).toEqual([
      { block: 32n, tx: 0n },
      { block: 2n, tx: 0n },
    ]);
  });

  it('decodes the second (different amounts) tx independently', () => {
    const v = extractProtostoneVarints(hexToU8(TX_C52E_OP_RETURN_SCRIPT_HEX))!;
    const swap = decodeSwapProtostone(v, FACTORY_ID);
    expect(swap).not.toBeNull();
    expect(swap!.amountIn).toBe(4495500n);
    expect(swap!.amountOutMin).toBe(39244356650n);
  });

  it('returns null when the factory ID does not match', () => {
    const v = extractProtostoneVarints(hexToU8(TX_2C51_OP_RETURN_SCRIPT_HEX))!;
    expect(decodeSwapProtostone(v, '4:99999')).toBeNull();
  });

  it('returns null for varints lacking a swap signature', () => {
    expect(decodeSwapProtostone([1n, 2n, 3n], FACTORY_ID)).toBeNull();
  });
});

describe('annotateSellsToken0', () => {
  it('marks sellsToken0=false for frBTC→DIESEL when token0=DIESEL', () => {
    const v = extractProtostoneVarints(hexToU8(TX_2C51_OP_RETURN_SCRIPT_HEX))!;
    const raw = decodeSwapProtostone(v, FACTORY_ID)!;
    const marked = annotateSellsToken0(raw, POOL_TOKEN0);
    expect(marked.sellsToken0).toBe(false);
  });

  it('marks sellsToken0=true when path[0] equals token0', () => {
    const swap = annotateSellsToken0(
      {
        factoryId: FACTORY_ID,
        poolPath: [{ block: 2n, tx: 0n }, { block: 32n, tx: 0n }],
        amountIn: 1n,
        amountOutMin: 0n,
        isExactIn: true,
      },
      POOL_TOKEN0,
    );
    expect(swap.sellsToken0).toBe(true);
  });
});

describe('simulateExactInSwap', () => {
  // Pool reserves at block 948085 from forensic queries.
  const reserves: PoolReserves = {
    reserve0: 871228768191n,  // DIESEL
    reserve1: 129598208n,     // frBTC
  };
  const FEE_1PCT = 10n;  // per 1000

  it('matches the on-chain output for the user\'s 0.1254 frBTC swap', () => {
    // Sells frBTC (token1) → DIESEL (token0). Confirmed result on-chain
    // would be ~76.18B DIESEL sub-units (=761.81 DIESEL) — verified
    // against alkanes_simulate(opcode 13) earlier.
    const swap = annotateSellsToken0(
      {
        factoryId: FACTORY_ID,
        poolPath: [{ block: 32n, tx: 0n }, { block: 2n, tx: 0n }],
        amountIn: 12543414n,
        amountOutMin: 119700000000n,
        isExactIn: true,
      },
      POOL_TOKEN0,
    );
    const post = simulateExactInSwap(reserves, swap, FEE_1PCT);
    // Pool gains frBTC, loses DIESEL.
    expect(post.reserve1).toBe(reserves.reserve1 + 12543414n);
    // Lost DIESEL roughly matches the 761.8 DIESEL we computed
    // forensically (within rounding tolerance).
    const dieselOut = reserves.reserve0 - post.reserve0;
    expect(dieselOut).toBeGreaterThan(76_000_000_000n); // ≥ 760 DIESEL
    expect(dieselOut).toBeLessThan(77_000_000_000n);    // ≤ 770 DIESEL
  });

  it('is a no-op for swaps with reserves <= 0', () => {
    const swap = annotateSellsToken0(
      {
        factoryId: FACTORY_ID,
        poolPath: [{ block: 2n, tx: 0n }, { block: 32n, tx: 0n }],
        amountIn: 100n,
        amountOutMin: 0n,
        isExactIn: true,
      },
      POOL_TOKEN0,
    );
    const empty = { reserve0: 0n, reserve1: 0n };
    expect(simulateExactInSwap(empty, swap, FEE_1PCT)).toEqual(empty);
  });

  it('is a no-op for exact-out swaps (opcode 14) — conservative skip', () => {
    const swap = annotateSellsToken0(
      {
        factoryId: FACTORY_ID,
        poolPath: [{ block: 2n, tx: 0n }, { block: 32n, tx: 0n }],
        amountIn: 100n,
        amountOutMin: 0n,
        isExactIn: false,  // opcode 14
      },
      POOL_TOKEN0,
    );
    expect(simulateExactInSwap(reserves, swap, FEE_1PCT)).toEqual(reserves);
  });
});

describe('applyPendingSwapsToReserves', () => {
  const reserves: PoolReserves = {
    reserve0: 1_000_000_000_000n,
    reserve1: 100_000_000n,
  };
  const FEE_1PCT = 10n;

  it('chains two swaps in order', () => {
    const sellsToken0Swap = annotateSellsToken0(
      {
        factoryId: FACTORY_ID,
        poolPath: [{ block: 2n, tx: 0n }, { block: 32n, tx: 0n }],
        amountIn: 100_000_000n,
        amountOutMin: 0n,
        isExactIn: true,
      },
      POOL_TOKEN0,
    );
    const a = simulateExactInSwap(reserves, sellsToken0Swap, FEE_1PCT);
    const b = simulateExactInSwap(a, sellsToken0Swap, FEE_1PCT);
    const chained = applyPendingSwapsToReserves(reserves, [sellsToken0Swap, sellsToken0Swap], FEE_1PCT);
    expect(chained).toEqual(b);
  });

  it('returns reserves unchanged for empty pending list', () => {
    expect(applyPendingSwapsToReserves(reserves, [], FEE_1PCT)).toEqual(reserves);
  });
});

describe('decodePendingSwapsOnPool', () => {
  function makePending(opReturnHex: string, btcOut = 1000n): PendingTxSummary {
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32), 0);
    tx.addOutput(Buffer.from(opReturnHex, 'hex'), btcOut);
    return {
      txid: tx.getId(),
      btcDelta: -btcOut,
      alkaneDeltas: [],
      contractOutputsUncertain: true,
      hex: tx.toHex(),
    };
  }

  it('decodes pending swap targeting our pool', () => {
    const pending = [makePending(TX_2C51_OP_RETURN_SCRIPT_HEX)];
    const out = decodePendingSwapsOnPool(pending, FACTORY_ID, POOL_TOKEN0, POOL_TOKEN1);
    expect(out).toHaveLength(1);
    expect(out[0].amountIn).toBe(12543414n);
    expect(out[0].sellsToken0).toBe(false);
  });

  it('skips txs flagged as non-cellpack (contractOutputsUncertain=false)', () => {
    const pending = [{
      ...makePending(TX_2C51_OP_RETURN_SCRIPT_HEX),
      contractOutputsUncertain: false,
    }];
    expect(decodePendingSwapsOnPool(pending, FACTORY_ID, POOL_TOKEN0, POOL_TOKEN1)).toHaveLength(0);
  });

  it('skips swaps for a different pool', () => {
    const pending = [makePending(TX_2C51_OP_RETURN_SCRIPT_HEX)];
    // Pool with different tokens → swap path won't match
    expect(decodePendingSwapsOnPool(pending, FACTORY_ID, '2:0', '999:0')).toHaveLength(0);
  });

  it('survives malformed pending entries', () => {
    const pending: PendingTxSummary[] = [
      { txid: 'x', btcDelta: 0n, alkaneDeltas: [], contractOutputsUncertain: true, hex: 'not-hex' },
      makePending(TX_2C51_OP_RETURN_SCRIPT_HEX),
    ];
    const out = decodePendingSwapsOnPool(pending, FACTORY_ID, POOL_TOKEN0, POOL_TOKEN1);
    expect(out).toHaveLength(1);
  });
});
