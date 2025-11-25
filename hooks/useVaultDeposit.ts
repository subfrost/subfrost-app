import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
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
      if (!provider) throw new Error('Provider not available');

      // Dynamic import to avoid WASM loading at SSR time
      const { amm, executeWithBtcWrapUnwrap } = await import('@/ts-sdk');

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
          amount: new BigNumber(depositData.amount).toFixed(),
        },
      ];
      const { selectedUtxos } = amm.factory.splitAlkaneUtxos(depositTokens, utxos);
      assertAlkaneUtxosAreClean(selectedUtxos);

      // Execute transaction
      const { executeResult } = await executeWithBtcWrapUnwrap({
        utxos,
        alkanesUtxos: selectedUtxos,
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
