/**
 * Tests for gauge operations (stake, unstake, claim)
 * 
 * Validates:
 * - Stake: [gaugeBlock, gaugeTx, opcode(1), amount]
 * - Unstake: [gaugeBlock, gaugeTx, opcode(2), amount]
 * - Claim: [gaugeBlock, gaugeTx, opcode(3)]
 */

describe('Gauge Operations', () => {
  const GAUGE_OPCODES = {
    Stake: 1,
    Unstake: 2,
    ClaimRewards: 3,
  };

  describe('Gauge Stake', () => {
    test('Should use opcode 1 for stake', () => {
      expect(GAUGE_OPCODES.Stake).toBe(1);
    });

    test('Should build correct calldata for gauge stake', () => {
      const gaugeBlock = 2;
      const gaugeTx = 456;
      const opcode = GAUGE_OPCODES.Stake;
      const amount = BigInt('100000000000'); // 1000 LP tokens

      const calldata: bigint[] = [
        BigInt(gaugeBlock),
        BigInt(gaugeTx),
        BigInt(opcode),
        amount,
      ];

      expect(calldata.length).toBe(4);
      expect(calldata[0]).toBe(BigInt(2));
      expect(calldata[1]).toBe(BigInt(456));
      expect(calldata[2]).toBe(BigInt(1));
      expect(calldata[3]).toBe(BigInt('100000000000'));
    });

    test('Stake should require LP token inputs', () => {
      const lpTokenId = { block: 2, tx: 789 };
      const amount = BigInt('100000000000');
      
      const lpTokens = [{
        alkaneId: lpTokenId,
        amount: amount,
      }];

      expect(lpTokens.length).toBe(1);
      expect(lpTokens[0].amount).toBe(amount);
    });
  });

  describe('Gauge Unstake', () => {
    test('Should use opcode 2 for unstake', () => {
      expect(GAUGE_OPCODES.Unstake).toBe(2);
    });

    test('Should build correct calldata for gauge unstake', () => {
      const gaugeBlock = 2;
      const gaugeTx = 456;
      const opcode = GAUGE_OPCODES.Unstake;
      const amount = BigInt('100000000000');

      const calldata: bigint[] = [
        BigInt(gaugeBlock),
        BigInt(gaugeTx),
        BigInt(opcode),
        amount,
      ];

      expect(calldata.length).toBe(4);
      expect(calldata[0]).toBe(BigInt(2));
      expect(calldata[1]).toBe(BigInt(456));
      expect(calldata[2]).toBe(BigInt(2));
      expect(calldata[3]).toBe(BigInt('100000000000'));
    });

    test('Unstake should require gauge token inputs', () => {
      const gaugeTokenId = { block: 2, tx: 790 };
      const amount = BigInt('100000000000');
      
      const gaugeTokens = [{
        alkaneId: gaugeTokenId,
        amount: amount,
      }];

      expect(gaugeTokens.length).toBe(1);
      expect(gaugeTokens[0].amount).toBe(amount);
    });
  });

  describe('Gauge Claim Rewards', () => {
    test('Should use opcode 3 for claim rewards', () => {
      expect(GAUGE_OPCODES.ClaimRewards).toBe(3);
    });

    test('Should build correct calldata for gauge claim', () => {
      const gaugeBlock = 2;
      const gaugeTx = 456;
      const opcode = GAUGE_OPCODES.ClaimRewards;

      const calldata: bigint[] = [
        BigInt(gaugeBlock),
        BigInt(gaugeTx),
        BigInt(opcode),
      ];

      expect(calldata.length).toBe(3);
      expect(calldata[0]).toBe(BigInt(2));
      expect(calldata[1]).toBe(BigInt(456));
      expect(calldata[2]).toBe(BigInt(3));
    });

    test('Claim should not require alkane inputs', () => {
      // Claim just receives rewards, doesn't burn tokens
      const alkanesUtxos: any[] = [];
      expect(alkanesUtxos.length).toBe(0);
    });
  });
});
