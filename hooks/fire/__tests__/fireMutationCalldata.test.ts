/**
 * FIRE Protocol Mutation Calldata Tests
 *
 * Validates the protostone format for each FIRE mutation hook.
 * Follows the pattern in hooks/__tests__/mutations/calldata.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  FIRE_STAKING_OPCODES,
  FIRE_BONDING_OPCODES,
  FIRE_REDEMPTION_OPCODES,
} from '@/constants';
import { LOCK_TIERS } from '@/utils/fireCalculations';

/**
 * Build protostone string for FIRE operations (mirrors what mutation hooks do).
 */
function buildFireProtostone(params: {
  contractId: string;
  opcode: string;
  args?: (string | number)[];
}): string {
  const { contractId, opcode, args = [] } = params;
  const [block, tx] = contractId.split(':');
  const cellpack = [block, tx, opcode, ...args].join(',');
  return `[${cellpack}]:v0:v0`;
}

describe('FIRE Stake Calldata', () => {
  const stakingId = '4:257';

  it('should build correct stake protostone with no lock', () => {
    const proto = buildFireProtostone({
      contractId: stakingId,
      opcode: FIRE_STAKING_OPCODES.Stake,
      args: [LOCK_TIERS[0].duration], // 0 blocks = no lock
    });
    expect(proto).toBe('[4,257,1,0]:v0:v0');
  });

  it('should build correct stake protostone with 1-year lock', () => {
    const proto = buildFireProtostone({
      contractId: stakingId,
      opcode: FIRE_STAKING_OPCODES.Stake,
      args: [LOCK_TIERS[5].duration], // 52560 blocks
    });
    expect(proto).toBe('[4,257,1,52560]:v0:v0');
  });

  it('should build correct unstake protostone', () => {
    const proto = buildFireProtostone({
      contractId: stakingId,
      opcode: FIRE_STAKING_OPCODES.Unstake,
      args: [0], // position_id
    });
    expect(proto).toBe('[4,257,2,0]:v0:v0');
  });

  it('should build correct claim protostone', () => {
    const proto = buildFireProtostone({
      contractId: stakingId,
      opcode: FIRE_STAKING_OPCODES.ClaimRewards,
    });
    expect(proto).toBe('[4,257,3]:v0:v0');
  });
});

describe('FIRE Bond Calldata', () => {
  const bondingId = '4:259';

  it('should build correct bond protostone', () => {
    const proto = buildFireProtostone({
      contractId: bondingId,
      opcode: FIRE_BONDING_OPCODES.Bond,
    });
    expect(proto).toBe('[4,259,1]:v0:v0');
  });

  it('should build correct claim vested protostone', () => {
    const proto = buildFireProtostone({
      contractId: bondingId,
      opcode: FIRE_BONDING_OPCODES.ClaimVested,
      args: [3], // bond_id
    });
    expect(proto).toBe('[4,259,2,3]:v0:v0');
  });
});

describe('FIRE Redeem Calldata', () => {
  const redemptionId = '4:260';

  it('should build correct redeem protostone', () => {
    const proto = buildFireProtostone({
      contractId: redemptionId,
      opcode: FIRE_REDEMPTION_OPCODES.Redeem,
    });
    expect(proto).toBe('[4,260,1]:v0:v0');
  });
});

describe('FIRE Input Requirements', () => {
  it('should format LP token input for staking', () => {
    const lpTokenId = '2:6';
    const amount = '1000000000';
    const inputReq = `A:${lpTokenId}:${amount}`;
    expect(inputReq).toBe('A:2:6:1000000000');
  });

  it('should format FIRE token input for redemption', () => {
    const fireTokenId = '4:256';
    const amount = '500000000';
    const inputReq = `A:${fireTokenId}:${amount}`;
    expect(inputReq).toBe('A:4:256:500000000');
  });
});

describe('FIRE Contract IDs', () => {
  it('should have correct opcode values', () => {
    expect(FIRE_STAKING_OPCODES.Stake).toBe('1');
    expect(FIRE_STAKING_OPCODES.Unstake).toBe('2');
    expect(FIRE_STAKING_OPCODES.ClaimRewards).toBe('3');
    expect(FIRE_BONDING_OPCODES.Bond).toBe('1');
    expect(FIRE_BONDING_OPCODES.ClaimVested).toBe('2');
    expect(FIRE_REDEMPTION_OPCODES.Redeem).toBe('1');
  });
});
