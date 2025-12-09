import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

// frBTC wrap opcode (exchange BTC for frBTC)
const FRBTC_WRAP_OPCODE = 77;

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


const toAlks = (amount: string): string => {
  if (!amount) return '0';
  // 8 decimal places for alks/sats
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
  // remove leading zeros from whole to avoid Number parsing issues later
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac ? frac.padStart(8, '0') : '00000000'}`;
};

/**
 * Build protostone string for BTC -> frBTC wrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(77)]:pointer:refund
 * Opcode 77 is the exchange/wrap opcode for frBTC contract
 */
function buildWrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  const { frbtcId, pointer = 'v1', refund = 'v1' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(77)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_WRAP_OPCODE].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

export function useWrapMutation() {
  const { account, network, isConnected, signPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  // Get bitcoin network for PSBT parsing
  const getBitcoinNetwork = () => {
    switch (network) {
      case 'mainnet':
        return bitcoin.networks.bitcoin;
      case 'testnet':
      case 'signet':
        return bitcoin.networks.testnet;
      case 'regtest':
      case 'subfrost-regtest':
      case 'oylnet':
        return bitcoin.networks.regtest;
      default:
        return bitcoin.networks.bitcoin;
    }
  };

  return useMutation({
    mutationFn: async (wrapData: WrapTransactionBaseData) => {
      console.log('[useWrapMutation] Starting wrap', {
        amount: wrapData.amount,
        feeRate: wrapData.feeRate,
        isConnected,
        hasProvider: !!provider,
        FRBTC_ALKANE_ID,
      });

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const wrapAmount = toAlks(wrapData.amount);
      console.log('[useWrapMutation] Converted amount to alks:', wrapAmount);

      // Build protostone for wrap operation
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });
      console.log('[useWrapMutation] Built protostone:', protostone);

      // Input requirements: Bitcoin amount to wrap
      const inputRequirements = `B:${wrapAmount}`;
      console.log('[useWrapMutation] Input requirements:', inputRequirements);

      // Get recipient address (taproot for alkanes)
      const recipientAddress = account?.taproot?.address || account?.nativeSegwit?.address;
      if (!recipientAddress) throw new Error('No recipient address available');
      console.log('[useWrapMutation] Recipient address:', recipientAddress);

      const toAddresses = JSON.stringify([recipientAddress]);

      // Get taproot address for UTXOs - this is where the funds are
      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) throw new Error('No taproot address available for UTXOs');
      console.log('[useWrapMutation] From address (taproot):', taprootAddress);

      // Use p2tr:0 for change address instead of the default p2wsh:0
      // (p2wsh is not supported by single-sig wallets)
      // Also specify from_addresses to use the taproot address for UTXOs
      const options = JSON.stringify({
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: true,
        change_address: 'p2tr:0',
        from_addresses: [taprootAddress],
      });
      console.log('[useWrapMutation] Options:', options);

      console.log('[useWrapMutation] Calling alkanesExecuteWithStrings...');
      console.log('[useWrapMutation] Execute params:', {
        toAddresses,
        inputRequirements,
        protostone,
        feeRate: wrapData.feeRate,
        options,
      });

      try {
        // Execute using alkanesExecuteWithStrings
        const result = await provider.alkanesExecuteWithStrings(
          toAddresses,
          inputRequirements,
          protostone,
          wrapData.feeRate,
          undefined, // envelope_hex
          options
        );

        console.log('[useWrapMutation] Result:', result);

        // Check if we got a readyToSign state (transaction needs signing)
        if (result?.readyToSign) {
          console.log('[useWrapMutation] Got readyToSign state, signing transaction...');
          const readyToSign = result.readyToSign;

          // The PSBT comes as Uint8Array from serde_wasm_bindgen
          let psbtBase64: string;
          if (readyToSign.psbt instanceof Uint8Array) {
            psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
          } else if (typeof readyToSign.psbt === 'string') {
            // Already base64
            psbtBase64 = readyToSign.psbt;
          } else {
            throw new Error('Unexpected PSBT format');
          }
          console.log('[useWrapMutation] PSBT base64 length:', psbtBase64.length);

          // Sign the PSBT using the wallet
          console.log('[useWrapMutation] Signing PSBT...');
          const signedPsbtBase64 = await signPsbt(psbtBase64);
          console.log('[useWrapMutation] PSBT signed');

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const btcNetwork = getBitcoinNetwork();
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

          // Finalize all inputs
          console.log('[useWrapMutation] Finalizing PSBT...');
          signedPsbt.finalizeAllInputs();

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          console.log('[useWrapMutation] Extracted tx hex, broadcasting...');

          // Broadcast the transaction
          const txid = await provider.broadcastTransaction(txHex);
          console.log('[useWrapMutation] Transaction broadcast, txid:', txid);

          return {
            success: true,
            transactionId: txid,
          } as { success: boolean; transactionId?: string };
        }

        // Check if execution completed directly (unlikely for wrap, but handle it)
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[useWrapMutation] Execution complete, txid:', txId);
          return {
            success: true,
            transactionId: txId,
          } as { success: boolean; transactionId?: string };
        }

        // Fallback: try to get txid directly from result
        const txId = result?.txid || result?.reveal_txid;
        console.log('[useWrapMutation] Transaction ID:', txId);

        return {
          success: true,
          transactionId: txId,
        } as { success: boolean; transactionId?: string };
      } catch (error) {
        console.error('[useWrapMutation] Execution error:', error);
        throw error;
      }
    },
  });
}
