/**
 * FIRE Protocol Unstake Mutation Hook
 *
 * Unstakes LP tokens by sending the position token (POS-{id}) back to the
 * staking contract as incomingAlkanes. The contract authenticates via
 * registered child check, reads position data from the token, and returns
 * LP + FIRE rewards.
 *
 * The position token is CONSUMED (not returned) — the user loses their NFT
 * and gets back their LP deposit + any pending FIRE rewards.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_STAKING_OPCODES } from '@/constants';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

interface UnstakeParams {
  positionTokenId: string; // Position token AlkaneId (e.g. "2:28") — sent as incomingAlkanes
  feeRate: number;
}

export function useFireUnstakeMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ positionTokenId, feeRate }: UnstakeParams) => {
      if (!provider || !isInitialized || !stakingId) {
        throw new Error('Provider or FIRE staking contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [stakingBlock, stakingTx] = stakingId.split(':').map(Number);
      // New contract: unstake() takes NO params — position token via incomingAlkanes
      const protostonesStr = `[${stakingBlock},${stakingTx},${FIRE_STAKING_OPCODES.Unstake}]:v0:v0`;

      const toAddresses = useActualAddresses ? [taprootAddress] : ['p2tr:0'];
      const changeAddr = useActualAddresses ? (segwitAddress || taprootAddress) : 'p2wpkh:0';
      const alkanesChangeAddr = useActualAddresses ? taprootAddress : 'p2tr:0';

      const result = await (provider as any).alkanesExecuteTyped({
        // Send position token as incomingAlkanes for authentication
        inputRequirements: `${positionTokenId}:1`,
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
      queryClient.invalidateQueries({ queryKey: ['fireStakingStats'] });
      queryClient.invalidateQueries({ queryKey: ['fireUserPositions'] });
    },
  });
}
