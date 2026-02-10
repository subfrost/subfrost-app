/**
 * useUnwrapMutation - Unwrap frBTC back to BTC
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { patchPsbtForBrowserWallet } from '@/lib/psbt-patching';
import { getAddressConfig } from '@/lib/address-utils';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';

bitcoin.initEccLib(ecc);

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type UnwrapTransactionBaseData = {
  amount: string; // display units (frBTC)
  feeRate: number; // sats/vB
};

// frBTC unwrap opcode (exchange frBTC for BTC)
const FRBTC_UNWRAP_OPCODE = 78;

const toAlks = (amount: string): string => {
  if (!amount) return '0';
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac ? frac.padStart(8, '0') : '00000000'}`;
};

/**
 * Build protostone string for frBTC -> BTC unwrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(78)]:pointer:refund
 * Opcode 78 is the unwrap opcode for frBTC contract
 */
function buildUnwrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { frbtcId, pointer = 'v1', refund = 'v1' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(78)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_UNWRAP_OPCODE].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for unwrap
 * Format: "block:tx:amount" for the frBTC being unwrapped
 */
function buildUnwrapInputRequirements(params: {
  frbtcId: string;
  amount: string;
}): string {
  const [block, tx] = params.frbtcId.split(':');
  return `${block}:${tx}:${params.amount}`;
}

export function useUnwrapMutation() {
  const { account, network, isConnected, signSegwitPsbt, signTaprootPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (unwrapData: UnwrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Get addresses - use actual addresses instead of SDK descriptors
      // This fixes the "Available: []" issue where SDK couldn't find alkane UTXOs
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');
      console.log('[useUnwrapMutation] Using addresses:', { taprootAddress, segwitAddress });

      // Verify wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      const unwrapAmount = toAlks(unwrapData.amount);

      // Build protostone for unwrap operation
      const protostone = buildUnwrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });

      // Input requirements: frBTC amount to unwrap
      const inputRequirements = buildUnwrapInputRequirements({
        frbtcId: FRBTC_ALKANE_ID,
        amount: unwrapAmount,
      });

      // Get recipient address (taproot for alkanes, but BTC goes to segwit)
      const recipientAddress = account?.nativeSegwit?.address || account?.taproot?.address;
      if (!recipientAddress) throw new Error('No recipient address available');

      // Determine btcNetwork for PSBT operations
      // Must match network detection in other mutation hooks
      let btcNetwork: bitcoin.Network;
      switch (network) {
        case 'mainnet':
          btcNetwork = bitcoin.networks.bitcoin;
          break;
        case 'testnet':
        case 'signet':
          btcNetwork = bitcoin.networks.testnet;
          break;
        case 'regtest':
        case 'regtest-local':
        case 'subfrost-regtest':
        case 'oylnet':
        default:
          btcNetwork = bitcoin.networks.regtest;
          break;
      }

      console.log('[useUnwrapMutation] Executing unwrap:', {
        amount: unwrapAmount,
        frbtcId: FRBTC_ALKANE_ID,
        recipient: recipientAddress,
        feeRate: unwrapData.feeRate,
      });

      const isBrowserWallet = walletType === 'browser';

      // Dynamic address routing for single-address wallet support
      const addrConfig = getAddressConfig({ walletType, taprootAddress, segwitAddress });

      const result = await provider.alkanesExecuteTyped({
        toAddresses: [addrConfig.changeAddress],
        inputRequirements,
        protostones: protostone,
        feeRate: unwrapData.feeRate,
        autoConfirm: false,
        fromAddresses: addrConfig.fromAddresses,
        changeAddress: addrConfig.changeAddress,
        alkanesChangeAddress: addrConfig.alkanesChangeAddress,
      });

      console.log('[useUnwrapMutation] Called alkanesExecuteTyped (browser:', isBrowserWallet, ')');

      console.log('[useUnwrapMutation] Execute result:', JSON.stringify(result, null, 2));

      // Handle auto-completed transaction
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[useUnwrapMutation] Transaction auto-completed, txid:', txId);
        return { success: true, transactionId: txId };
      }

      // Handle readyToSign state (need to sign PSBT manually)
      if (result?.readyToSign) {
        console.log('[useUnwrapMutation] Got readyToSign, signing PSBT...');
        const readyToSign = result.readyToSign;

        // Convert PSBT to base64
        let psbtBase64: string;
        if (readyToSign.psbt instanceof Uint8Array) {
          psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
        } else if (typeof readyToSign.psbt === 'string') {
          psbtBase64 = readyToSign.psbt;
        } else if (typeof readyToSign.psbt === 'object') {
          const keys = Object.keys(readyToSign.psbt).map(Number).sort((a, b) => a - b);
          const bytes = new Uint8Array(keys.length);
          for (let i = 0; i < keys.length; i++) {
            bytes[i] = readyToSign.psbt[keys[i]];
          }
          psbtBase64 = uint8ArrayToBase64(bytes);
        } else {
          throw new Error('Unexpected PSBT format');
        }

        // Patch PSBT: replace dummy wallet outputs with real addresses,
        // inject redeemScript for P2SH-P2WPKH wallets (see lib/psbt-patching.ts)
        if (isBrowserWallet) {
          const result = patchPsbtForBrowserWallet({
            psbtBase64,
            network: btcNetwork,
            isBrowserWallet,
            taprootAddress,
            segwitAddress,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
          });
          psbtBase64 = result.psbtBase64;
          if (result.inputsPatched > 0) {
            console.log('[useUnwrapMutation] Patched', result.inputsPatched, 'P2SH inputs with redeemScript');
          }
          console.log('[useUnwrapMutation] Patched PSBT outputs for browser wallet');
        }

        // For keystore wallets, request user confirmation before signing
        if (walletType === 'keystore') {
          console.log('[useUnwrapMutation] Keystore wallet - requesting user confirmation...');
          const approved = await requestConfirmation({
            type: 'unwrap',
            title: 'Confirm Unwrap',
            fromAmount: unwrapData.amount,
            fromSymbol: 'frBTC',
            toAmount: unwrapData.amount,
            toSymbol: 'BTC',
            feeRate: unwrapData.feeRate,
          });

          if (!approved) {
            console.log('[useUnwrapMutation] User rejected transaction');
            throw new Error('Transaction rejected by user');
          }
          console.log('[useUnwrapMutation] User approved transaction');
        }

        // Sign PSBT — browser wallets sign all input types in a single call,
        // so we must NOT call signPsbt twice (causes "inputType: sh without redeemScript").
        let signedPsbtBase64: string;
        if (isBrowserWallet) {
          console.log('[useUnwrapMutation] Browser wallet: signing PSBT once (all input types)...');
          signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
        } else if (addrConfig.isSingleAddressMode) {
          signedPsbtBase64 = taprootAddress
            ? await signTaprootPsbt(psbtBase64)
            : await signSegwitPsbt(psbtBase64);
        } else {
          console.log('[useUnwrapMutation] Keystore: signing PSBT with SegWit, then Taproot...');
          signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        }

        // Finalize and extract transaction
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();

        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = tx.getId();

        console.log('[useUnwrapMutation] Transaction built:', txid);

        // Broadcast
        const broadcastTxid = await provider.broadcastTransaction(txHex);
        console.log('[useUnwrapMutation] Broadcast successful:', broadcastTxid);

        return {
          success: true,
          transactionId: broadcastTxid || txid,
        };
      }

      // Handle complete state
      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        console.log('[useUnwrapMutation] Complete, txid:', txId);
        return { success: true, transactionId: txId };
      }

      // Fallback
      const txId = result?.txid || result?.reveal_txid;
      console.log('[useUnwrapMutation] Transaction ID:', txId);
      return { success: true, transactionId: txId };
    },
    onSuccess: (data) => {
      console.log('[useUnwrapMutation] Unwrap successful, invalidating balance queries...');

      // Invalidate all balance-related queries to refresh UI immediately
      const walletAddress = account?.taproot?.address;

      // Invalidate sellable currencies (shows frBTC balance in swap UI)
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });

      // Invalidate BTC balance queries
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });

      // Invalidate frBTC premium data
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });

      // Invalidate pool-related queries
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      // Invalidate activity feed so it shows the new unwrap transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[useUnwrapMutation] Balance queries invalidated for address:', walletAddress);
    },
  });
}
