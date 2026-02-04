import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { VAULT_OPCODES } from '@/constants';

export type VaultDepositData = {
  vaultContractId: string; // e.g., "2:123" for vault contract
  tokenId: string; // e.g., "2:0" for DIESEL
  amount: string; // Amount to deposit in base units (alks)
  feeRate: number; // sats/vB
};

/**
 * Build protostone string for vault deposit (Purchase) operation
 * Format: [vault_block,vault_tx,opcode,amount]:pointer:refund
 */
function buildVaultDepositProtostone(params: {
  vaultContractId: string;
  amount: string;
  pointer?: string;
  refund?: string;
}): string {
  const { vaultContractId, amount, pointer = 'v1', refund = 'v1' } = params;
  const [vaultBlock, vaultTx] = vaultContractId.split(':');

  // Build cellpack: [vault_block, vault_tx, opcode(Purchase=1), amount]
  const cellpack = [
    vaultBlock,
    vaultTx,
    VAULT_OPCODES.Purchase,
    amount,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for vault deposit
 * Format: "block:tx:amount" for the token being deposited
 */
function buildVaultDepositInputRequirements(params: {
  tokenId: string;
  amount: string;
}): string {
  const [block, tx] = params.tokenId.split(':');
  return `${block}:${tx}:${params.amount}`;
}

/**
 * Hook to handle vault deposit transactions
 * Uses opcode 1 (Purchase) to deposit tokens and receive vault units
 */
export function useVaultDeposit() {
  const { isConnected } = useWallet();
  const provider = useSandshrewProvider();

  return useMutation({
    mutationFn: async (depositData: VaultDepositData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Verify wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      // Build protostone for vault deposit
      const protostone = buildVaultDepositProtostone({
        vaultContractId: depositData.vaultContractId,
        amount: new BigNumber(depositData.amount).toFixed(0),
      });

      // Build input requirements (the token being deposited)
      const inputRequirements = buildVaultDepositInputRequirements({
        tokenId: depositData.tokenId,
        amount: new BigNumber(depositData.amount).toFixed(0),
      });

      // Execute using alkanesExecuteTyped (handles address defaults automatically)
      const result = await provider.alkanesExecuteTyped({
        inputRequirements,
        protostones: protostone,
        feeRate: depositData.feeRate,
        autoConfirm: true,
        changeAddress: 'p2tr:0',
        alkanesChangeAddress: 'p2tr:0',
      });

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
