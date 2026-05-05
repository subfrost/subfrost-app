/**
 * useRemoveLiquidityMutation.ts
 *
 * This hook handles removing liquidity from AMM pools by burning LP tokens.
 *
 * ============================================================================
 * ⚠️⚠️⚠️ CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01) ⚠️⚠️⚠️
 * ============================================================================
 *
 * When using browser wallets (Xverse, OYL, etc.), you MUST pass ACTUAL addresses
 * to toAddresses/changeAddress/alkanesChangeAddress — NOT symbolic addresses like
 * 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet!
 *
 * See useSwapMutation.ts header comment for full documentation of this bug,
 * including the transaction that lost user tokens:
 * TX: 985436b5c5c850bd121cd4862f32413f467145b121d34c006417724d71588db9
 *
 * REQUIRED PATTERN (2026-04-30: now consolidated into `txContext`):
 * ```typescript
 * const { txContext } = useWallet();
 * if (!txContext) throw new Error('Wallet not connected');
 * await provider.alkanesExecuteTyped({
 *   txContext,                    // wrapper unpacks fee/change/protectTaproot/etc.
 * });
 * ```
 * ============================================================================
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## Implementation
 *
 * Uses **factory router opcode 12 (Burn)** — same Uniswap-style pattern as
 * factory.AddLiquidity. Single-protostone cellpack:
 *   [factory_block, factory_tx, 12, ta_block, ta_tx, tb_block, tb_tx,
 *    liquidity, amount_a_min, amount_b_min, deadline]
 *
 * LP tokens auto-allocate to the protostone. The factory finds the matching
 * pool by `(token_a, token_b)`, burns the supplied LP, and enforces slippage
 * via `amount_*_min` plus the deadline. No manual edicts.
 *
 * Source: fujin-factory/src/lib.rs:75 (#[opcode(12)] Burn).
 *
 * @see useSwapMutation.ts — factory opcode 13 (single-protostone swap)
 * @see useAddLiquidityMutation.ts — factory opcode 11 (single-protostone add)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useWalletUtxoCache, useSyncStatus } from '@/hooks/useWalletUtxoCache';
import { getTokenSymbol } from '@/lib/alkanes-client';
import { getFutureBlockHeight } from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
// NOTE: Only patching INPUTS (witnessUtxo + redeemScript), NOT outputs
// Output patching was removed - see useSwapMutation.ts for why
import { patchInputsOnly } from '@/lib/psbt-patching';
import { buildFactoryBurnProtostone, buildRemoveLiquidityInputRequirements } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, toAlks, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import { buildPlanFromTx } from '@/lib/alkanes/planBuilder';
import { getConfig } from '@/utils/getConfig';

bitcoin.initEccLib(ecc);

export type RemoveLiquidityTransactionData = {
  lpTokenId: string;       // LP token alkane id (e.g., "3:123")
  lpAmount: string;        // amount of LP tokens to burn (display units)
  lpDecimals?: number;     // LP token decimals (default 8)
  minAmount0?: string;     // minimum token0 to receive (display units, optional)
  minAmount1?: string;     // minimum token1 to receive (display units, optional)
  minToken0Amount?: string; // alias for minAmount0 (for confirmation modal)
  minToken1Amount?: string; // alias for minAmount1 (for confirmation modal)
  token0Id?: string;       // token0 alkane id (for confirmation display)
  token1Id?: string;       // token1 alkane id (for confirmation display)
  token0Symbol?: string;   // for confirmation display
  token1Symbol?: string;   // for confirmation display
  token0Decimals?: number; // token0 decimals (default 8)
  token1Decimals?: number; // token1 decimals (default 8)
  poolName?: string;       // pool name for display (e.g., "DIESEL / frBTC")
  feeRate: number;         // sats/vB
  deadlineBlocks?: number; // blocks until deadline (default 5)
};

export function useRemoveLiquidityMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, browserWallet, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  // Pre-warmed UTXO snapshot — feeds clean BTC payment_utxos to the
  // SDK so it skips the WASM's internal coinselect fanout. Same
  // perf-fix pattern as useSwapMutation / useAlkaneSendMutation.
  const utxoCache = useWalletUtxoCache();
  const syncStatus = useSyncStatus();

  return useMutation({
    mutationFn: async (data: RemoveLiquidityTransactionData) => {
      console.log('[RemoveLiquidity] ═══════════════════════════════════════════');
      console.log('[RemoveLiquidity] Starting remove liquidity transaction');
      console.log('[RemoveLiquidity] Input data:', JSON.stringify(data, null, 2));

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
      // Sync gate (skipped on local networks).
      const isLocal = ['devnet', 'regtest-local', 'qubitcoin-regtest'].includes(network ?? '');
      if (!isLocal && syncStatus.metashrewHeight > 0 && !syncStatus.inSync) {
        throw new Error(
          `Indexer catching up (${syncStatus.lag} block${syncStatus.lag === 1 ? '' : 's'} behind). Try again in a moment.`,
        );
      }
      // Ensure browser wallet session is active before building PSBT
      if (walletType === 'browser') {
        const { ensureWalletSession } = await import('@/lib/wallet/browserWalletSigning');
        await ensureWalletSession();
      }
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // Get addresses — use the consolidated `txContext` for fee/change addresses.
      // See `WalletContext.TxContext` jsdoc for the wallet-type semantics this codifies.
      if (!txContext) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      // For alkane operations, prefer taproot if available (alkanes use P2TR).
      // Falls back to segwit on single-address segwit-only wallets.
      const primaryAddress = (taprootAddress || segwitAddress)!;
      console.log('[RemoveLiquidity] Using addresses:', { taprootAddress, segwitAddress, primaryAddress });

      // Convert display amounts to alks
      const lpAmountAlks = toAlks(data.lpAmount, data.lpDecimals ?? 8);
      const minAmount0Alks = data.minAmount0 ? toAlks(data.minAmount0, data.token0Decimals ?? 8) : '0';
      const minAmount1Alks = data.minAmount1 ? toAlks(data.minAmount1, data.token1Decimals ?? 8) : '0';

      console.log('[RemoveLiquidity] Amounts in alks:', { lpAmountAlks, minAmount0Alks, minAmount1Alks });

      // Get block height for deadline (regtest uses large offset so deadline never expires)
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local' || network === 'qubitcoin-regtest';
      const deadline = await getFutureBlockHeight(
        isRegtest ? 1000 : (data.deadlineBlocks || 5),
        provider as any
      );

      console.log('[RemoveLiquidity] Deadline block:', deadline);

      // Build protostone — factory router opcode 12 (Burn).
      // Single protostone: cellpack identifies the pool by token_a/token_b;
      // LP tokens auto-allocate as incomingAlkanes. Slippage enforced via
      // amount_a_min / amount_b_min, deadline enforced on-chain.
      if (!data.token0Id || !data.token1Id) {
        throw new Error('token0Id and token1Id are required for factory.Burn (opcode 12)');
      }
      const config = getConfig(network);
      const protostone = buildFactoryBurnProtostone({
        factoryId: config.ALKANE_FACTORY_ID,
        tokenA: data.token0Id,
        tokenB: data.token1Id,
        liquidity: lpAmountAlks,
        amountAMin: minAmount0Alks,
        amountBMin: minAmount1Alks,
        deadline: deadline.toString(),
      });

      console.log('[RemoveLiquidity] Protostone (factory opcode 12):', protostone);

      // Build input requirements
      const inputRequirements = buildRemoveLiquidityInputRequirements({
        lpTokenId: data.lpTokenId,
        lpAmount: lpAmountAlks,
      });

      console.log('[RemoveLiquidity] Input requirements:', inputRequirements);

      console.log('[RemoveLiquidity] ═══════════════════════════════════════════');
      console.log('[RemoveLiquidity] Executing...');
      console.log('[RemoveLiquidity] inputRequirements:', inputRequirements);
      console.log('[RemoveLiquidity] protostone:', protostone);
      console.log('[RemoveLiquidity] feeRate:', data.feeRate);

      const btcNetwork = getBitcoinNetwork(network);

      const isBrowserWallet = walletType === 'browser';

      // Symbolic addresses (`p2tr:0`, `p2wpkh:0`) used to resolve to the SDK's
      // dummy wallet — see useSwapMutation.ts header for the 2026-03-01 token-loss
      // tx that motivated `txContext`. Always actual addresses now.
      const toAddresses = [primaryAddress];

      console.log('[RemoveLiquidity] From addresses:', txContext.feeSourceAddresses, '(browser:', isBrowserWallet, ')');
      console.log('[RemoveLiquidity] To addresses:', toAddresses);
      console.log('[RemoveLiquidity] Change address:', txContext.btcChangeAddress);

      try {

        const result = await provider.alkanesExecuteTyped({
          txContext,
          inputRequirements,
          protostones: protostone,
          feeRate: data.feeRate,
          autoConfirm: false,
          toAddresses,
          // Pre-warmed clean BTC UTXOs from the prefetched cache —
          // skips the SDK's internal coinselect fanout.
          cachedUtxos: utxoCache.utxos,
        });

        console.log('[RemoveLiquidity] Called alkanesExecuteTyped (browser:', isBrowserWallet, ')');

        console.log('[RemoveLiquidity] Execute result:', JSON.stringify(result, null, 2));

        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[RemoveLiquidity] Transaction auto-completed, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[RemoveLiquidity] Got readyToSign, signing PSBT...');
          const readyToSign = result.readyToSign;

          // Convert PSBT to base64
          let psbtBase64: string = extractPsbtBase64(readyToSign.psbt);

          // ============================================================================
          // ⚠️ CRITICAL: PSBT PATCHING REMOVED - DO NOT RE-ADD ⚠️
          // ============================================================================
          // Date Removed: 2026-03-01 (same as useSwapMutation.ts fix)
          // See useSwapMutation.ts:444-483 for full documentation.
          //
          // alkanes-rs SDK creates PSBTs with correct real addresses for browser wallets.
          // patchPsbtForBrowserWallet was CORRUPTING these addresses.
          // ============================================================================

          console.log('[RemoveLiquidity] Using PSBT from SDK (addresses already correct, no patching needed)');

          // ============================================================================
          // Input patching for ALL browser wallet types
          // ============================================================================
          // Different wallets have different requirements:
          // - Xverse: P2SH-P2WPKH (starts with '3'/'2'). Needs redeemScript injection.
          // - UniSat/OKX: Single-address P2TR or P2WPKH. Need witnessUtxo.script patching.
          // - OYL/Leather/Phantom: Native P2WPKH (bc1q). Need witnessUtxo.script patching.
          //
          // patchInputsOnly handles ALL these cases. It does NOT touch outputs (the SDK
          // already creates correct output addresses when we pass actual addresses).
          // ============================================================================
          let finalPsbtBase64 = psbtBase64;
          if (isBrowserWallet) {
            const result = patchInputsOnly({
              psbtBase64,
              network: btcNetwork,
              taprootAddress: taprootAddress!,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            });
            finalPsbtBase64 = result.psbtBase64;
            if (result.inputsPatched > 0) {
              console.log(`[RemoveLiquidity] Patched ${result.inputsPatched} input(s) for browser wallet compatibility`);
            }
          }

          // For keystore wallets, request user confirmation before signing
          if (walletType === 'keystore') {
            const token0Sym = getTokenSymbol(data.token0Id, data.token0Symbol);
            const token1Sym = getTokenSymbol(data.token1Id, data.token1Symbol);
            const ourAddresses = [
              account?.taproot?.address,
              account?.nativeSegwit?.address,
            ].filter((a): a is string => !!a);
            const plan = buildPlanFromTx({
              psbtBase64: finalPsbtBase64,
              cache: utxoCache,
              ourAddresses,
              network: btcNetwork,
              feeRateSatVb: data.feeRate,
              label: `Remove Liquidity ${token0Sym} / ${token1Sym}`,
              summary:
                `Burns ${data.lpAmount} LP for at least ${data.minAmount0 || data.minToken0Amount || '0'} ${token0Sym} ` +
                `and ${data.minAmount1 || data.minToken1Amount || '0'} ${token1Sym}.`,
            });
            // Predicted token0 + token1 receive lands on the cellpack-bound
            // output paying us. Mark uncertain — actual amount depends on
            // current pool reserves at inclusion time.
            const targetIdx = plan.outputs.findIndex(
              (o) => o.isOurs && !o.isOpReturn,
            );
            if (targetIdx >= 0) {
              const t0Min = data.minAmount0 || data.minToken0Amount;
              const t1Min = data.minAmount1 || data.minToken1Amount;
              const additions = [];
              if (t0Min) {
                additions.push({
                  alkaneId: data.token0Id,
                  symbol: token0Sym,
                  amount: BigInt(Math.floor(parseFloat(t0Min) * 1e8)),
                  uncertain: true,
                });
              }
              if (t1Min) {
                additions.push({
                  alkaneId: data.token1Id,
                  symbol: token1Sym,
                  amount: BigInt(Math.floor(parseFloat(t1Min) * 1e8)),
                  uncertain: true,
                });
              }
              if (additions.length) {
                plan.outputs[targetIdx].alkanes = [
                  ...(plan.outputs[targetIdx].alkanes ?? []),
                  ...additions,
                ];
              }
            }

            const approved = await requestConfirmation({
              type: 'removeLiquidity',
              title: 'Confirm Remove Liquidity',
              lpAmount: data.lpAmount,
              poolName: data.poolName || `${token0Sym} / ${token1Sym}`,
              token0Amount: data.minAmount0 || data.minToken0Amount,
              token0Symbol: token0Sym,
              token0Id: data.token0Id,
              token1Amount: data.minAmount1 || data.minToken1Amount,
              token1Symbol: token1Sym,
              token1Id: data.token1Id,
              feeRate: data.feeRate,
              plan: [plan],
            });

            if (!approved) {
              throw new Error('Transaction rejected by user');
            }
          }

          // Single signing call for both wallet types:
          //   - Browser: signTaprootPsbt routes through the SDK wallet adapter
          //     which signs every input (taproot + segwit) in one popup. A
          //     second call to signSegwitPsbt would re-sign and corrupt the
          //     PSBT ("inputType: sh without redeemScript").
          //   - Keystore: taproot-only after our refactor — segwit derivation
          //     is disabled, signSegwitPsbt throws, and all PSBT inputs are
          //     already taproot. Direct taproot sign is sufficient.
          console.log('[RemoveLiquidity] Signing PSBT with taproot key…');
          const signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[RemoveLiquidity] Transaction built:', txid);

          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[RemoveLiquidity] Broadcast successful:', broadcastTxid);

          return {
            success: true,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[RemoveLiquidity] Complete, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[RemoveLiquidity] Transaction ID:', txId);
        return { success: true, transactionId: txId };

      } catch (error) {
        console.error('[RemoveLiquidity] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[RemoveLiquidity] Success! txid:', data.transactionId);

      // Invalidate balance queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['pool-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lp-positions'] });
      // Invalidate activity feed so it shows the new liquidity transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
    },
  });
}
