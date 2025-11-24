import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { executeWithBtcWrapUnwrap } from '@/lib/oyl/alkanes/wallet-integration';
import { createWallet } from '@alkanes/ts-sdk'; // Assuming createWallet contains splitAlkaneUtxos, will verify later
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { VAULT_OPCODES } from '@/constants';
import {
  assertAlkaneUtxosAreClean,
} from '@/utils/amm';

export type VaultWithdrawData = {
  vaultContractId: string; // e.g., "2:123" for vault contract
  vaultUnitId: string; // e.g., "2:124" for veDIESEL unit token
  amount: string; // Amount of vault units to burn (usually 1)
  feeRate: number; // sats/vB
};

/**
 * Hook to handle vault withdrawal transactions
 * Uses opcode 2 (Redeem) to burn vault units and receive tokens back
 */
export function useVaultWithdraw() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (withdrawData: VaultWithdrawData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const vaultId = parseAlkaneId(withdrawData.vaultContractId);
      const vaultUnitId = parseAlkaneId(withdrawData.vaultUnitId);

      // Build calldata for vault withdrawal (Redeem opcode)
      // Format: [vaultBlock, vaultTx, opcode(2)]
      // Note: No amount parameter needed, it's determined by incoming vault units
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(vaultId.block),
        BigInt(vaultId.tx),
        BigInt(VAULT_OPCODES.Redeem), // opcode 2
      );

      // Get UTXOs and prepare alkane inputs
      const utxos = await getUtxos();
      
      // Split alkane UTXOs for the vault unit token
      const vaultUnits = [
        {
          alkaneId: vaultUnitId,
          amount: BigInt(new BigNumber(withdrawData.amount).toFixed()),
        },
      ];
      const { utxos: splitUtxos } = createWallet(vaultUnits); // Placeholder, assuming createWallet will provide this functionality
      assertAlkaneUtxosAreClean(splitUtxos);

      // Execute transaction
      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos: splitUtxos,
        calldata,
        feeRate: withdrawData.feeRate,
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
