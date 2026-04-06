/**
 * FIRE Protocol Staking Mutation Hook
 *
 * Stakes LP tokens into the FIRE staking contract [4:257] with a lock duration.
 * Uses two-protostone pattern: p0 edict transfers LP tokens to p1 cellpack.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 * See CLAUDE.md "Browser Wallet Output Address Bug" for details.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_STAKING_OPCODES } from '@/constants';
import { LOCK_TIERS } from '@/utils/fireCalculations';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

interface StakeParams {
  lpAmount: string;     // LP token amount in base units
  lpTokenId: string;    // LP token AlkaneId (e.g. "2:3") — from useLpTokenId
  lockTierIndex: number; // Index into LOCK_TIERS
  feeRate: number;
}

export function useFireStakeMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ lpAmount, lpTokenId, lockTierIndex, feeRate }: StakeParams) => {
      if (!provider || !isInitialized || !stakingId) {
        throw new Error('Provider or FIRE staking contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const tier = LOCK_TIERS[lockTierIndex];
      if (!tier) throw new Error('Invalid lock tier');

      const [stakingBlock, stakingTx] = stakingId.split(':').map(Number);

      // Build protostones string: cellpack calls staking opcode 1 with lock_duration
      const protostonesStr = `[${stakingBlock},${stakingTx},${FIRE_STAKING_OPCODES.Stake},${tier.duration}]:v0:v0`;

      // inputRequirements: SDK auto-generates edict from this
      const inputReqStr = `A:${lpTokenId}:${lpAmount}`;

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

      // Auto-completed by SDK (keystore wallets with autoConfirm may return txid directly)
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        return { success: true, transactionId: txId };
      }

      // Need manual signing (browser wallets, or autoConfirm=false)
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
