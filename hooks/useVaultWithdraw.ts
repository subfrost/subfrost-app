import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { VAULT_OPCODES } from '@/constants';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export type VaultWithdrawData = {
  vaultContractId: string; // e.g., "2:123" for vault contract
  vaultUnitId: string; // e.g., "2:124" for FIRE unit token
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
  const { isConnected, walletType, account, signTaprootPsbt, signSegwitPsbt, network } = useWallet();
  const provider = useSandshrewProvider();
  const isBrowserWallet = walletType === 'browser';
  const useActualAddresses = isBrowserWallet || network === 'devnet';

  return useMutation({
    mutationFn: async (withdrawData: VaultWithdrawData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Verify wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      // Build protostone for vault withdrawal
      const protostone = buildVaultWithdrawProtostone({
        vaultContractId: withdrawData.vaultContractId,
      });

      // Build input requirements (the vault units being burned)
      const inputRequirements = buildVaultWithdrawInputRequirements({
        vaultUnitId: withdrawData.vaultUnitId,
        amount: new BigNumber(withdrawData.amount).toFixed(0),
      });

      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      const toAddresses = useActualAddresses ? [taprootAddress || ''] : ['p2tr:0'];
      const changeAddr = useActualAddresses ? (segwitAddress || taprootAddress || '') : 'p2tr:0';
      const alkanesChangeAddr = useActualAddresses ? (taprootAddress || '') : 'p2tr:0';

      const result = await provider.alkanesExecuteTyped({
        inputRequirements,
        protostones: protostone,
        feeRate: withdrawData.feeRate,
        autoConfirm: !isBrowserWallet,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
      });

      // Auto-completed by SDK (keystore wallets with autoConfirm=true)
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        return { success: true, transactionId: txId };
      }

      // Need manual signing (browser wallets)
      if (result?.readyToSign) {
        const btcNetwork = getBitcoinNetwork(network || 'mainnet');
        const psbtBase64 = extractPsbtBase64(result.readyToSign.psbt);

        let finalPsbtBase64 = psbtBase64;
        if (isBrowserWallet) {
          const patched = patchInputsOnly({
            psbtBase64,
            taprootAddress: account?.taproot?.address || '',
            segwitAddress: account?.nativeSegwit?.address,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            network: btcNetwork,
          });
          finalPsbtBase64 = patched.psbtBase64;
        }

        let signedPsbtBase64: string;
        if (isBrowserWallet) {
          signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);
        } else {
          signedPsbtBase64 = await signSegwitPsbt(finalPsbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        }

        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();
        const txHex = signedPsbt.extractTransaction().toHex();
        const txId = await provider.broadcastTransaction(txHex);
        return { success: true, transactionId: txId };
      }

      throw new Error('Unexpected SDK response — no txid or readyToSign in result');
    },
  });
}
