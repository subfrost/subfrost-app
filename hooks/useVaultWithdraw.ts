import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { VAULT_OPCODES } from '@/constants';

export type VaultWithdrawData = {
  vaultContractId: string; // e.g., "2:123" for vault contract
  vaultUnitId: string; // e.g., "2:124" for veDIESEL unit token
  amount: string; // Amount of vault units to burn (usually 1)
  feeRate: number; // sats/vB
};

/**
 * Build protostone string for vault withdrawal (Redeem) operation
 * Format: [vault_block,vault_tx,opcode]:pointer:refund
 * Note: No amount parameter needed, it's determined by incoming vault units
 */
function buildVaultWithdrawProtostone(params: {
  vaultContractId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { vaultContractId, pointer = 'v1', refund = 'v1' } = params;
  const [vaultBlock, vaultTx] = vaultContractId.split(':');

  // Build cellpack: [vault_block, vault_tx, opcode(Redeem=2)]
  const cellpack = [
    vaultBlock,
    vaultTx,
    VAULT_OPCODES.Redeem,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for vault withdrawal
 * Format: "block:tx:amount" for the vault units being burned
 */
function buildVaultWithdrawInputRequirements(params: {
  vaultUnitId: string;
  amount: string;
}): string {
  const [block, tx] = params.vaultUnitId.split(':');
  return `${block}:${tx}:${params.amount}`;
}

/**
 * Hook to handle vault withdrawal transactions
 * Uses opcode 2 (Redeem) to burn vault units and receive tokens back
 */
export function useVaultWithdraw() {
  const { account, isConnected } = useWallet();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (withdrawData: VaultWithdrawData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Build protostone for vault withdrawal
      const protostone = buildVaultWithdrawProtostone({
        vaultContractId: withdrawData.vaultContractId,
      });

      // Build input requirements (the vault units being burned)
      const inputRequirements = buildVaultWithdrawInputRequirements({
        vaultUnitId: withdrawData.vaultUnitId,
        amount: new BigNumber(withdrawData.amount).toFixed(0),
      });

      // Get recipient address (taproot for alkanes)
      const recipientAddress = account?.taproot?.address || account?.nativeSegwit?.address;
      if (!recipientAddress) throw new Error('No recipient address available');

      const toAddresses = JSON.stringify([recipientAddress]);
      const options = JSON.stringify({
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: true,
      });

      // Execute using alkanesExecuteWithStrings
      const result = await provider.alkanesExecuteWithStrings(
        toAddresses,
        inputRequirements,
        protostone,
        withdrawData.feeRate,
        undefined, // envelope_hex
        options
      );

      // Parse result
      const txId = result?.txid || result?.reveal_txid;

      return {
        success: true,
        transactionId: txId,
      } as {
        success: boolean;
        transactionId?: string;
      };
    },
  });
}
