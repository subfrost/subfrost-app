/**
 * FIRE Protocol Bond Claim Mutation Hook
 *
 * Claims vested FIRE from a bond in the bonding contract [4:259].
 * Simple cellpack with bond_id argument.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_BONDING_OPCODES } from '@/constants';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

interface BondClaimParams {
  bondId: number;
  feeRate: number;
}

export function useFireBondClaimMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account, signTaprootPsbt, txContext } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ bondId, feeRate }: BondClaimParams) => {
      if (!provider || !isInitialized || !bondingId) {
        throw new Error('Provider or FIRE bonding contract not ready');
      }
      // See `WalletContext.TxContext` jsdoc for the address-fallback semantics.
      if (!txContext) throw new Error('Wallet not connected');

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [bondingBlock, bondingTx] = bondingId.split(':').map(Number);
      const protostonesStr = `[${bondingBlock},${bondingTx},${FIRE_BONDING_OPCODES.ClaimVested},${bondId}]:v0:v0`;

      const toAddresses = [txContext.alkanesChangeAddress];

      const result = await (provider as any).alkanesExecuteTyped({
        txContext,
        inputRequirements: '',
        protostones: protostonesStr,
        feeRate,
        autoConfirm: false,
        toAddresses,
      });

      // Auto-completed by SDK
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        return { success: true, transactionId: txId };
      }

      // Need manual signing
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

        // Single signing path. Browser wallets sign all input types via the wallet
        // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
        const signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);

        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();
        const txHex = signedPsbt.extractTransaction().toHex();
        const txId = await provider.broadcastTransaction(txHex);
        return { success: true, transactionId: txId };
      }

      throw new Error('Unexpected SDK response — no txid or readyToSign in result');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireUserBonds'] });
      queryClient.invalidateQueries({ queryKey: ['fireTokenStats'] });
    },
  });
}
