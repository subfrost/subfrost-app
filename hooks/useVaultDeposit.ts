import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { amm } from '@oyl/sdk';
import { executeWithBtcWrapUnwrap } from '@oyl/sdk/lib/alkanes';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useSignerShim } from '@/hooks/useSignerShim';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { VAULT_OPCODES } from '@/constants';
import {
  assertAlkaneUtxosAreClean,
  getFutureBlockHeight,
} from '@/utils/amm';

export type VaultDepositData = {
  vaultContractId: string; // e.g., "2:123" for vault contract
  tokenId: string; // e.g., "2:0" for DIESEL
  amount: string; // Amount to deposit in base units (alks)
  feeRate: number; // sats/vB
};

/**
 * Hook to handle vault deposit transactions
 * Uses opcode 1 (Purchase) to deposit tokens and receive vault units
 */
export function useVaultDeposit() {
  const { getUtxos, account, isConnected } = useWallet();
  const signerShim = useSignerShim();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (depositData: VaultDepositData) => {
      if (!isConnected) throw new Error('Wallet not connected');

      const vaultId = parseAlkaneId(depositData.vaultContractId);
      const tokenId = parseAlkaneId(depositData.tokenId);

      // Build calldata for vault deposit (Purchase opcode)
      // Format: [vaultBlock, vaultTx, opcode(1), amount]
      const calldata: bigint[] = [];
      calldata.push(
        BigInt(vaultId.block),
        BigInt(vaultId.tx),
        BigInt(VAULT_OPCODES.Purchase), // opcode 1
        BigInt(new BigNumber(depositData.amount).toFixed()),
      );

      // Get UTXOs and prepare alkane inputs
      const utxos = await getUtxos();
      
      // Split alkane UTXOs for the deposit token
      const depositTokens = [
        {
          alkaneId: tokenId,
          amount: BigInt(new BigNumber(depositData.amount).toFixed()),
        },
      ];
      const { utxos: splitUtxos } = amm.factory.splitAlkaneUtxos(depositTokens, utxos);
      assertAlkaneUtxosAreClean(splitUtxos);

      // Execute transaction
      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos: splitUtxos,
        calldata,
        feeRate: depositData.feeRate,
        account,
        provider,
        signer: signerShim,
        frbtcWrapAmount: undefined, // No BTC wrapping for vault deposits
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
