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

export type GaugeUnstakeData = {
  gaugeContractId: string; // e.g., "2:456" for gauge contract
  gaugeTokenId: string; // e.g., "2:790" for gauge receipt token
  amount: string; // Amount of gauge tokens to burn
  feeRate: number; // sats/vB
};

/**
 * Hook to unstake LP tokens from a gauge
 * Burns gauge receipt tokens to receive LP tokens back
 */
export function useGaugeUnstake() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (unstakeData: GaugeUnstakeData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const gaugeId = parseAlkaneId(unstakeData.gaugeContractId);
      const gaugeTokenId = parseAlkaneId(unstakeData.gaugeTokenId);

      // Build calldata for gauge unstake
      // Format: [gaugeBlock, gaugeTx, opcode(2), amount]
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(gaugeId.block),
        BigInt(gaugeId.tx),
        BigInt(GAUGE_OPCODES.Unstake),
        BigInt(new BigNumber(unstakeData.amount).toFixed()),
      );

      // Get UTXOs and prepare gauge token inputs
      const utxos = await getUtxos();
      
      const gaugeTokens = [
        {
          alkaneId: gaugeTokenId,
          amount: BigInt(new BigNumber(unstakeData.amount).toFixed()),
        },
      ];
      const { utxos: splitUtxos } = amm.factory.splitAlkaneUtxos(gaugeTokens, utxos);
      assertAlkaneUtxosAreClean(splitUtxos);

      // Execute transaction
      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos: splitUtxos,
        calldata,
        feeRate: unstakeData.feeRate,
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
