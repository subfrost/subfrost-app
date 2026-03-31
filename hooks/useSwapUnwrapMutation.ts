/**
 * useSwapUnwrapMutation - Single-signature Token → BTC swap
 *
 * ============================================================================
 * ## Overview
 * ============================================================================
 *
 * This hook implements single-popup Token → BTC swaps by building both the
 * swap (Token → frBTC) and unwrap (frBTC → BTC) PSBTs upfront, then batch
 * signing them in one wallet interaction.
 *
 * ## Key Innovation: Pre-computed TXIDs
 *
 * Bitcoin transaction IDs are computed from the serialized transaction
 * (excluding witness data). This means we can pre-compute the txid of the
 * swap PSBT BEFORE signing, then use it to build the unwrap PSBT that spends
 * the swap's frBTC output.
 *
 * ## Flow
 *
 * 1. Fetch all available UTXOs
 * 2. Build swap PSBT (SDK) → Token → frBTC
 * 3. Pre-compute swap txid using getUnfinalizedPsbtTxId()
 * 4. Get remaining UTXOs + virtual change from swap
 * 5. Build unwrap PSBT:
 *    - Input 0: Chained from swap output (frBTC)
 *    - Inputs 1..N: Fee inputs from remaining + virtual UTXOs
 * 6. Batch sign [swap, unwrap] in single wallet popup
 * 7. Broadcast swap, then unwrap (sequential due to dependency)
 *
 * ## OYL SDK Reference
 *
 * Implementation ported from oyl-sdk/src/alkanes/alkanes.ts:
 * - Lines 1311-1519: executeWithBtcWrapUnwrap()
 * - Lines 63-94: addFrBtcWrapOutToPsbt()
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
 * ⚠️⚠️⚠️ CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01) ⚠️⚠️⚠️
 * ============================================================================
 *
 * When using browser wallets (Xverse, OYL, etc.), you MUST pass ACTUAL addresses
 * to toAddresses/changeAddress/alkanesChangeAddress — NOT symbolic addresses like
 * 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet!
 *
 * See useSwapMutation.ts header comment for full documentation of this bug.
 * ============================================================================
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { getTokenSymbol } from '@/lib/alkanes-client';
import { FRBTC_UNWRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { buildSwapProtostone, buildSwapInputRequirements, buildUnwrapProtostone } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import {
  getUnfinalizedPsbtTxId,
  getRemainingUtxosAfterPsbt,
  getVirtualChangeUtxos,
  hexToXOnly,
  FormattedUtxo,
} from '@/lib/alkanes/chainedPsbt';

bitcoin.initEccLib(ecc);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SwapUnwrapTransactionData = {
  sellAmount: string;        // Token amount in alks
  sellCurrency: string;      // Token alkane id (e.g., "2:0" for DIESEL)
  sellSymbol?: string;       // Symbol for confirmation display
  buyAmount: string;         // Expected frBTC output in alks (before unwrap fee)
  btcAmount?: string;        // Expected BTC amount for display
  expectedBtcAmount?: string; // Alternative field for expected BTC
  maxSlippage: string;       // Percent string, e.g., '0.5'
  feeRate: number;           // sats/vB
  poolId?: { block: string | number; tx: string | number }; // Pool reference
  deadlineBlocks?: number;   // Default 3
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSwapUnwrapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const unwrapFee = premiumData?.unwrapFeePerThousand ?? FRBTC_UNWRAP_FEE_PER_1000;

  return useMutation({
    mutationFn: async (data: SwapUnwrapTransactionData) => {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[SwapUnwrap] ████ SINGLE-SIGNATURE TOKEN → BTC STARTED ████');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[SwapUnwrap] Input data:', JSON.stringify(data, null, 2));
      console.log('[SwapUnwrap] Network:', network);
      console.log('[SwapUnwrap] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
      console.log('[SwapUnwrap] unwrapFee:', unwrapFee);

      if (!isConnected) throw new Error('Wallet not connected');
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
      if (!taprootPubkey) {
        throw new Error('Taproot pubkey required for signing');
      }

      const btcNetwork = getBitcoinNetwork(network);
      const primaryAddress = taprootAddress || segwitAddress;

      console.log('[SwapUnwrap] Addresses:', { taprootAddress, segwitAddress });

      // ========================================================================
      // Step 2: Calculate amounts
      // ========================================================================
      const sellAmountBn = new BigNumber(data.sellAmount);
      // Support both buyAmount and expectedBtcAmount for backwards compatibility
      const expectedFrbtcAmount = data.buyAmount || data.expectedBtcAmount || '0';

      console.log('[SwapUnwrap] Sell amount:', data.sellAmount, 'alks');

      // Calculate minimum frBTC output with slippage
      const minFrbtcOut = calculateMinimumFromSlippage({
        amount: expectedFrbtcAmount,
        maxSlippage: data.maxSlippage,
      });

      console.log('[SwapUnwrap] Expected frBTC output:', expectedFrbtcAmount);
      console.log('[SwapUnwrap] Min frBTC output (after slippage):', minFrbtcOut);

      // Calculate expected BTC after unwrap fee
      const expectedBtcAfterUnwrap = new BigNumber(expectedFrbtcAmount)
        .multipliedBy(1000 - unwrapFee)
        .dividedBy(1000)
        .integerValue(BigNumber.ROUND_FLOOR)
        .toString();

      console.log('[SwapUnwrap] Expected BTC after unwrap fee:', expectedBtcAfterUnwrap, 'sats');

      // Get deadline block height
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
      const deadlineBlocks = isRegtest ? 1000 : (data.deadlineBlocks || 3);
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[SwapUnwrap] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      const isBrowserWallet = walletType === 'browser';

      // ========================================================================
      // Step 3: Fetch all available UTXOs BEFORE building swap
      // ========================================================================
      console.log('[SwapUnwrap] Fetching UTXOs...');

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

      console.log('[SwapUnwrap] Total available UTXOs before swap:', allAvailableUtxos.length);

      // ========================================================================
      // Step 4: Build swap PSBT using SDK (Token → frBTC)
      // ========================================================================
      console.log('[SwapUnwrap] Building swap PSBT (Token → frBTC)...');

      const fromAddresses = isBrowserWallet
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      const toAddresses = isBrowserWallet
        ? [taprootAddress]
        : ['p2tr:0'];

      const changeAddr = isBrowserWallet
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = isBrowserWallet
        ? taprootAddress
        : 'p2tr:0';

      // Build swap protostone: Token → frBTC via factory
      const swapProtostone = buildSwapProtostone({
        factoryId: ALKANE_FACTORY_ID,
        sellTokenId: data.sellCurrency,
        buyTokenId: FRBTC_ALKANE_ID,
        sellAmount: sellAmountBn.toFixed(0),
        minOutput: new BigNumber(minFrbtcOut).integerValue(BigNumber.ROUND_FLOOR).toString(),
        deadline: deadline.toString(),
      });

      console.log('[SwapUnwrap] Swap protostone:', swapProtostone);

      // Build input requirements for the swap
      const swapInputRequirements = buildSwapInputRequirements({
        alkaneInputs: [{
          alkaneId: data.sellCurrency,
          amount: sellAmountBn.toFixed(0),
        }],
      });

      console.log('[SwapUnwrap] Swap input requirements:', swapInputRequirements);

      // Build swap using SDK
      const swapResult = await provider.alkanesExecuteTyped({
        inputRequirements: swapInputRequirements,
        protostones: swapProtostone,
        feeRate: data.feeRate,
        autoConfirm: false,
        fromAddresses,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
      });

      if (!swapResult?.readyToSign?.psbt) {
        throw new Error('Failed to build swap PSBT');
      }

      const swapPsbtBase64 = extractPsbtBase64(swapResult.readyToSign.psbt);
      const swapPsbt = bitcoin.Psbt.fromBase64(swapPsbtBase64, { network: btcNetwork });

      console.log('[SwapUnwrap] Swap PSBT built:', {
        inputs: swapPsbt.data.inputs.length,
        outputs: swapPsbt.txOutputs.length,
      });

      // ========================================================================
      // Step 5: Pre-compute swap txid
      // ========================================================================
      const swapTxId = getUnfinalizedPsbtTxId(swapPsbt);
      console.log('[SwapUnwrap] Pre-computed swap txid:', swapTxId);

      // ========================================================================
      // Step 6: Find frBTC output in swap PSBT
      // ========================================================================
      // The frBTC output goes to user's taproot address
      let frbtcOutputIndex = -1;
      for (let i = 0; i < swapPsbt.txOutputs.length; i++) {
        const out = swapPsbt.txOutputs[i];
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
        throw new Error('Could not find frBTC output in swap PSBT');
      }

      console.log('[SwapUnwrap] frBTC output index:', frbtcOutputIndex);

      // ========================================================================
      // Step 7: Get UTXOs for unwrap (remaining + virtual change)
      // ========================================================================
      const userAddresses = new Set([taprootAddress, segwitAddress].filter(Boolean) as string[]);

      const remainingUtxos = getRemainingUtxosAfterPsbt(swapPsbt, allAvailableUtxos);
      const virtualChangeUtxos = getVirtualChangeUtxos(swapPsbt, userAddresses, btcNetwork);

      const unwrapFeeUtxos = [...remainingUtxos, ...virtualChangeUtxos];

      console.log('[SwapUnwrap] Remaining UTXOs:', remainingUtxos.length);
      console.log('[SwapUnwrap] Virtual change UTXOs:', virtualChangeUtxos.length);
      console.log('[SwapUnwrap] Total UTXOs for unwrap fee:', unwrapFeeUtxos.length);

      // ========================================================================
      // Step 8: Build unwrap PSBT using SDK
      // ========================================================================
      console.log('[SwapUnwrap] Building unwrap PSBT...');

      // Build unwrap protostone
      const unwrapProtostone = buildUnwrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });

      console.log('[SwapUnwrap] Unwrap protostone:', unwrapProtostone);

      // For unwrap, we need frBTC input. Build input requirements.
      const [frbtcBlock, frbtcTx] = FRBTC_ALKANE_ID.split(':');

      // Unwrap outputs BTC to segwit address (or taproot if no segwit)
      const unwrapToAddresses = isBrowserWallet
        ? [(segwitAddress || taprootAddress)!]
        : ['p2wpkh:0'];

      // Build unwrap using SDK
      const unwrapInputRequirements = `${frbtcBlock}:${frbtcTx}:${minFrbtcOut}`;

      const unwrapResult = await provider.alkanesExecuteTyped({
        inputRequirements: unwrapInputRequirements,
        protostones: unwrapProtostone,
        feeRate: data.feeRate,
        autoConfirm: false,
        fromAddresses: isBrowserWallet ? [taprootAddress] : ['p2tr:0'],
        toAddresses: unwrapToAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
      });

      if (!unwrapResult?.readyToSign?.psbt) {
        throw new Error('Failed to build unwrap PSBT');
      }

      const unwrapPsbtBase64 = extractPsbtBase64(unwrapResult.readyToSign.psbt);
      const sdkUnwrapPsbt = bitcoin.Psbt.fromBase64(unwrapPsbtBase64, { network: btcNetwork });

      console.log('[SwapUnwrap] SDK unwrap PSBT built:', {
        inputs: sdkUnwrapPsbt.data.inputs.length,
        outputs: sdkUnwrapPsbt.txOutputs.length,
      });

      // ========================================================================
      // Step 9: Replace unwrap's first input with chained input from swap
      // ========================================================================
      // The SDK built unwrap PSBT expecting frBTC from an existing UTXO.
      // We need to replace input 0 with the chained input from swap output.

      const swapFrbtcOutput = swapPsbt.txOutputs[frbtcOutputIndex];

      const modifiedUnwrapPsbt = new bitcoin.Psbt({ network: btcNetwork });

      // Add chained input from swap (this will be input 0)
      modifiedUnwrapPsbt.addInput({
        hash: swapTxId,
        index: frbtcOutputIndex,
        witnessUtxo: {
          script: swapFrbtcOutput.script,
          value: BigInt(swapFrbtcOutput.value),
        },
        tapInternalKey: hexToXOnly(taprootPubkey),
      });

      // Copy remaining inputs from SDK-built unwrap PSBT (skip input 0 which was the old frBTC UTXO)
      for (let i = 1; i < sdkUnwrapPsbt.data.inputs.length; i++) {
        const input = sdkUnwrapPsbt.data.inputs[i];
        const txInput = sdkUnwrapPsbt.txInputs[i];

        modifiedUnwrapPsbt.addInput({
          hash: txInput.hash,
          index: txInput.index,
          sequence: txInput.sequence,
          witnessUtxo: input.witnessUtxo,
          tapInternalKey: input.tapInternalKey,
          redeemScript: input.redeemScript,
          nonWitnessUtxo: input.nonWitnessUtxo,
        });
      }

      // Copy all outputs from SDK-built unwrap PSBT
      sdkUnwrapPsbt.txOutputs.forEach(output => {
        modifiedUnwrapPsbt.addOutput({
          script: output.script,
          value: output.value,
        });
      });

      console.log('[SwapUnwrap] Modified unwrap PSBT:', {
        inputs: modifiedUnwrapPsbt.data.inputs.length,
        outputs: modifiedUnwrapPsbt.txOutputs.length,
      });

      // ========================================================================
      // Step 10: Patch inputs for browser wallet compatibility
      // ========================================================================
      let finalSwapPsbtBase64 = swapPsbtBase64;
      let finalUnwrapPsbtBase64 = modifiedUnwrapPsbt.toBase64();

      if (isBrowserWallet) {
        // Patch swap PSBT inputs
        const swapPatchResult = patchInputsOnly({
          psbtBase64: finalSwapPsbtBase64,
          network: btcNetwork,
          taprootAddress,
          segwitAddress,
          paymentPubkeyHex: account?.nativeSegwit?.pubkey,
        });
        finalSwapPsbtBase64 = swapPatchResult.psbtBase64;
        if (swapPatchResult.inputsPatched > 0) {
          console.log(`[SwapUnwrap] Patched ${swapPatchResult.inputsPatched} swap input(s)`);
        }

        // Patch unwrap PSBT inputs
        const unwrapPatchResult = patchInputsOnly({
          psbtBase64: finalUnwrapPsbtBase64,
          network: btcNetwork,
          taprootAddress,
          segwitAddress,
          paymentPubkeyHex: account?.nativeSegwit?.pubkey,
        });
        finalUnwrapPsbtBase64 = unwrapPatchResult.psbtBase64;
        if (unwrapPatchResult.inputsPatched > 0) {
          console.log(`[SwapUnwrap] Patched ${unwrapPatchResult.inputsPatched} unwrap input(s)`);
        }
      }

      // ========================================================================
      // Step 11: Request user confirmation (keystore only)
      // ========================================================================
      if (walletType === 'keystore') {
        console.log('[SwapUnwrap] Keystore wallet - requesting user confirmation...');
        const approved = await requestConfirmation({
          type: 'swap',
          title: 'Confirm Token → BTC Swap',
          description: 'Swap token to frBTC, then unwrap to BTC',
          fromAmount: (parseFloat(data.sellAmount) / 1e8).toString(),
          fromSymbol: getTokenSymbol(data.sellCurrency, data.sellSymbol),
          fromId: data.sellCurrency,
          toAmount: (parseFloat(expectedBtcAfterUnwrap) / 1e8).toString(),
          toSymbol: 'BTC',
          feeRate: data.feeRate,
        });

        if (!approved) {
          console.log('[SwapUnwrap] User rejected transaction');
          throw new Error('Transaction rejected by user');
        }
        console.log('[SwapUnwrap] User approved transaction');
      }

      // ========================================================================
      // Step 12: Batch sign PSBTs
      // ========================================================================
      console.log('[SwapUnwrap] Signing PSBTs...');

      let signedSwapPsbtBase64: string;
      let signedUnwrapPsbtBase64: string;

      if (isBrowserWallet) {
        // Browser wallets: sign both PSBTs (may be batch or sequential)
        console.log('[SwapUnwrap] Browser wallet: signing swap PSBT...');
        signedSwapPsbtBase64 = await signTaprootPsbt(finalSwapPsbtBase64);

        console.log('[SwapUnwrap] Browser wallet: signing unwrap PSBT...');
        signedUnwrapPsbtBase64 = await signTaprootPsbt(finalUnwrapPsbtBase64);
      } else {
        // Keystore: sign with both SegWit and Taproot keys
        console.log('[SwapUnwrap] Keystore: signing swap PSBT...');
        signedSwapPsbtBase64 = await signSegwitPsbt(finalSwapPsbtBase64);
        signedSwapPsbtBase64 = await signTaprootPsbt(signedSwapPsbtBase64);

        console.log('[SwapUnwrap] Keystore: signing unwrap PSBT...');
        signedUnwrapPsbtBase64 = await signSegwitPsbt(finalUnwrapPsbtBase64);
        signedUnwrapPsbtBase64 = await signTaprootPsbt(signedUnwrapPsbtBase64);
      }

      // ========================================================================
      // Step 13: Finalize and extract transactions
      // ========================================================================
      console.log('[SwapUnwrap] Finalizing transactions...');

      const signedSwapPsbt = bitcoin.Psbt.fromBase64(signedSwapPsbtBase64, { network: btcNetwork });
      const signedUnwrapPsbt = bitcoin.Psbt.fromBase64(signedUnwrapPsbtBase64, { network: btcNetwork });

      // Check if already finalized (some wallets do this)
      const swapAlreadyFinalized = signedSwapPsbt.data.inputs.every(input =>
        input.finalScriptWitness || input.finalScriptSig
      );
      const unwrapAlreadyFinalized = signedUnwrapPsbt.data.inputs.every(input =>
        input.finalScriptWitness || input.finalScriptSig
      );

      if (!swapAlreadyFinalized) {
        signedSwapPsbt.finalizeAllInputs();
      }
      if (!unwrapAlreadyFinalized) {
        signedUnwrapPsbt.finalizeAllInputs();
      }

      const swapTx = signedSwapPsbt.extractTransaction();
      const unwrapTx = signedUnwrapPsbt.extractTransaction();

      const swapTxHex = swapTx.toHex();
      const unwrapTxHex = unwrapTx.toHex();

      const finalSwapTxId = swapTx.getId();
      const finalUnwrapTxId = unwrapTx.getId();

      console.log('[SwapUnwrap] Swap txid:', finalSwapTxId);
      console.log('[SwapUnwrap] Unwrap txid:', finalUnwrapTxId);

      // Verify pre-computed txid matches
      if (finalSwapTxId !== swapTxId) {
        console.warn('[SwapUnwrap] WARNING: Pre-computed swap txid mismatch!');
        console.warn('[SwapUnwrap] Expected:', swapTxId);
        console.warn('[SwapUnwrap] Actual:', finalSwapTxId);
      }

      // ========================================================================
      // Step 14: Broadcast transactions (sequential due to dependency)
      // ========================================================================
      console.log('[SwapUnwrap] Broadcasting swap transaction...');
      const swapBroadcastResult = await provider.broadcastTransaction(swapTxHex);
      console.log('[SwapUnwrap] Swap broadcast result:', swapBroadcastResult);

      console.log('[SwapUnwrap] Broadcasting unwrap transaction...');
      const unwrapBroadcastResult = await provider.broadcastTransaction(unwrapTxHex);
      console.log('[SwapUnwrap] Unwrap broadcast result:', unwrapBroadcastResult);

      console.log('═══════════════════════════════════════════════════════════');
      console.log('[SwapUnwrap] ████ SUCCESS ████');
      console.log('═══════════════════════════════════════════════════════════');

      return {
        success: true,
        swapTxId: swapBroadcastResult || finalSwapTxId,
        unwrapTxId: unwrapBroadcastResult || finalUnwrapTxId,
        transactionId: unwrapBroadcastResult || finalUnwrapTxId, // For compatibility
      };
    },
    onSuccess: (data) => {
      console.log('[SwapUnwrap] ✓ Success!');
      console.log('[SwapUnwrap] Swap txid:', data.swapTxId);
      console.log('[SwapUnwrap] Unwrap txid:', data.unwrapTxId);

      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['alkanesTokenPairs'] });
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[SwapUnwrap] Queries invalidated');
    },
    onError: (error) => {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('[SwapUnwrap] ████ ERROR ████');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('[SwapUnwrap] Error:', error);
    },
  });
}
