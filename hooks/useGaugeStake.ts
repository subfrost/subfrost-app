import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { amm } from '@oyl/sdk';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { assertAlkaneUtxosAreClean } from '@/utils/amm';
import { GAUGE_OPCODES } from '@/constants';

export type GaugeStakeData = {
  gaugeContractId: string; // e.g., "2:456" for gauge contract
  lpTokenId: string; // e.g., "2:789" for LP token
  amount: string; // Amount of LP tokens to stake
  feeRate: number; // sats/vB
};

/**
 * Hook to stake LP tokens in a gauge
 * Staking LP tokens receives gauge receipt tokens and starts accruing boosted rewards
 */
export function useGaugeStake() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (stakeData: GaugeStakeData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const gaugeId = parseAlkaneId(stakeData.gaugeContractId);
      const lpTokenId = parseAlkaneId(stakeData.lpTokenId);

      // Build calldata for gauge stake
      // Format: [gaugeBlock, gaugeTx, opcode(1), amount]
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(gaugeId.block),
        BigInt(gaugeId.tx),
        BigInt(GAUGE_OPCODES.Stake),
        BigInt(new BigNumber(stakeData.amount).toFixed()),
      );

      // Get UTXOs and prepare LP token inputs
      const utxos = await getUtxos();
      
      const lpTokens = [
        {
          alkaneId: lpTokenId,
          amount: BigInt(new BigNumber(stakeData.amount).toFixed()),
        },
      ];
      const { utxos: splitUtxos } = amm.factory.splitAlkaneUtxos(lpTokens, utxos);
      assertAlkaneUtxosAreClean(splitUtxos);

      // Execute transaction
      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos: splitUtxos,
        calldata,
        feeRate: stakeData.feeRate,
        account,
        provider,
        signer: signerShim,
        frbtcWrapAmount: undefined,
        frbtcUnwrapAmount: undefined,
        addDieselMint: false,
      });

      return { 
        success: true, 
        transactionId: executeResult?.txId 
      } as {
        success: boolean;
        transactionId?: string;
      };
    },
  });
}
