/**
 * useWrapSwapMutation - Single-signature BTC → Token swap
 *
 * ============================================================================
 * ## Overview
 * ============================================================================
 *
 * This hook implements single-popup BTC → Token swaps by building both the
 * wrap (BTC → frBTC) and swap (frBTC → Token) PSBTs upfront, then batch
 * signing them in one wallet interaction.
 *
 * ## Key Innovation: Pre-computed TXIDs
 *
 * Bitcoin transaction IDs are computed from the serialized transaction
 * (excluding witness data). This means we can pre-compute the txid of the
 * wrap PSBT BEFORE signing, then use it to build the swap PSBT that spends
 * the wrap's frBTC output.
 *
 * ## Flow
 *
 * 1. Fetch all available UTXOs
 * 2. Build wrap PSBT (SDK) → consumes some UTXOs
 * 3. Pre-compute wrap txid using getUnfinalizedPsbtTxId()
 * 4. Get remaining UTXOs + virtual change from wrap
 * 5. Build swap PSBT:
 *    - Input 0: Chained from wrap output 0 (frBTC)
 *    - Inputs 1..N: Fee inputs from remaining + virtual UTXOs
 * 6. Batch sign [wrap, swap] in single wallet popup
 * 7. Broadcast wrap, then swap (sequential due to dependency)
 *
 * ## OYL SDK Reference
 *
 * Implementation ported from oyl-sdk/src/alkanes/alkanes.ts:
 * - Lines 1311-1519: executeWithBtcWrapUnwrap()
 * - Lines 63-94: addFrBtcWrapOutToPsbt()
 * - Lines 1574-1625: wrapBtcNoSigning()
 *
 * ============================================================================
 * ## Browser Wallet Considerations
 * ============================================================================
 *
 * - Xverse: Shows two signing popups (one per PSBT)
 * - UniSat/OYL: Can batch sign with single popup
 * - All wallets: Use actual addresses, NOT symbolic (p2tr:0 → dummy wallet!)
 *
 * ============================================================================
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { getTokenSymbol } from '@/lib/alkanes-client';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { buildSwapProtostone } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, getSignerAddress, getSignerAddressDynamic, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import {
  getUnfinalizedPsbtTxId,
  getRemainingUtxosAfterPsbt,
  getVirtualChangeUtxos,
  addFrBtcWrapOutputToPsbt,
  hexToXOnly,
  FormattedUtxo,
} from '@/lib/alkanes/chainedPsbt';

bitcoin.initEccLib(ecc);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WrapSwapTransactionData = {
  btcAmount: string;        // BTC amount in display units (e.g., "0.5")
  buyAmount: string;        // Expected output amount in alks
  buyCurrency: string;      // Target token alkane id (e.g., "2:0" for DIESEL)
  buySymbol?: string;       // Symbol for confirmation display (e.g., "DIESEL")
  maxSlippage: string;      // Percent string, e.g., '0.5'
  feeRate: number;          // sats/vB
  poolId?: { block: string | number; tx: string | number }; // Pool reference
  deadlineBlocks?: number;  // Default 3
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWrapSwapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType, browserWallet } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

  return useMutation({
    mutationFn: async (data: WrapSwapTransactionData) => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[WrapSwap] ████ SINGLE-SIGNATURE BTC → TOKEN STARTED ████');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[WrapSwap] Input data:', JSON.stringify(data, null, 2));
      console.log('[WrapSwap] Network:', network);
      console.log('[WrapSwap] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
      console.log('[WrapSwap] wrapFee:', wrapFee);

      if (!isConnected) throw new Error('Wallet not connected');
      // Ensure browser wallet session is active before building PSBT
      if (walletType === 'browser') {
        const { ensureWalletSession } = await import('@/lib/wallet/browserWalletSigning');
        await ensureWalletSession();
      }
      if (!provider) throw new Error('Provider not available');


      // ========================================================================
      // Step 1: Get addresses and validate
      // ========================================================================
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      const taprootPubkey = account?.taproot?.pubkey;

      if (!taprootAddress && !segwitAddress) {
        throw new Error('At least one address (taproot or segwit) is required');
      }
      const primaryAddress = taprootAddress || segwitAddress;
      if (!taprootPubkey) {
        throw new Error('Taproot pubkey required for signing');
      }

      // regtest-local and devnet have ephemeral signer keys — query dynamically.
      const signerAddress = (network === 'devnet' || network === 'regtest-local')
        ? await getSignerAddressDynamic(network)
        : getSignerAddress(network);
      const btcNetwork = getBitcoinNetwork(network);

      console.log('[WrapSwap] Addresses:', { taprootAddress, segwitAddress, primaryAddress, signerAddress });

      // ========================================================================
      // Step 2: Calculate amounts
      // ========================================================================
      const btcAmountSats = new BigNumber(data.btcAmount)
        .multipliedBy(100000000)
        .integerValue(BigNumber.ROUND_FLOOR)
        .toNumber();

      console.log('[WrapSwap] BTC amount:', data.btcAmount, '=', btcAmountSats, 'sats');

      // Calculate frBTC amount after wrap fee
      const frbtcAmountAfterFee = new BigNumber(btcAmountSats)
        .multipliedBy(1000 - wrapFee)
        .dividedBy(1000)
        .integerValue(BigNumber.ROUND_FLOOR)
        .toString();

      console.log('[WrapSwap] frBTC after wrap fee:', frbtcAmountAfterFee, 'alks');

      // Calculate minimum output with slippage
      const minAmountOut = calculateMinimumFromSlippage({
        amount: data.buyAmount,
        maxSlippage: data.maxSlippage,
      });

      console.log('[WrapSwap] Expected output:', data.buyAmount);
      console.log('[WrapSwap] Min output (after slippage):', minAmountOut);

      // Get deadline block height
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local' || network === 'qubitcoin-regtest';
      const deadlineBlocks = isRegtest ? 1000 : (data.deadlineBlocks || 3);
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[WrapSwap] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';

      // ========================================================================
      // Step 3: Fetch all available UTXOs BEFORE building wrap
      // ========================================================================
      // We need the complete UTXO set to calculate virtual change later
      console.log('[WrapSwap] Fetching UTXOs...');

      const addressesToFetch = [taprootAddress, segwitAddress].filter(Boolean) as string[];
      const utxoPromises = addressesToFetch.map(addr =>
        provider.getEnrichedBalances(addr, '1').catch(() => ({ spendable: [] }))
      );

      const utxoResponses = await Promise.all(utxoPromises);

      const allAvailableUtxos: FormattedUtxo[] = [];
      utxoResponses.forEach((resp, idx) => {
        const addr = addressesToFetch[idx];
        const spendable = resp?.spendable || [];
        spendable.forEach((u: any) => {
          allAvailableUtxos.push({
            txId: u.outpoint?.split(':')[0] || u.txid,
            outputIndex: parseInt(u.outpoint?.split(':')[1] || u.vout, 10),
            satoshis: u.value,
            address: addr,
            scriptPk: Buffer.from(bitcoin.address.toOutputScript(addr, btcNetwork)).toString('hex'),
          });
        });
      });

      console.log('[WrapSwap] Total available UTXOs before wrap:', allAvailableUtxos.length);

      // ========================================================================
      // Step 4: Build wrap PSBT using SDK
      // ========================================================================
      // The wrap protostone: [32,0,77]:v1:v1
      // - Output 0 (v0): signer receives BTC
      // - Output 1 (v1): user receives minted frBTC
      console.log('[WrapSwap] Building wrap PSBT...');

      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      const toAddresses = useActualAddresses
        ? [signerAddress, taprootAddress!]
        : [signerAddress, 'p2tr:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = useActualAddresses
        ? taprootAddress
        : 'p2tr:0';

      // Build wrap using SDK
      const wrapResult = await provider.alkanesExecuteTyped({
        inputRequirements: `B:${btcAmountSats}:v0`,
        protostones: `[32,0,77]:v1:v1`, // wrap protostone
        feeRate: data.feeRate,
        autoConfirm: false,
        fromAddresses,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
      });

      if (!wrapResult?.readyToSign?.psbt) {
        throw new Error('Failed to build wrap PSBT');
      }

      const wrapPsbtBase64 = extractPsbtBase64(wrapResult.readyToSign.psbt);
      const wrapPsbt = bitcoin.Psbt.fromBase64(wrapPsbtBase64, { network: btcNetwork });

      console.log('[WrapSwap] Wrap PSBT built:', {
        inputs: wrapPsbt.data.inputs.length,
        outputs: wrapPsbt.txOutputs.length,
      });

      // ========================================================================
      // Step 5: Pre-compute wrap txid
      // ========================================================================
      const wrapTxId = getUnfinalizedPsbtTxId(wrapPsbt);
      console.log('[WrapSwap] Pre-computed wrap txid:', wrapTxId);

      // ========================================================================
      // Step 6: Get UTXOs for swap (remaining + virtual change)
      // ========================================================================
      const userAddresses = new Set([taprootAddress, segwitAddress].filter(Boolean) as string[]);

      const remainingUtxos = getRemainingUtxosAfterPsbt(wrapPsbt, allAvailableUtxos);
      const virtualChangeUtxos = getVirtualChangeUtxos(wrapPsbt, userAddresses, btcNetwork);

      const swapFeeUtxos = [...remainingUtxos, ...virtualChangeUtxos];

      console.log('[WrapSwap] Remaining UTXOs:', remainingUtxos.length);
      console.log('[WrapSwap] Virtual change UTXOs:', virtualChangeUtxos.length);
      console.log('[WrapSwap] Total UTXOs for swap fee:', swapFeeUtxos.length);

      // ========================================================================
      // Step 7: Build swap PSBT manually
      // ========================================================================
      console.log('[WrapSwap] Building swap PSBT...');

      const swapPsbt = new bitcoin.Psbt({ network: btcNetwork });

      // Input 0: Chained from wrap output 1 (user's frBTC)
      // In subfrost wrap, frBTC goes to output 1 (v1)
      // Find the user output in wrap PSBT
      let frbtcOutputIndex = -1;
      for (let i = 0; i < wrapPsbt.txOutputs.length; i++) {
        const out = wrapPsbt.txOutputs[i];
        // Skip OP_RETURN
        if (out.script[0] === 0x6a) continue;
        try {
          const addr = bitcoin.address.fromOutputScript(out.script, btcNetwork);
          if (addr === taprootAddress) {
            frbtcOutputIndex = i;
            break;
          }
        } catch {
          // Skip non-address outputs
        }
      }

      if (frbtcOutputIndex === -1) {
        throw new Error('Could not find frBTC output in wrap PSBT');
      }

      console.log('[WrapSwap] frBTC output index:', frbtcOutputIndex);

      // Add chained input from wrap
      addFrBtcWrapOutputToPsbt({
        wrapPsbt,
        swapPsbt,
        taprootPubkey,
        outputIndex: frbtcOutputIndex,
      });

      // Calculate fee needed for swap
      const dustValue = 546;
      const estimatedSwapFee = Math.ceil(
        (57.5 + 57.5 * 2 + 34 * 3 + 10.5) * data.feeRate // 1 chained + 2 fee inputs, 3 outputs
      );

      console.log('[WrapSwap] Estimated swap fee:', estimatedSwapFee, 'sats');

      // Add fee inputs from remaining + virtual UTXOs
      let totalFeeInputValue = 0;
      let feeInputsAdded = 0;

      for (const utxo of swapFeeUtxos) {
        if (totalFeeInputValue >= estimatedSwapFee + dustValue * 2) {
          break; // Enough inputs
        }

        const script = Buffer.from(utxo.scriptPk, 'hex');
        const isTaproot = utxo.address?.startsWith('bc1p') ||
                          utxo.address?.startsWith('tb1p') ||
                          utxo.address?.startsWith('bcrt1p');

        const inputData: any = {
          hash: utxo.txId,
          index: utxo.outputIndex,
          witnessUtxo: {
            script,
            value: BigInt(utxo.satoshis),
          },
        };

        if (isTaproot) {
          inputData.tapInternalKey = hexToXOnly(taprootPubkey);
        }

        swapPsbt.addInput(inputData);
        totalFeeInputValue += utxo.satoshis;
        feeInputsAdded++;
      }

      console.log('[WrapSwap] Added', feeInputsAdded, 'fee inputs, total value:', totalFeeInputValue, 'sats');

      if (totalFeeInputValue < estimatedSwapFee + dustValue) {
        throw new Error(`Insufficient funds for swap fee: have ${totalFeeInputValue} sats, need ${estimatedSwapFee + dustValue} sats`);
      }

      // Build swap protostone
      const swapProtostone = buildSwapProtostone({
        factoryId: ALKANE_FACTORY_ID,
        sellTokenId: FRBTC_ALKANE_ID,
        buyTokenId: data.buyCurrency,
        sellAmount: frbtcAmountAfterFee,
        minOutput: new BigNumber(minAmountOut).integerValue(BigNumber.ROUND_FLOOR).toString(),
        deadline: deadline.toString(),
      });

      console.log('[WrapSwap] Swap protostone:', swapProtostone);

      // Encode protostone to OP_RETURN script
      const [factoryBlock, factoryTx] = ALKANE_FACTORY_ID.split(':');
      const [sellBlock, sellTx] = FRBTC_ALKANE_ID.split(':');
      const [buyBlock, buyTx] = data.buyCurrency.split(':');

      // For now, use SDK to build the swap PSBT properly with protostone encoding
      // Build swap PSBT using SDK for proper protostone encoding
      const swapFromAddresses = isBrowserWallet
        ? [taprootAddress!]
        : ['p2tr:0'];

      const swapToAddresses = isBrowserWallet
        ? [taprootAddress!]
        : ['p2tr:0'];

      // Build swap input requirements: frBTC from wrap output
      // The frBTC will come from the chained input, so we just need to tell SDK
      // about the alkane input
      const swapInputRequirements = `${sellBlock}:${sellTx}:${frbtcAmountAfterFee}`;

      const swapResult = await provider.alkanesExecuteTyped({
        inputRequirements: swapInputRequirements,
        protostones: swapProtostone,
        feeRate: data.feeRate,
        autoConfirm: false,
        fromAddresses: swapFromAddresses,
        toAddresses: swapToAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
      });

      if (!swapResult?.readyToSign?.psbt) {
        throw new Error('Failed to build swap PSBT');
      }

      const swapPsbtBase64 = extractPsbtBase64(swapResult.readyToSign.psbt);
      const finalSwapPsbt = bitcoin.Psbt.fromBase64(swapPsbtBase64, { network: btcNetwork });

      console.log('[WrapSwap] Swap PSBT built:', {
        inputs: finalSwapPsbt.data.inputs.length,
        outputs: finalSwapPsbt.txOutputs.length,
      });

      // ========================================================================
      // Step 8: Replace swap's first input with chained input from wrap
      // ========================================================================
      // The SDK built swap PSBT expecting frBTC from an existing UTXO.
      // We need to replace input 0 with the chained input from wrap output.

      // Get the frBTC output from wrap
      const wrapFrbtcOutput = wrapPsbt.txOutputs[frbtcOutputIndex];

      // Modify the swap PSBT's first input to reference wrap output
      const modifiedSwapPsbt = new bitcoin.Psbt({ network: btcNetwork });

      // Add chained input from wrap (this will be input 0)
      modifiedSwapPsbt.addInput({
        hash: wrapTxId,
        index: frbtcOutputIndex,
        witnessUtxo: {
          script: wrapFrbtcOutput.script,
          value: BigInt(wrapFrbtcOutput.value),
        },
        tapInternalKey: hexToXOnly(taprootPubkey),
      });

      // Copy remaining inputs from SDK-built swap PSBT (skip input 0 which was the old frBTC UTXO)
      for (let i = 1; i < finalSwapPsbt.data.inputs.length; i++) {
        const input = finalSwapPsbt.data.inputs[i];
        const txInput = finalSwapPsbt.txInputs[i];

        modifiedSwapPsbt.addInput({
          hash: txInput.hash,
          index: txInput.index,
          sequence: txInput.sequence,
          witnessUtxo: input.witnessUtxo,
          tapInternalKey: input.tapInternalKey,
          redeemScript: input.redeemScript,
          nonWitnessUtxo: input.nonWitnessUtxo,
        });
      }

      // Copy all outputs from SDK-built swap PSBT
      finalSwapPsbt.txOutputs.forEach(output => {
        modifiedSwapPsbt.addOutput({
          script: output.script,
          value: output.value,
        });
      });

      console.log('[WrapSwap] Modified swap PSBT:', {
        inputs: modifiedSwapPsbt.data.inputs.length,
        outputs: modifiedSwapPsbt.txOutputs.length,
      });

      // ========================================================================
      // Step 9: Patch inputs for browser wallet compatibility
      // ========================================================================
      let finalWrapPsbtBase64 = wrapPsbtBase64;
      let finalSwapPsbtBase64 = modifiedSwapPsbt.toBase64();

      if (isBrowserWallet) {
        // Patch wrap PSBT inputs
        const wrapPatchResult = patchInputsOnly({
          psbtBase64: finalWrapPsbtBase64,
          network: btcNetwork,
          taprootAddress: taprootAddress!,
          segwitAddress,
          paymentPubkeyHex: account?.nativeSegwit?.pubkey,
        });
        finalWrapPsbtBase64 = wrapPatchResult.psbtBase64;
        if (wrapPatchResult.inputsPatched > 0) {
          console.log(`[WrapSwap] Patched ${wrapPatchResult.inputsPatched} wrap input(s)`);
        }

        // Patch swap PSBT inputs
        const swapPatchResult = patchInputsOnly({
          psbtBase64: finalSwapPsbtBase64,
          network: btcNetwork,
          taprootAddress: taprootAddress!,
          segwitAddress,
          paymentPubkeyHex: account?.nativeSegwit?.pubkey,
        });
        finalSwapPsbtBase64 = swapPatchResult.psbtBase64;
        if (swapPatchResult.inputsPatched > 0) {
          console.log(`[WrapSwap] Patched ${swapPatchResult.inputsPatched} swap input(s)`);
        }
      }

      // ========================================================================
      // Step 10: Request user confirmation (keystore only)
      // ========================================================================
      if (walletType === 'keystore') {
        console.log('[WrapSwap] Keystore wallet - requesting user confirmation...');
        const approved = await requestConfirmation({
          type: 'swap',
          title: 'Confirm BTC → Token Swap',
          description: 'Wrap BTC to frBTC, then swap to target token',
          fromAmount: data.btcAmount,
          fromSymbol: 'BTC',
          toAmount: (parseFloat(data.buyAmount) / 1e8).toString(),
          toSymbol: getTokenSymbol(data.buyCurrency, data.buySymbol),
          toId: data.buyCurrency,
          feeRate: data.feeRate,
        });

        if (!approved) {
          console.log('[WrapSwap] User rejected transaction');
          throw new Error('Transaction rejected by user');
        }
        console.log('[WrapSwap] User approved transaction');
      }

      // ========================================================================
      // Step 11: Batch sign PSBTs
      // ========================================================================
      console.log('[WrapSwap] Signing PSBTs...');

      let signedWrapPsbtBase64: string;
      let signedSwapPsbtBase64: string;

      if (isBrowserWallet) {
        // Browser wallets: sign both PSBTs (may be batch or sequential)
        console.log('[WrapSwap] Browser wallet: signing wrap PSBT...');
        signedWrapPsbtBase64 = await signTaprootPsbt(finalWrapPsbtBase64);

        console.log('[WrapSwap] Browser wallet: signing swap PSBT...');
        signedSwapPsbtBase64 = await signTaprootPsbt(finalSwapPsbtBase64);
      } else {
        // Keystore: sign with both SegWit and Taproot keys
        console.log('[WrapSwap] Keystore: signing wrap PSBT...');
        signedWrapPsbtBase64 = await signSegwitPsbt(finalWrapPsbtBase64);
        signedWrapPsbtBase64 = await signTaprootPsbt(signedWrapPsbtBase64);

        console.log('[WrapSwap] Keystore: signing swap PSBT...');
        signedSwapPsbtBase64 = await signSegwitPsbt(finalSwapPsbtBase64);
        signedSwapPsbtBase64 = await signTaprootPsbt(signedSwapPsbtBase64);
      }

      // ========================================================================
      // Step 12: Finalize and extract transactions
      // ========================================================================
      console.log('[WrapSwap] Finalizing transactions...');

      const signedWrapPsbt = bitcoin.Psbt.fromBase64(signedWrapPsbtBase64, { network: btcNetwork });
      const signedSwapPsbt = bitcoin.Psbt.fromBase64(signedSwapPsbtBase64, { network: btcNetwork });

      // Check if already finalized (some wallets do this)
      const wrapAlreadyFinalized = signedWrapPsbt.data.inputs.every(input =>
        input.finalScriptWitness || input.finalScriptSig
      );
      const swapAlreadyFinalized = signedSwapPsbt.data.inputs.every(input =>
        input.finalScriptWitness || input.finalScriptSig
      );

      if (!wrapAlreadyFinalized) {
        signedWrapPsbt.finalizeAllInputs();
      }
      if (!swapAlreadyFinalized) {
        signedSwapPsbt.finalizeAllInputs();
      }

      const wrapTx = signedWrapPsbt.extractTransaction();
      const swapTx = signedSwapPsbt.extractTransaction();

      const wrapTxHex = wrapTx.toHex();
      const swapTxHex = swapTx.toHex();

      const finalWrapTxId = wrapTx.getId();
      const finalSwapTxId = swapTx.getId();

      console.log('[WrapSwap] Wrap txid:', finalWrapTxId);
      console.log('[WrapSwap] Swap txid:', finalSwapTxId);

      // Verify pre-computed txid matches
      if (finalWrapTxId !== wrapTxId) {
        console.warn('[WrapSwap] WARNING: Pre-computed wrap txid mismatch!');
        console.warn('[WrapSwap] Expected:', wrapTxId);
        console.warn('[WrapSwap] Actual:', finalWrapTxId);
      }

      // ========================================================================
      // Step 13: Broadcast transactions (sequential due to dependency)
      // ========================================================================
      console.log('[WrapSwap] Broadcasting wrap transaction...');
      const wrapBroadcastResult = await provider.broadcastTransaction(wrapTxHex);
      console.log('[WrapSwap] Wrap broadcast result:', wrapBroadcastResult);

      console.log('[WrapSwap] Broadcasting swap transaction...');
      const swapBroadcastResult = await provider.broadcastTransaction(swapTxHex);
      console.log('[WrapSwap] Swap broadcast result:', swapBroadcastResult);

      console.log('═══════════════════════════════════════════════════════════');
      console.log('[WrapSwap] ████ SUCCESS ████');
      console.log('═══════════════════════════════════════════════════════════');

      return {
        success: true,
        wrapTxId: wrapBroadcastResult || finalWrapTxId,
        swapTxId: swapBroadcastResult || finalSwapTxId,
        transactionId: swapBroadcastResult || finalSwapTxId, // For compatibility
      };
    },
    onSuccess: (data) => {
      console.log('[WrapSwap] ✓ Success!');
      console.log('[WrapSwap] Wrap txid:', data.wrapTxId);
      console.log('[WrapSwap] Swap txid:', data.swapTxId);

      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balance'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['alkanesTokenPairs'] });
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[WrapSwap] Queries invalidated');
    },
    onError: (error) => {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('[WrapSwap] ████ ERROR ████');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('[WrapSwap] Error:', error);
    },
  });
}
