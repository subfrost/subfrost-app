/**
 * useFujinBuyMutation.ts
 *
 * Buys a futures position by minting LONG+SHORT token pairs from a Fujin pool.
 * Sends DIESEL as incomingAlkanes, receives LONG+SHORT tokens.
 *
 * Contract: Fujin pool instance (discovered via factory opcode 3 GetAllMarkets).
 * Opcode 11 (MintPair): Send DIESEL, receive LONG+SHORT.
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

export interface FujinBuyParams {
  poolId: string;       // Fujin pool alkane ID e.g. "2:10"
  dieselAmount: string; // DIESEL amount in atomic units (alks)
  feeRate: number;
}

export function useFujinBuyMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: FujinBuyParams) => {
      console.log('[FujinBuy] ═══════════════════════════════════════════');
      console.log('[FujinBuy] Starting MintPair transaction');
      console.log('[FujinBuy] Params:', JSON.stringify(params, null, 2));

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
      console.log('[FujinBuy] Using addresses:', { taprootAddress, segwitAddress, primaryAddress });

      // Parse pool ID
      const [poolBlock, poolTx] = params.poolId.split(':');

      // Build protostone: MintPair opcode 11
      // The SDK auto-generates the edict from inputRequirements to deliver DIESEL
      const protostone = `[${poolBlock},${poolTx},11]:v0:v0`;

      // Input requirements: DIESEL (2:0) tokens
      const inputRequirements = `2:0:${params.dieselAmount}`;

      console.log('[FujinBuy] Protostone:', protostone);
      console.log('[FujinBuy] Input requirements:', inputRequirements);

      const btcNetwork = getBitcoinNetwork(network);
      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';

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

      console.log('[FujinBuy] From addresses:', fromAddresses, '(browser:', isBrowserWallet, ')');
      console.log('[FujinBuy] To addresses:', toAddresses);

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

        console.log('[FujinBuy] Execute result:', JSON.stringify(result, null, 2));

        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[FujinBuy] Transaction auto-completed, txid:', txId);
          return { success: true as const, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[FujinBuy] Got readyToSign, signing PSBT...');
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
              console.log(`[FujinBuy] Patched ${patchResult.inputsPatched} input(s) for browser wallet compatibility`);
            }
          }

          // Sign PSBT -- browser wallets sign all input types in a single call
          let signedPsbtBase64: string;
          if (isBrowserWallet) {
            console.log('[FujinBuy] Browser wallet: signing PSBT once (all input types)...');
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            console.log('[FujinBuy] Keystore: signing PSBT with SegWit, then Taproot...');
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[FujinBuy] Transaction built:', txid);

          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[FujinBuy] Broadcast successful:', broadcastTxid);

          return {
            success: true as const,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[FujinBuy] Complete, txid:', txId);
          return { success: true as const, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[FujinBuy] Transaction ID:', txId);
        return { success: true as const, transactionId: txId };

      } catch (error) {
        console.error('[FujinBuy] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[FujinBuy] Success! txid:', data.transactionId);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['fujin-positions'] });
      queryClient.invalidateQueries({ queryKey: ['fujin-markets'] });
    },
  });
}
