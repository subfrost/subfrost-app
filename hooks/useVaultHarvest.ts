import { useMutation } from '@tanstack/react-query';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { VAULT_OPCODES } from '@/constants';

export type VaultHarvestData = {
  vaultContractId: string; // e.g., "2:123" for vault contract
  feeRate: number; // sats/vB
};

/**
 * Hook to harvest vault LP fees and distribute rewards
 * Uses opcode 6 (ClaimAndDistributeRewards) - public operation for strategist
 * 
 * This extracts accumulated LP fees from k-value growth:
 * 1. Calculates extractable LP based on k-value delta
 * 2. Burns LP tokens to receive DIESEL + frBTC
 * 3. Swaps frBTC → DIESEL via AMM
 * 4. Distributes: 10% auto-compound, 90% to reward pool
 */
export function useVaultHarvest() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (harvestData: VaultHarvestData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const vaultId = parseAlkaneId(harvestData.vaultContractId);

      // Build calldata for harvest operation
      // Format: [vaultBlock, vaultTx, opcode(6)]
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(vaultId.block),
        BigInt(vaultId.tx),
        BigInt(VAULT_OPCODES.ClaimAndDistributeRewards), // opcode 6
      );

      // Get UTXOs
      const utxos = await getUtxos();

      // Execute transaction
      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos: [], // No alkane inputs needed for harvest
        calldata,
        feeRate: harvestData.feeRate,
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
