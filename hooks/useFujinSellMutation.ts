/**
 * useFujinSellMutation.ts
 *
 * Sells/redeems a futures position by burning LONG+SHORT token pairs back to DIESEL.
 * Sends both LONG and SHORT tokens as incomingAlkanes, receives DIESEL.
 *
 * Contract: Fujin pool instance.
 * Opcode 12 (BurnPair): Send LONG+SHORT tokens, receive DIESEL.
 *
 * ============================================================================
 * CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01)
 * ============================================================================
 * When using browser wallets, you MUST pass ACTUAL addresses to
 * toAddresses/changeAddress/alkanesChangeAddress -- NOT symbolic addresses like
 * 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet!
 * See useSwapMutation.ts header comment for full documentation.
 * ============================================================================
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export interface FujinSellParams {
  poolId: string;        // Fujin pool alkane ID e.g. "2:10"
  longTokenId: string;   // LONG token alkane ID e.g. "2:11"
  shortTokenId: string;  // SHORT token alkane ID e.g. "2:12"
  amount: string;        // Pair amount to burn (atomic units)
  feeRate: number;
}

export function useFujinSellMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: FujinSellParams) => {

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // Get addresses - support single-address wallets (UniSat, OKX)
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      const primaryAddress = taprootAddress || segwitAddress;

      // Parse pool ID
      const [poolBlock, poolTx] = params.poolId.split(':');

      // Build protostone: BurnPair opcode 12
      // The SDK auto-generates edicts from inputRequirements to deliver both tokens
      const protostone = `[${poolBlock},${poolTx},12]:v0:v0`;

      // Input requirements: both LONG and SHORT tokens
      // Multiple alkane inputs are comma-separated
      const inputRequirements = `${params.longTokenId}:${params.amount},${params.shortTokenId}:${params.amount}`;


      const btcNetwork = getBitcoinNetwork(network);
      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';

      // Browser wallets need ACTUAL addresses, not symbolic
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


      try {
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


        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          return { success: true as const, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          const readyToSign = result.readyToSign;

          let psbtBase64: string = extractPsbtBase64(readyToSign.psbt);

          // Input patching for browser wallets
          if (isBrowserWallet) {
            const patchResult = patchInputsOnly({
              psbtBase64,
              network: btcNetwork,
              taprootAddress: taprootAddress!,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            });
            psbtBase64 = patchResult.psbtBase64;
            if (patchResult.inputsPatched > 0) {
            }
          }

          // Sign PSBT -- browser wallets sign all input types in a single call
          let signedPsbtBase64: string;
          if (isBrowserWallet) {
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();


          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);

          return {
            success: true as const,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          return { success: true as const, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        return { success: true as const, transactionId: txId };

      } catch (error) {
        console.error('[FujinSell] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['fujin-positions'] });
      queryClient.invalidateQueries({ queryKey: ['fujin-markets'] });
    },
  });
}
