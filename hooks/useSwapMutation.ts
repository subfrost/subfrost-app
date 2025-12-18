import { useMutation } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { FACTORY_OPCODES } from '@/constants';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
  calculateMaximumFromSlippage,
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type SwapTransactionBaseData = {
  sellCurrency: string; // alkane id or 'btc'
  buyCurrency: string; // alkane id or 'btc'
  direction: 'sell' | 'buy';
  sellAmount: string; // alks
  buyAmount: string; // alks
  maxSlippage: string; // percent string, e.g. '0.5'
  feeRate: number; // sats/vB
  tokenPath?: string[]; // optional explicit path
  deadlineBlocks?: number; // default 3
  isDieselMint?: boolean;
};

/**
 * Build protostone string for AMM swap operations
 * Format: [factory_block,factory_tx,opcode,path_len,...path_tokens,amount,limit,deadline]:pointer:refund
 */
function buildSwapProtostone(params: {
  factoryId: string;
  opcode: string;
  tokenPath: string[];
  amount: string;
  limit: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const { factoryId, opcode, tokenPath, amount, limit, deadline, pointer = 'v1', refund = 'v1' } = params;
  const [factoryBlock, factoryTx] = factoryId.split(':');

  // Build cellpack: [factory_block, factory_tx, opcode, path_len, ...path_tokens, amount, limit, deadline]
  const pathTokens = tokenPath.flatMap(token => token.split(':'));
  const cellpack = [
    factoryBlock,
    factoryTx,
    opcode,
    tokenPath.length.toString(),
    ...pathTokens,
    amount,
    limit,
    deadline,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for alkanes execute
 * Format: "B:amount" for bitcoin, "block:tx:amount" for alkanes
 */
function buildInputRequirements(params: {
  bitcoinAmount?: string;
  alkaneInputs?: Array<{ alkaneId: string; amount: string }>;
}): string {
  const parts: string[] = [];

  if (params.bitcoinAmount && params.bitcoinAmount !== '0') {
    parts.push(`B:${params.bitcoinAmount}`);
  }

  if (params.alkaneInputs) {
    for (const input of params.alkaneInputs) {
      const [block, tx] = input.alkaneId.split(':');
      parts.push(`${block}:${tx}:${input.amount}`);
    }
  }

  return parts.join(',');
}

export function useSwapMutation() {
  const { account, network, isConnected, signTaprootPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const { ALKANE_FACTORY_ID, FRBTC_ALKANE_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

  return useMutation({
    mutationFn: async (swapData: SwapTransactionBaseData) => {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] ████ MUTATION STARTED ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] Input swapData:', JSON.stringify(swapData, null, 2));
      console.log('[useSwapMutation] Network:', network);
      console.log('[useSwapMutation] ALKANE_FACTORY_ID:', ALKANE_FACTORY_ID);
      console.log('[useSwapMutation] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
      console.log('[useSwapMutation] wrapFee:', wrapFee);
      console.log('[useSwapMutation] isConnected:', isConnected);
      console.log('[useSwapMutation] hasProvider:', !!provider);
      console.log('───────────────────────────────────────────────────────────────');

      if (!isConnected) {
        console.error('[useSwapMutation] ❌ Wallet not connected');
        throw new Error('Wallet not connected');
      }
      if (!provider) {
        console.error('[useSwapMutation] ❌ Provider not available');
        throw new Error('Provider not available');
      }

      // NOTE: BTC → token swaps (other than frBTC) should be handled in SwapShell.tsx
      // by first wrapping BTC to frBTC, then calling swapMutation with frBTC.
      // If we reach here with BTC as sellCurrency for a non-frBTC target, something is wrong.
      if (swapData.sellCurrency === 'btc' && swapData.buyCurrency !== FRBTC_ALKANE_ID) {
        console.error('[useSwapMutation] ❌ BTC → non-frBTC swap reached mutation!');
        console.error('[useSwapMutation] sellCurrency:', swapData.sellCurrency);
        console.error('[useSwapMutation] buyCurrency:', swapData.buyCurrency);
        console.error('[useSwapMutation] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
        throw new Error(
          'BTC swaps must go through frBTC. This swap should have been split into wrap + swap in the UI.'
        );
      }

      const sellCurrency = swapData.sellCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.sellCurrency;
      const buyCurrency = swapData.buyCurrency === 'btc' ? FRBTC_ALKANE_ID : swapData.buyCurrency;

      console.log('[useSwapMutation] Resolved currencies:');
      console.log('[useSwapMutation]   sellCurrency:', swapData.sellCurrency, '→', sellCurrency);
      console.log('[useSwapMutation]   buyCurrency:', swapData.buyCurrency, '→', buyCurrency);

      // Adjust amounts for wrap fee when selling BTC
      const ammSellAmount =
        swapData.sellCurrency === 'btc'
          ? BigNumber(swapData.sellAmount)
              .multipliedBy(1000 - wrapFee)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : swapData.sellAmount;
      const ammBuyAmount =
        swapData.sellCurrency === 'btc'
          ? BigNumber(swapData.buyAmount)
              .multipliedBy(1000 + wrapFee)
              .dividedBy(1000)
              .integerValue(BigNumber.ROUND_FLOOR)
              .toString()
          : swapData.buyAmount;

      console.log('[useSwapMutation] AMM amounts (after wrap fee adjustment):');
      console.log('[useSwapMutation]   ammSellAmount:', ammSellAmount);
      console.log('[useSwapMutation]   ammBuyAmount:', ammBuyAmount);

      // Build token path
      let tokenPath = swapData.tokenPath || [sellCurrency, buyCurrency];
      console.log('[useSwapMutation] Initial tokenPath:', JSON.stringify(tokenPath));
      tokenPath = tokenPath.map((t) => (t === 'btc' ? FRBTC_ALKANE_ID : t));
      console.log('[useSwapMutation] Resolved tokenPath:', JSON.stringify(tokenPath));

      // Calculate slippage limits
      const minAmountOut = calculateMinimumFromSlippage({ amount: ammBuyAmount, maxSlippage: swapData.maxSlippage });
      const maxAmountIn = calculateMaximumFromSlippage({ amount: ammSellAmount, maxSlippage: swapData.maxSlippage });

      console.log('[useSwapMutation] Slippage calculations:');
      console.log('[useSwapMutation]   maxSlippage:', swapData.maxSlippage);
      console.log('[useSwapMutation]   minAmountOut:', minAmountOut);
      console.log('[useSwapMutation]   maxAmountIn:', maxAmountIn);

      // Get deadline block height
      const deadlineBlocks = swapData.deadlineBlocks || 3;
      console.log('[useSwapMutation] Fetching deadline block height...');
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[useSwapMutation] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      // Determine opcode based on direction
      const opcode = swapData.direction === 'sell'
        ? FACTORY_OPCODES.SwapExactTokensForTokens
        : FACTORY_OPCODES.SwapTokensForExactTokens;

      console.log('[useSwapMutation] Opcode:', opcode, `(${swapData.direction === 'sell' ? 'SwapExactTokensForTokens' : 'SwapTokensForExactTokens'})`);

      // Build protostone for the swap
      const protostoneParams = {
        factoryId: ALKANE_FACTORY_ID,
        opcode: opcode.toString(),
        tokenPath,
        amount: swapData.direction === 'sell'
          ? new BigNumber(ammSellAmount).toFixed(0)
          : new BigNumber(ammBuyAmount).toFixed(0),
        limit: swapData.direction === 'sell'
          ? new BigNumber(minAmountOut).toFixed(0)
          : new BigNumber(maxAmountIn).toFixed(0),
        deadline: deadline.toString(),
      };

      console.log('[useSwapMutation] Protostone params:', JSON.stringify(protostoneParams, null, 2));

      const protostone = buildSwapProtostone(protostoneParams);
      console.log('[useSwapMutation] Built protostone:', protostone);

      // Build input requirements
      const isBtcSell = swapData.sellCurrency === 'btc';
      console.log('[useSwapMutation] isBtcSell:', isBtcSell);

      const inputReqParams = {
        bitcoinAmount: isBtcSell ? new BigNumber(swapData.sellAmount).toFixed(0) : undefined,
        alkaneInputs: !isBtcSell ? [{
          alkaneId: sellCurrency,
          amount: new BigNumber(swapData.sellAmount).toFixed(0),
        }] : undefined,
      };

      console.log('[useSwapMutation] Input requirements params:', JSON.stringify(inputReqParams, null, 2));

      const inputRequirements = buildInputRequirements(inputReqParams);
      console.log('[useSwapMutation] Built inputRequirements:', inputRequirements);

      // Get recipient address (taproot for alkanes)
      const recipientAddress = account?.taproot?.address || account?.nativeSegwit?.address;
      console.log('[useSwapMutation] Recipient address:', recipientAddress);
      if (!recipientAddress) {
        console.error('[useSwapMutation] ❌ No recipient address available');
        throw new Error('No recipient address available');
      }

      const toAddresses = JSON.stringify([recipientAddress]);

      // Use explicit taproot address instead of symbolic 'p2tr:0' notation
      // The SDK's internal address derivation has a bug where it defaults to P2WSH,
      // which isn't supported by single-sig wallets
      const taprootAddress = account?.taproot?.address;
      console.log('[useSwapMutation] Taproot address:', taprootAddress);
      if (!taprootAddress) {
        console.error('[useSwapMutation] ❌ No taproot address available');
        throw new Error('No taproot address available');
      }

      // WORKAROUND: Fetch UTXOs ourselves and filter to only our wallet's address
      // This bypasses the SDK's broken UTXO selection (same pattern as useWrapMutation)
      console.log('[useSwapMutation] ========================================');
      console.log('[useSwapMutation] Fetching wallet UTXOs directly from:', taprootAddress);
      let walletUtxos: any[] = [];
      try {
        // Get UTXOs from the wallet's taproot address
        const utxoResult = await provider.getAddressUtxos(taprootAddress);
        console.log('[useSwapMutation] Raw UTXO result type:', typeof utxoResult);
        console.log('[useSwapMutation] Raw UTXO result:', JSON.stringify(utxoResult, null, 2));

        // Handle different response formats
        if (Array.isArray(utxoResult)) {
          walletUtxos = utxoResult;
        } else if (utxoResult?.utxos) {
          walletUtxos = utxoResult.utxos;
        } else if (utxoResult instanceof Map) {
          walletUtxos = Array.from(utxoResult.values());
        }

        console.log('[useSwapMutation] Found', walletUtxos.length, 'UTXOs for wallet');
        walletUtxos.forEach((utxo, idx) => {
          console.log(`[useSwapMutation]   UTXO[${idx}]: ${utxo.txid}:${utxo.vout} value=${utxo.value} sats`);
        });
      } catch (e) {
        console.error('[useSwapMutation] Failed to fetch UTXOs:', e);
      }

      // Build options matching the pattern from useWrapMutation
      const options: Record<string, any> = {
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: true,
        change_address: taprootAddress,        // Change goes to user's taproot address
        from: [taprootAddress],                // Explicit UTXO source (needed by SDK)
        from_addresses: [taprootAddress],      // Explicit UTXO source (alt param name)
        lock_alkanes: true,
      };

      // Pass explicit UTXOs if available (bypasses SDK's broken UTXO selection)
      if (walletUtxos.length > 0) {
        const formattedUtxos = walletUtxos.map((utxo: any) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          script: utxo.scriptpubkey || utxo.script,
        }));
        options.utxos = formattedUtxos;
        options.explicit_utxos = formattedUtxos;
        console.log('[useSwapMutation] Passing', formattedUtxos.length, 'explicit UTXOs to SDK');
      }

      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] ████ EXECUTING SWAP ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] alkanesExecuteWithStrings params:');
      console.log('[useSwapMutation]   toAddresses:', toAddresses);
      console.log('[useSwapMutation]   inputRequirements:', inputRequirements);
      console.log('[useSwapMutation]   protostone:', protostone);
      console.log('[useSwapMutation]   feeRate:', swapData.feeRate);
      console.log('[useSwapMutation]   options:', JSON.stringify(options, null, 2));
      console.log('═══════════════════════════════════════════════════════════════');

      // Determine btcNetwork for PSBT operations
      const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

      try {
        // Execute using alkanesExecuteWithStrings
        const result = await provider.alkanesExecuteWithStrings(
          toAddresses,
          inputRequirements,
          protostone,
          swapData.feeRate,
          undefined, // envelope_hex
          JSON.stringify(options)
        );

        console.log('[useSwapMutation] ✓ Execute result:', JSON.stringify(result, null, 2));

        // Check if SDK auto-completed the transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[useSwapMutation] Transaction auto-completed, txid:', txId);
          return {
            success: true,
            transactionId: txId,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Check if we got a readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[useSwapMutation] Got readyToSign state, signing transaction...');
          const readyToSign = result.readyToSign;

          // The PSBT comes as Uint8Array from serde_wasm_bindgen (or as object with indices)
          let psbtBase64: string;
          if (readyToSign.psbt instanceof Uint8Array) {
            psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
          } else if (typeof readyToSign.psbt === 'string') {
            // Already base64
            psbtBase64 = readyToSign.psbt;
          } else if (typeof readyToSign.psbt === 'object') {
            // PSBT came back as object with numeric keys (e.g., {"0": 112, "1": 115, ...})
            const keys = Object.keys(readyToSign.psbt).map(Number).sort((a, b) => a - b);
            const bytes = new Uint8Array(keys.length);
            for (let i = 0; i < keys.length; i++) {
              bytes[i] = readyToSign.psbt[keys[i]];
            }
            psbtBase64 = uint8ArrayToBase64(bytes);
          } else {
            throw new Error('Unexpected PSBT format: ' + typeof readyToSign.psbt);
          }
          console.log('[useSwapMutation] PSBT base64 length:', psbtBase64.length);

          // Debug: Analyze PSBT structure
          try {
            const debugPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            console.log('[useSwapMutation] PSBT has', debugPsbt.inputCount, 'inputs');
            console.log('[useSwapMutation] PSBT has', debugPsbt.txOutputs.length, 'outputs');
          } catch (dbgErr) {
            console.log('[useSwapMutation] PSBT debug parse error:', dbgErr);
          }

          // Sign the PSBT with taproot key
          console.log('[useSwapMutation] Signing PSBT with taproot key...');
          const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          console.log('[useSwapMutation] PSBT signed with taproot key');

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

          // Finalize all inputs
          console.log('[useSwapMutation] Finalizing PSBT...');
          signedPsbt.finalizeAllInputs();

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[useSwapMutation] Transaction ID:', txid);
          console.log('[useSwapMutation] Transaction hex length:', txHex.length);

          // Broadcast the transaction
          console.log('[useSwapMutation] Broadcasting transaction...');
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[useSwapMutation] Transaction broadcast successful');
          console.log('[useSwapMutation] Broadcast returned txid:', broadcastTxid);

          if (txid !== broadcastTxid) {
            console.warn('[useSwapMutation] WARNING: Computed txid !== broadcast txid!');
            console.warn('[useSwapMutation] Computed:', txid);
            console.warn('[useSwapMutation] Broadcast:', broadcastTxid);
          }

          return {
            success: true,
            transactionId: broadcastTxid || txid,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Check if execution completed directly
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[useSwapMutation] Execution complete, txid:', txId);
          return {
            success: true,
            transactionId: txId,
            frbtcUnwrapTxId: undefined,
          } as {
            success: boolean;
            transactionId?: string;
            frbtcUnwrapTxId?: string;
          };
        }

        // Fallback: no txid found
        console.error('[useSwapMutation] No txid found in result:', result);
        throw new Error('Swap execution did not return a transaction ID');
      } catch (executeError: any) {
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('[useSwapMutation] ████ EXECUTE ERROR ████');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('[useSwapMutation] Error message:', executeError?.message);
        console.error('[useSwapMutation] Error name:', executeError?.name);
        console.error('[useSwapMutation] Error stack:', executeError?.stack);
        console.error('[useSwapMutation] Full error:', executeError);
        console.error('═══════════════════════════════════════════════════════════════');
        throw executeError;
      }
    },
  });
}
