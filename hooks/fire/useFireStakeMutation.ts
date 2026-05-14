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
  lpAmount: string; // LP token amount in base units
  lockTierIndex: number; // Index into LOCK_TIERS
  feeRate: number;
}

export function useFireStakeMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account, signTaprootPsbt, txContext } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ lpAmount, lockTierIndex, feeRate }: StakeParams) => {
      if (!provider || !isInitialized || !stakingId) {
        throw new Error('Provider or FIRE staking contract not ready');
      }
      // See `WalletContext.TxContext` jsdoc for the address-fallback semantics.
      if (!txContext) throw new Error('Wallet not connected');

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const tier = LOCK_TIERS[lockTierIndex];
      if (!tier) throw new Error('Invalid lock tier');

      const [stakingBlock, stakingTx] = stakingId.split(':').map(Number);
      const protostonesStr = `[${stakingBlock},${stakingTx},${FIRE_STAKING_OPCODES.Stake},${tier.duration}]:v0:v0`;

      const lpTokenId = (config as any).FIRE_LP_TOKEN_ID || '2:3';
      const inputReqStr = `${lpTokenId}:${lpAmount}`;

      const toAddresses = [txContext.alkanesChangeAddress];

      const result = await (provider as any).alkanesExecuteTyped({
        txContext,
        inputRequirements: inputReqStr,
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
      queryClient.invalidateQueries({ queryKey: ['fireStakingStats'] });
      queryClient.invalidateQueries({ queryKey: ['fireUserPositions'] });
      queryClient.invalidateQueries({ queryKey: ['enrichedWallet'] });
    },
  });
}
