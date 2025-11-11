import { useMutation } from '@tanstack/react-query';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { VAULT_OPCODES } from '@/constants';

export type VaultClaimData = {
  vaultContractId: string; // e.g., "2:123" for vault contract
  feeRate: number; // sats/vB
};

/**
 * Hook to claim accumulated vault rewards
 * Uses opcode 5 (ReceiveRewards) to claim rewards from the vault
 */
export function useVaultClaim() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (claimData: VaultClaimData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const vaultId = parseAlkaneId(claimData.vaultContractId);

      // Build calldata for reward claim
      // Format: [vaultBlock, vaultTx, opcode(5)]
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(vaultId.block),
        BigInt(vaultId.tx),
        BigInt(VAULT_OPCODES.ReceiveRewards), // opcode 5
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
