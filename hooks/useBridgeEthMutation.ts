/**
 * useBridgeEthMutation — Mutation hook for ETH cross-chain bridge operations
 *
 * Provides bridgeToEth mutation:
 *   Burns frETH on Bitcoin, encodes the user's ETH address into the protostone,
 *   and the coordinator releases ETH from the vault on Ethereum.
 *
 * Contract: frETH [4:n] (FRETH_ALKANE_ID from network config)
 * Opcode: 5 (BurnAndBridge) — same as frUSD, encoded differently (ETH address)
 *
 * JOURNAL (2026-03-27): Initial implementation.
 * Pattern follows useBridgeMutation (frUSD BurnAndBridge) with ETH address validation
 * and optional EVM calldata for composable execution.
 *
 * BROWSER WALLET: Must use ACTUAL addresses, not symbolic ('p2tr:0').
 * See useSwapMutation.ts header for full documentation of this critical bug.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { getBitcoinNetwork, extractPsbtBase64, toAlks } from '@/lib/alkanes/helpers';
import { buildBurnAndBridgeEthProtostone } from '@/lib/bridge/protostoneBuilder';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// ---- Types ----

export interface BridgeToEthParams {
  /** Amount of frETH to burn (display units, 8 decimals) */
  frethAmount: string;
  /** Ethereum recipient address (0x-prefixed, 20 bytes) */
  ethRecipient: string;
  /** Optional EVM calldata for composable execution (0x-prefixed hex) */
  calldata?: string;
  /** Fee rate in sats/vB */
  feeRate: number;
}

// ---- Hook ----

export function useBridgeEthMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();

  const bridgeToEth = useMutation({
    mutationFn: async (params: BridgeToEthParams) => {

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Validate ETH address
      if (!/^0x[0-9a-fA-F]{40}$/.test(params.ethRecipient)) {
        throw new Error('Invalid ETH address. Must be 0x-prefixed with 40 hex characters.');
      }

      // Validate optional calldata
      if (params.calldata && !/^0x[0-9a-fA-F]*$/.test(params.calldata)) {
        throw new Error('Invalid calldata. Must be 0x-prefixed hex string.');
      }
      if (params.calldata && params.calldata.replace('0x', '').length % 2 !== 0) {
        throw new Error('Calldata must be even-length hex.');
      }

      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available');
      }
      const primaryAddress = taprootAddress || segwitAddress;

      const config = getConfig(network);
      const frethTokenId = (config as any).FRETH_ALKANE_ID as string;
      if (!frethTokenId) {
        throw new Error('frETH token not configured for this network');
      }

      // Convert display units to alkane base units (8 decimals)
      const burnAmount = toAlks(params.frethAmount);
      if (burnAmount === '0') {
        throw new Error('Burn amount must be greater than zero');
      }

      // Build the BurnAndBridge protostone with ETH address encoding
      const protostone = buildBurnAndBridgeEthProtostone(
        frethTokenId,
        params.ethRecipient,
        params.calldata,
      );

      // frETH tokens must be sent as incomingAlkanes via inputRequirements
      const inputRequirements = `${frethTokenId}:${burnAmount}`;

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';
      const btcNetwork = getBitcoinNetwork(network);

      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      const toAddresses = useActualAddresses
        ? [primaryAddress!]
        : ['p2tr:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';

      const result = await provider.alkanesExecuteTyped({
        inputRequirements,
        protostones: protostone,
        feeRate: params.feeRate,
        autoConfirm: false,
        fromAddresses,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
        ordinalsStrategy: 'burn',
      });

      // Auto-completed by SDK
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        return { success: true as const, transactionId: txId };
      }

      // Need manual signing
      if (result?.readyToSign) {
        let psbtBase64 = extractPsbtBase64(result.readyToSign.psbt);

        if (isBrowserWallet) {
          const patched = patchInputsOnly({
            psbtBase64,
            taprootAddress: account?.taproot?.address || '',
            segwitAddress: account?.nativeSegwit?.address,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            network: btcNetwork,
          });
          psbtBase64 = patched.psbtBase64;
        }

        // Keystore confirmation dialog
        if (walletType === 'keystore') {
          const approved = await requestConfirmation({
            type: 'unwrap',
            title: 'Confirm Bridge frETH to ETH',
            fromAmount: params.frethAmount,
            fromSymbol: 'frETH',
            toAmount: params.frethAmount,
            toSymbol: 'ETH',
            feeRate: params.feeRate,
            description: `Recipient: ${params.ethRecipient}`,
          });
          if (!approved) throw new Error('Transaction rejected by user');
        }

        // Sign
        let signedPsbtBase64: string;
        if (isBrowserWallet) {
          signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
        } else {
          signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        }

        // Finalize and broadcast
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        const alreadyFinalized = signedPsbt.data.inputs.every(input =>
          input.finalScriptWitness || input.finalScriptSig
        );
        if (!alreadyFinalized) {
          signedPsbt.finalizeAllInputs();
        }

        const tx = signedPsbt.extractTransaction();
        const broadcastTxid = await provider.broadcastTransaction(tx.toHex());

        return { success: true as const, transactionId: broadcastTxid || tx.getId() };
      }

      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        return { success: true as const, transactionId: txId };
      }

      throw new Error('Unexpected SDK response');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bridge-state'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.refetchQueries({ queryKey: ['btc-balance'] });
      queryClient.refetchQueries({ queryKey: ['enriched-wallet'] });
    },
  });

  return { bridgeToEth };
}
