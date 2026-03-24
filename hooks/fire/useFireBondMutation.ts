/**
 * FIRE Protocol Bond Mutation Hook
 *
 * Bonds LP tokens to the FIRE bonding contract [4:259] for discounted FIRE.
 * Uses two-protostone pattern: p0 edict transfers LP to p1 cellpack.
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

interface BondParams {
  lpAmount: string; // LP token amount in base units
  feeRate: number;
}

export function useFireBondMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ lpAmount, feeRate }: BondParams) => {
      if (!provider || !isInitialized || !bondingId) {
        throw new Error('Provider or FIRE bonding contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [bondingBlock, bondingTx] = bondingId.split(':').map(Number);
      const protostonesStr = `[${bondingBlock},${bondingTx},${FIRE_BONDING_OPCODES.Bond}]:v0:v0`;

      // LP token input via inputRequirements
      // Devnet default LP token ID — replace with dynamic pool discovery when available
      const lpTokenId = '2:6'; // regtest DIESEL/frBTC LP token
      const inputReqStr = `A:${lpTokenId}:${lpAmount}`;

      const toAddresses = isBrowserWallet ? [taprootAddress] : ['p2tr:0'];
      const changeAddr = isBrowserWallet ? (segwitAddress || taprootAddress) : 'p2wpkh:0';
      const alkanesChangeAddr = isBrowserWallet ? taprootAddress : 'p2tr:0';

      const result = await (provider as any).alkanesExecuteTyped({
        inputRequirements: inputReqStr,
        protostones: protostonesStr,
        feeRate,
        autoConfirm: false,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
        ordinalsStrategy: 'burn',
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireBondingStats'] });
      queryClient.invalidateQueries({ queryKey: ['fireUserBonds'] });
    },
  });
}
