import { useMutation } from '@tanstack/react-query';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { GAUGE_OPCODES } from '@/constants';

export type GaugeClaimData = {
  gaugeContractId: string; // e.g., "2:456" for gauge contract
  feeRate: number; // sats/vB
};

/**
 * Hook to claim accumulated gauge rewards
 * Claims DIESEL or configured reward token based on staked amount and boost
 */
export function useGaugeClaim() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (claimData: GaugeClaimData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const gaugeId = parseAlkaneId(claimData.gaugeContractId);

      // Build calldata for gauge reward claim
      // Format: [gaugeBlock, gaugeTx, opcode(3)]
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(gaugeId.block),
        BigInt(gaugeId.tx),
        BigInt(GAUGE_OPCODES.ClaimRewards),
      );

      // Get UTXOs
      const utxos = await getUtxos();

      // Execute transaction
      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos: [], // No alkane inputs needed for claiming
        calldata,
        feeRate: claimData.feeRate,
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
