/**
 * useGaugeUnstakeMutation - Withdraw staked LP tokens from a gauge contract
 *
 * Gauge contract opcodes (e.g. 4:7030 vxFUEL, 4:7031 vxBTCUSD):
 *   - Opcode 2: Unstake (no incomingAlkanes needed)
 *   - Protostone: [gauge_block, gauge_tx, 2]:v0:v0
 *   - No inputRequirements
 *
 * ============================================================================
 * CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01)
 * ============================================================================
 * When using browser wallets, you MUST pass ACTUAL addresses to
 * toAddresses/changeAddress/alkanesChangeAddress -- NOT symbolic addresses
 * like 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet.
 * See useSwapMutation.ts header comment for full documentation.
 * ============================================================================
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';

bitcoin.initEccLib(ecc);

export interface GaugeUnstakeParams {
  gaugeId: string;  // e.g. "4:7030"
  feeRate: number;  // sats/vB
}

export function useGaugeUnstakeMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, browserWallet } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();

  return useMutation({
    mutationFn: async (params: GaugeUnstakeParams) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      const primaryAddress = taprootAddress || segwitAddress;

      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      const [gaugeBlock, gaugeTx] = params.gaugeId.split(':');
      const protostone = `[${gaugeBlock},${gaugeTx},2]:v0:v0`;

      const btcNetwork = getBitcoinNetwork(network);
      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest';

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

      console.log('[useGaugeUnstakeMutation] Executing gauge unstake:', {
        gaugeId: params.gaugeId,
        isBrowserWallet,
        toAddresses,
      });

      const result = await provider.alkanesExecuteTyped({
        inputRequirements: '',
        protostones: protostone,
        feeRate: params.feeRate,
        autoConfirm: false,
        fromAddresses,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
        ordinalsStrategy: 'burn',
      });

      console.log('[useGaugeUnstakeMutation] Execute result:', JSON.stringify(result, null, 2));

      // Handle auto-completed transaction
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[useGaugeUnstakeMutation] Transaction auto-completed, txid:', txId);
        return { success: true, transactionId: txId };
      }

      // Handle readyToSign state
      if (result?.readyToSign) {
        console.log('[useGaugeUnstakeMutation] Got readyToSign, signing PSBT...');
        const readyToSign = result.readyToSign;
        const psbtBase64 = extractPsbtBase64(readyToSign.psbt);

        let finalPsbtBase64 = psbtBase64;
        if (isBrowserWallet) {
          const patchResult = patchInputsOnly({
            psbtBase64,
            network: btcNetwork,
            taprootAddress: taprootAddress!,
            segwitAddress,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
          });
          finalPsbtBase64 = patchResult.psbtBase64;
          if (patchResult.inputsPatched > 0) {
            console.log(`[useGaugeUnstakeMutation] Patched ${patchResult.inputsPatched} input(s)`);
          }
        }

        // Keystore confirmation
        if (walletType === 'keystore') {
          const approved = await requestConfirmation({
            type: 'send',
            title: 'Confirm Gauge Unstake',
            fromAmount: '0',
            fromSymbol: 'Staked LP',
            toAmount: '0',
            toSymbol: 'LP',
            feeRate: params.feeRate,
          });
          if (!approved) throw new Error('Transaction rejected by user');
        }

        // Single signing path. Browser wallets sign all input types via the wallet
        // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
        const signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);

        // Finalize and broadcast
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();
        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = tx.getId();

        console.log('[useGaugeUnstakeMutation] Broadcasting:', txid);
        const broadcastTxid = await provider.broadcastTransaction(txHex);
        console.log('[useGaugeUnstakeMutation] Broadcast successful:', broadcastTxid);

        return { success: true, transactionId: broadcastTxid || txid };
      }

      // Handle complete state
      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        return { success: true, transactionId: txId };
      }

      // Fallback
      const txId = result?.txid || result?.reveal_txid;
      return { success: true, transactionId: txId };
    },
    onSuccess: () => {
      console.log('[useGaugeUnstakeMutation] Unstake successful, invalidating queries...');
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['gauge-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
    },
  });
}
