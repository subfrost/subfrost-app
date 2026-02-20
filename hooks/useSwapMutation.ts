/**
 * useSwapMutation - Execute AMM swap transactions
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## CRITICAL IMPLEMENTATION NOTES (January 2026)
 *
 * ### Why We Call the Factory (Not the Pool Directly)
 *
 * The deployed pool logic WASM at [4:65496] is missing Swap (opcode 3) and
 * SimulateSwap (opcode 4) — it's an older build. However, the factory contract
 * at [4:65498] has router opcodes that execute swaps internally:
 *   - 13: SwapExactTokensForTokens (verified working via simulate)
 *   - 14: SwapTokensForExactTokens
 *
 * Factory opcode 13 format:
 *   [factory_block, factory_tx, 13, path_len, ...path_tokens, amount_in, amount_out_min, deadline]
 *
 * ### SDK Auto-Edict Pattern
 *
 * For the swap to work, input tokens must appear in the factory's `incomingAlkanes`.
 * The SDK auto-generates the edict from `inputRequirements`:
 *   - p0: SDK auto-edict (from inputRequirements) - transfers sell tokens to p1
 *   - p1: Our cellpack [factory_block,factory_tx,13,...] - calls factory with swap opcode
 *
 * IMPORTANT: Do NOT add manual edicts to the protostones string. The SDK's
 * `alkanesExecuteWithStrings` auto-generates edicts from `inputRequirements`.
 * Adding manual edicts causes a double-edict bug where protostone indices shift
 * and the factory receives zero tokens (see buildSwapProtostone journal entry).
 *
 * ### Journal: 2026-01-28 — Swap token loss investigation & factory router fix
 *
 * PROBLEM: DIESEL → frBTC swaps broadcast and confirmed on Bitcoin, but no actual
 * swap occurred. User DIESEL was not debited, no frBTC received. Pool reserves
 * stable at 72.76 DIESEL / 6.99 frBTC.
 *
 * INVESTIGATION:
 *   1. Traced tx on-chain — confirmed but alkanes_protorunesbyoutpoint returned empty
 *      for all outputs, meaning no alkane state changes were recorded.
 *   2. Simulated pool [2:6] opcode 3 (Swap) directly via alkanes_simulate:
 *      → "Extcall failed: ALKANES: revert: Error: Unrecognized opcode"
 *   3. Systematically tested all pool opcodes on [2:6]:
 *      - Opcode 1 (AddLiquidity):    ✅ Works
 *      - Opcode 2 (RemoveLiquidity): ✅ Works
 *      - Opcode 3 (Swap):            ❌ "Unrecognized opcode"
 *      - Opcode 4 (SimulateSwap):    ❌ "Unrecognized opcode"
 *      - Opcode 97 (GetReserves):    ✅ Works
 *      - Opcode 999 (PoolDetails):   ✅ Works
 *   4. Ran `strings` on prod_wasms/pool.wasm — opcode 3 EXISTS in the binary file
 *      but the DEPLOYED version at [4:65496] doesn't have it (older build).
 *   5. Discovered factory [4:65498] has router opcodes 13/14 for swaps.
 *   6. Verified factory opcode 13 via simulate:
 *      inputs: ["13","2","2","0","32","0","10000000","0","999999999"]
 *      alkanes: [{id:{block:2,tx:0},value:"10000000"}]
 *      → SUCCESS: returned frBTC [32:0] = 950,148
 *
 * FIX: Changed buildSwapProtostone from calling pool with opcode 3 to calling
 * factory with opcode 13 (SwapExactTokensForTokens). Same two-protostone pattern,
 * but p1 now targets the factory instead of the pool. Applied same fix to
 * useWrapSwapMutation (BTC→token) and useSwapUnwrapMutation (token→BTC).
 *
 * VERIFIED: User-tested DIESEL → frBTC swap — correct frBTC amount received.
 *
 * @see constants/index.ts - FACTORY_OPCODES documentation
 * @see useRemoveLiquidityMutation.ts - Same two-protostone pattern for burns
 * @see useAddLiquidityMutation.ts - Uses factory routing (different pattern)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
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
import { patchPsbtForBrowserWallet } from '@/lib/psbt-patching';
import { buildSwapProtostone, buildSwapInputRequirements } from '@/lib/alkanes/builders';
import { FACTORY_SWAP_OPCODE } from '@/lib/alkanes/constants';
import { uint8ArrayToBase64, getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';

bitcoin.initEccLib(ecc);

export type SwapTransactionBaseData = {
  sellCurrency: string; // alkane id or 'btc'
  buyCurrency: string; // alkane id or 'btc'
  direction: 'sell' | 'buy';
  sellAmount: string; // alks
  buyAmount: string; // alks
  maxSlippage: string; // percent string, e.g. '0.5'
  feeRate: number; // sats/vB
  tokenPath?: string[]; // optional explicit path
  poolId?: { block: string | number; tx: string | number }; // Pool reference (not used for routing)
  deadlineBlocks?: number; // default 3
  isDieselMint?: boolean;
  // For confirmation modal display (optional)
  sellSymbol?: string;
  buySymbol?: string;
  skipConfirmation?: boolean; // For browser wallets that handle their own confirmation
};

/**
 * Build protostone string for AMM swap operations
 *
 * Returns ONLY the factory cellpack protostone (no manual edict).
 * The edict that delivers sell tokens to this cellpack is auto-generated
 * by the SDK from the `inputRequirements` parameter passed to
 * `alkanesExecuteWithStrings`. The SDK creates p0 (edict → p1) and
 * this cellpack becomes p1.
 *
 * ### Journal: 2026-02-01 — Double-edict bug fix
 *
 * PROBLEM: frBTC→DIESEL swaps broadcast but frBTC ends up at vout 0 instead
 * of being consumed by the factory. Tx be4466de... confirmed this.
 *
 * ROOT CAUSE: `alkanesExecuteWithStrings` auto-generates an edict protostone
 * (p0) from `inputRequirements` that transfers alkane tokens to p1. Our code
 * was ALSO providing a manual edict in the protostones string, creating:
 *   p0: SDK auto-edict [32:0:amount:p1] → sends frBTC to p1
 *   p1: Our manual edict [32:0:amount:p1] → NOT the factory!
 *   p2: Our factory cellpack → receives nothing
 * The factory at p2 got zero incomingAlkanes and the swap silently failed.
 *
 * FIX: Remove the manual edict. Let inputRequirements handle it:
 *   p0: SDK auto-edict [32:0:amount:p1] → sends frBTC to p1
 *   p1: Factory cellpack → receives frBTC as incomingAlkanes ✓
 *
 * Factory opcode 13 format:
 *   [factory_block,factory_tx,13,path_len,sell_block,sell_tx,buy_block,buy_tx,amount_in,amount_out_min,deadline]
 */

export function useSwapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig(network);

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

      // Get addresses - use actual addresses instead of SDK descriptors
      // This fixes the "Available: []" issue where SDK couldn't find alkane UTXOs
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');
      console.log('[useSwapMutation] Using addresses:', { taprootAddress, segwitAddress });

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

      // Calculate slippage limits
      const minAmountOut = calculateMinimumFromSlippage({ amount: ammBuyAmount, maxSlippage: swapData.maxSlippage });

      console.log('[useSwapMutation] Slippage calculations:');
      console.log('[useSwapMutation]   maxSlippage:', swapData.maxSlippage);
      console.log('[useSwapMutation]   minAmountOut:', minAmountOut);

      // Get deadline block height (regtest uses large offset so deadline never expires)
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
      const deadlineBlocks = isRegtest ? 1000 : (swapData.deadlineBlocks || 3);
      console.log('[useSwapMutation] Fetching deadline block height...');
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[useSwapMutation] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      console.log('[useSwapMutation] Factory ID:', ALKANE_FACTORY_ID);
      console.log('[useSwapMutation] Using factory opcode 13 (SwapExactTokensForTokens):');
      console.log('[useSwapMutation]   p0: SDK auto-edict (from inputRequirements) → sends sell tokens to p1');
      console.log('[useSwapMutation]   p1: Factory cellpack (our protostone)');

      // Build protostone for the swap using factory-routed two-protostone pattern
      const protostoneParams = {
        factoryId: ALKANE_FACTORY_ID,
        sellTokenId: sellCurrency,
        buyTokenId: buyCurrency,
        sellAmount: new BigNumber(ammSellAmount).toFixed(0),
        minOutput: new BigNumber(minAmountOut).toFixed(0),
        deadline: deadline.toString(),
      };

      console.log('[useSwapMutation] Protostone params:', JSON.stringify(protostoneParams, null, 2));

      const protostone = buildSwapProtostone(protostoneParams);
      console.log('[useSwapMutation] Built protostone (factory-routed):', protostone);

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

      const inputRequirements = buildSwapInputRequirements(inputReqParams);
      console.log('[useSwapMutation] Built inputRequirements:', inputRequirements);

      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] ████ EXECUTING SWAP ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[useSwapMutation] alkanesExecuteTyped params:');
      console.log('[useSwapMutation]   inputRequirements:', inputRequirements);
      console.log('[useSwapMutation]   protostone:', protostone);
      console.log('[useSwapMutation]   feeRate:', swapData.feeRate);
      console.log('═══════════════════════════════════════════════════════════════');

      const btcNetwork = getBitcoinNetwork(network);

      const isBrowserWallet = walletType === 'browser';

      // For browser wallets, use actual addresses for UTXO discovery.
      // For keystore wallets, symbolic addresses resolve correctly via loaded mnemonic.
      const fromAddresses = isBrowserWallet
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      try {
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: swapData.feeRate,
          autoConfirm: false,
          fromAddresses,
          toAddresses: isBrowserWallet ? [taprootAddress] : ['p2tr:0'],
          changeAddress: isBrowserWallet ? (segwitAddress || 'p2wpkh:0') : 'p2wpkh:0',
          alkanesChangeAddress: isBrowserWallet ? taprootAddress : 'p2tr:0',
          ordinalsStrategy: 'burn',
        });

        console.log('[useSwapMutation] Called alkanesExecuteTyped (browser:', isBrowserWallet, ')');

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
          let psbtBase64 = extractPsbtBase64(readyToSign.psbt);
          console.log('[useSwapMutation] PSBT base64 length:', psbtBase64.length);

          // Helper to classify script type from raw bytes
          const classifyScript = (script: Uint8Array | Buffer): string => {
            const s = Buffer.from(script);
            if (s.length === 34 && s[0] === 0x51 && s[1] === 0x20) return 'P2TR';
            if (s.length === 22 && s[0] === 0x00 && s[1] === 0x14) return 'P2WPKH';
            if (s.length === 23 && s[0] === 0xa9 && s[1] === 0x14 && s[22] === 0x87) return 'P2SH';
            if (s.length === 34 && s[0] === 0x00 && s[1] === 0x20) return 'P2WSH';
            return `UNKNOWN(len=${s.length},op=${s[0]?.toString(16)})`;
          };

          const logSwapInputDetails = (psbt: bitcoin.Psbt, label: string) => {
            console.log(`[SWAP-DIAG] === ${label} — ${psbt.data.inputs.length} inputs, ${psbt.txOutputs.length} outputs ===`);
            psbt.data.inputs.forEach((input, idx) => {
              const ws = input.witnessUtxo?.script;
              const scriptHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
              const scriptType = ws ? classifyScript(ws) : 'NO_WITNESS_UTXO';
              console.log(`  Input ${idx}: type=${scriptType} script=${scriptHex} nonWitnessUtxo=${!!input.nonWitnessUtxo} redeemScript=${!!input.redeemScript} tapInternalKey=${input.tapInternalKey ? Buffer.from(input.tapInternalKey).toString('hex') : 'NONE'}`);
            });
            psbt.txOutputs.forEach((out, idx) => {
              try {
                const addr = bitcoin.address.fromOutputScript(out.script, btcNetwork);
                console.log(`  Output ${idx}: ${out.value} sats -> ${addr}`);
              } catch {
                console.log(`  Output ${idx}: ${out.value} sats -> [OP_RETURN or non-standard]`);
              }
            });
          };

          // DIAGNOSTIC: Log PSBT state before patching
          {
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            logSwapInputDetails(tempPsbt, 'BEFORE PATCHING');
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
              console.log('[useSwapMutation] Patched', result.inputsPatched, 'P2SH inputs with redeemScript');
            }
            console.log('[useSwapMutation] Patched PSBT outputs for browser wallet');
          }

          // DIAGNOSTIC: Log PSBT state after patching
          {
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            logSwapInputDetails(tempPsbt, 'AFTER PATCHING');
          }

          // For keystore wallets, request user confirmation before signing
          // Browser wallets handle confirmation via their own popup
          if (walletType === 'keystore' && !swapData.skipConfirmation) {
            console.log('[useSwapMutation] Keystore wallet - requesting user confirmation...');
            const approved = await requestConfirmation({
              type: 'swap',
              title: 'Confirm Swap',
              fromAmount: (parseFloat(swapData.sellAmount) / 1e8).toString(),
              fromSymbol: getTokenSymbol(swapData.sellCurrency, swapData.sellSymbol),
              fromId: swapData.sellCurrency === 'btc' ? undefined : swapData.sellCurrency,
              toAmount: (parseFloat(swapData.buyAmount) / 1e8).toString(),
              toSymbol: getTokenSymbol(swapData.buyCurrency, swapData.buySymbol),
              toId: swapData.buyCurrency === 'btc' ? undefined : swapData.buyCurrency,
              feeRate: swapData.feeRate,
            });

            if (!approved) {
              console.log('[useSwapMutation] User rejected transaction');
              throw new Error('Transaction rejected by user');
            }
            console.log('[useSwapMutation] User approved transaction');
          }

          // Sign PSBT — browser wallets sign all input types in a single call,
          // so we must NOT call signPsbt twice (causes "inputType: sh without redeemScript").
          let signedPsbtBase64: string;
          if (isBrowserWallet) {
            console.log('[useSwapMutation] Browser wallet: signing PSBT once (all input types)...');
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            console.log('[useSwapMutation] Keystore: signing PSBT with SegWit, then Taproot...');
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }
          console.log('[useSwapMutation] PSBT signed');

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

          // DIAGNOSTIC: Log per-input state after signing
          console.log(`[SWAP-DIAG] === AFTER SIGNING — ${signedPsbt.data.inputs.length} inputs ===`);
          signedPsbt.data.inputs.forEach((inp, idx) => {
            const ws = inp.witnessUtxo?.script;
            const scriptType = ws ? classifyScript(ws) : 'NO_WITNESS_UTXO';
            const scriptHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
            console.log(`  Input ${idx}: type=${scriptType} script=${scriptHex}`, {
              tapKeySig: inp.tapKeySig ? `${Buffer.from(inp.tapKeySig).length}B` : undefined,
              partialSig: inp.partialSig?.length || undefined,
              finalScriptWitness: inp.finalScriptWitness ? `${Buffer.from(inp.finalScriptWitness).length}B` : undefined,
              finalScriptSig: inp.finalScriptSig ? `${Buffer.from(inp.finalScriptSig).length}B` : undefined,
              redeemScript: inp.redeemScript ? `${Buffer.from(inp.redeemScript).length}B` : undefined,
              tapInternalKey: inp.tapInternalKey ? Buffer.from(inp.tapInternalKey).toString('hex') : undefined,
            });
          });

          // Check if already finalized by the wallet
          const alreadyFinalized = signedPsbt.data.inputs.every(input =>
            input.finalScriptWitness || input.finalScriptSig
          );

          // Finalize all inputs
          if (alreadyFinalized) {
            console.log('[useSwapMutation] PSBT already finalized by wallet, skipping finalization');
          } else {
            console.log('[useSwapMutation] Finalizing PSBT...');
            try {
              signedPsbt.finalizeAllInputs();
            } catch (e: any) {
              console.error('[useSwapMutation] Finalization error:', e.message);
              // Dump per-input state for debugging
              console.error('[SWAP-DIAG] === FINALIZATION FAILURE DUMP ===');
              signedPsbt.data.inputs.forEach((inp, idx) => {
                const ws = inp.witnessUtxo?.script;
                const sType = ws ? classifyScript(ws) : 'NO_WITNESS_UTXO';
                const sHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
                console.error(`  Input ${idx}: type=${sType} script=${sHex} redeemScript=${inp.redeemScript ? Buffer.from(inp.redeemScript).toString('hex') : 'NONE'} tapKeySig=${!!inp.tapKeySig} partialSig=${inp.partialSig?.length || 0} finalScriptWitness=${!!inp.finalScriptWitness}`);
              });
              throw e;
            }
          }

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
    onSuccess: (data) => {
      console.log('[useSwapMutation] Swap successful, txid:', data.transactionId);
      console.log('[useSwapMutation] Invalidating balance queries...');

      // Invalidate all balance-related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balance'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['alkanesTokenPairs'] });
      // Invalidate activity feed so it shows the new swap transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[useSwapMutation] Balance queries invalidated - UI should refresh when indexer processes block');
    },
  });
}
