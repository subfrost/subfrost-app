/**
 * FIRE Protocol Contribute Mutation Hook
 *
 * Contributes frBTC to the FIRE distributor contract [4:261].
 * frBTC tokens are sent as incomingAlkanes.
 * Only callable during Phase 0 (Contribution).
 *
 * Browser wallet address rules: NEVER use symbolic addresses for browser wallets.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_DISTRIBUTOR_OPCODES } from '@/constants';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

interface ContributeParams {
  frBtcAmount: string; // frBTC amount in base units
  feeRate: number;
}

export function useFireContributeMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const distributorId = (config as any).FIRE_DISTRIBUTOR_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ frBtcAmount, feeRate }: ContributeParams) => {
      if (!provider || !isInitialized || !distributorId) {
        throw new Error('Provider or FIRE distributor contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [distBlock, distTx] = distributorId.split(':').map(Number);
      const protostonesStr = `[${distBlock},${distTx},${FIRE_DISTRIBUTOR_OPCODES.Contribute}]:v0:v0`;

      // frBTC (32:0) as input
      const inputReqStr = `32:0:${frBtcAmount}`;

      const toAddresses = useActualAddresses ? [taprootAddress] : ['p2tr:0'];
      const changeAddr = useActualAddresses ? (segwitAddress || taprootAddress) : 'p2wpkh:0';
      const alkanesChangeAddr = useActualAddresses ? taprootAddress : 'p2tr:0';

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

      if (result?.txid || result?.reveal_txid) {
        return { success: true, transactionId: result.txid || result.reveal_txid };
      }

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

      throw new Error('Unexpected SDK response');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireDistributor'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balance'] });
    },
  });
}
