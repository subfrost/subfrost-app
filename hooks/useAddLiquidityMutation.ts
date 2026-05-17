/**
 * useAddLiquidityMutation.ts
 *
 * This hook handles adding liquidity to AMM pools.
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
 *   // ... toAddresses passed separately (operation-specific)
 * });
 * ```
 * ============================================================================
 *
 * ## Architecture (2026-01-28)
 *
 * This hook routes ALL add-liquidity calls through the **factory router** for
 * Uniswap-style slippage protection (`amount_a_min` / `amount_b_min`) and
 * deadline enforcement. Pool-direct calls (opcode 1) are no longer used — they
 * have no min checks and expose users to MEV / reserve drift.
 *
 * Flow:
 *   1. Check if pool exists via factory opcode 2 (FindPoolId)
 *   2. If pool EXISTS: factory.AddLiquidity (opcode 11) — single protostone
 *   3. If NO pool exists: factory.CreateNewPool (opcode 1)
 *
 * ## Single-Protostone Pattern
 *
 * Both branches use a single cellpack protostone. Input alkanes auto-allocate
 * to the protostone; the cellpack identifies them via `token_a` / `token_b`
 * params. No manual edicts needed — the factory finds matching tokens and
 * refunds excess via the refund pointer.
 *
 * @see useSwapMutation.ts — single-protostone factory.swap (opcode 13)
 * @see useRemoveLiquidityMutation.ts — single-protostone factory.Burn (opcode 12)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { getTokenSymbol } from '@/lib/alkanes-client';
import { FACTORY_OPCODES } from '@/constants';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
// NOTE: Only patching INPUTS (witnessUtxo + redeemScript), NOT outputs
// Output patching was removed - see useSwapMutation.ts for why
import { patchInputsOnly } from '@/lib/psbt-patching';
import { buildCreateNewPoolProtostone, buildFactoryAddLiquidityProtostones, buildAddLiquidityInputRequirements } from '@/lib/alkanes/builders';
import { useWalletUtxoCache } from '@/hooks/useWalletUtxoCache';
import { getBitcoinNetwork, toAlks, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import { buildPlanFromTx } from '@/lib/alkanes/planBuilder';
import { getFutureBlockHeight } from '@/utils/amm';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';

bitcoin.initEccLib(ecc);

export type AddLiquidityTransactionData = {
  token0Id: string;      // alkane id (e.g., "2:0" for DIESEL)
  token1Id: string;      // alkane id (e.g., "32:0" for frBTC)
  token0Amount: string;  // display amount (e.g., "1.5")
  token1Amount: string;  // display amount
  token0Decimals?: number; // default 8
  token1Decimals?: number; // default 8
  token0Symbol?: string;   // for confirmation display
  token1Symbol?: string;   // for confirmation display
  maxSlippage?: string;  // percent string, e.g. '0.5' — applied to amount_a_min / amount_b_min in factory opcode 11
  feeRate: number;       // sats/vB
  deadlineBlocks?: number; // default 5
  poolId?: { block: string | number; tx: string | number }; // Pool to add liquidity to
  // Override hooks for atomic flows (e.g. wrap+addLiquidity in a single tx).
  // When set, these bypass the normal protostone/inputRequirements/toAddresses
  // construction and pass the caller-provided values directly to the SDK.
  overrideProtostones?: string;
  overrideInputRequirements?: string;
  overrideToAddresses?: string[];
  /** When true, route through SDK's split-tx CPFP chain (Tx A wrap + Tx B addLiquidity). */
  splitTransactions?: boolean;
};

/**
 * Check if a pool exists for the given token pair via factory opcode 2 (FindPoolId).
 * Uses SDK's alkanesSimulate to call the factory without a real transaction.
 * Returns the pool AlkaneId if found, or null if not.
 */
export async function findPoolId(
  provider: any,
  factoryId: string,
  token0Id: string,
  token1Id: string,
): Promise<{ block: number; tx: number } | null> {
  const [t0Block, t0Tx] = token0Id.split(':').map(Number);
  const [t1Block, t1Tx] = token1Id.split(':').map(Number);

  try {
    const context = JSON.stringify({
      alkanes: [],
      calldata: encodeSimulateCalldata(factoryId, [2, t0Block, t0Tx, t1Block, t1Tx]),
      height: 1000000,
      txindex: 0,
      pointer: 0,
      refund_pointer: 0,
      vout: 0,
      transaction: [],
      block: [],
    });

    const result = await provider.alkanesSimulate(factoryId, context, 'latest');

    // The SDK returns different formats depending on the network/provider:
    // - Structured: { status: 0, execution: { data: "0x...", error: null } }
    // - Raw hex string: "0x0a221a20..." (protobuf-encoded, contains AlkaneId at known offset)
    // Handle both.

    // Case 1: Structured response (non-devnet)
    if (result?.execution?.error) {
      console.log('[AddLiquidity] Pool does not exist:', result.execution.error);
      return null;
    }
    if (result?.status === 0 && result?.execution?.data) {
      const hexData = (result.execution.data as string).replace('0x', '');
      if (hexData.length >= 64) {
        const buf = Buffer.from(hexData, 'hex');
        const block = Number(buf.readBigUInt64LE(0));
        const tx = Number(buf.readBigUInt64LE(16));
        console.log('[AddLiquidity] Pool found (structured):', `${block}:${tx}`);
        return { block, tx };
      }
    }

    // Case 2: Raw hex/protobuf string (devnet SDK returns this)
    // Format: protobuf envelope wrapping the execution result.
    // The data field contains the AlkaneId (32 bytes).
    // Protobuf structure: field 1 (outer) → field 3 (data) → 32 bytes of AlkaneId.
    // Header is typically 0a XX 1a 20 where XX is outer length and 20 = 32 bytes.
    if (typeof result === 'string') {
      const hex = result.replace('0x', '');
      const buf = Buffer.from(hex, 'hex');
      // Find the 0x1a20 marker (field 3, 32 bytes) — the data field
      for (let i = 0; i + 34 <= buf.length; i++) {
        if (buf[i] === 0x1a && buf[i + 1] === 0x20) {
          const dataStart = i + 2;
          if (dataStart + 32 <= buf.length) {
            // Browser-safe LE u128 parse (readBigUInt64LE not available in browser Buffer polyfill)
            let block = 0;
            for (let b = 0; b < 8; b++) block += buf[dataStart + b] * (256 ** b);
            let tx = 0;
            for (let b = 0; b < 8; b++) tx += buf[dataStart + 16 + b] * (256 ** b);
            if (block > 0 && block < 100000 && tx >= 0 && tx < 100000) {
              console.log('[AddLiquidity] Pool found (protobuf):', `${block}:${tx}`);
              return { block, tx };
            }
          }
        }
      }
      console.log('[AddLiquidity] Could not find pool ID in protobuf response');
    }

    return null;
  } catch (error) {
    console.warn('[AddLiquidity] Pool existence check failed:', error);
    return null;
  }
}

export function useAddLiquidityMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, browserWallet, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  // Pre-warmed UTXO cache: read from this instead of fetching at click
  // time. Eliminates the multi-second pause between Confirm and the
  // wallet popup for wallets with many dust UTXOs.
  const utxoCache = useWalletUtxoCache();
  const config = getConfig(network);
  const ALKANE_FACTORY_ID = config.ALKANE_FACTORY_ID;
  const defaultPoolId = 'DEFAULT_POOL_ID' in config ? (config as any).DEFAULT_POOL_ID as string : undefined;

  return useMutation({
    mutationFn: async (data: AddLiquidityTransactionData) => {
      console.log('[AddLiquidity] ═══════════════════════════════════════════');
      console.log('[AddLiquidity] Starting add liquidity transaction');
      console.log('[AddLiquidity] Input data:', JSON.stringify(data, null, 2));

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
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
      console.log('[AddLiquidity] Using addresses:', { taprootAddress, segwitAddress, primaryAddress });

      // Convert display amounts to alks
      const amount0Alks = toAlks(data.token0Amount, data.token0Decimals ?? 8);
      const amount1Alks = toAlks(data.token1Amount, data.token1Decimals ?? 8);

      console.log('[AddLiquidity] Amounts in alks:', { amount0Alks, amount1Alks });

      // Determine pool ID: use provided poolId, discover via factory, or use default
      let resolvedPoolId = data.poolId || null;

      if (!resolvedPoolId) {
        console.log('[AddLiquidity] No poolId provided, checking factory for existing pool...');
        resolvedPoolId = await findPoolId(
          provider,
          ALKANE_FACTORY_ID,
          data.token0Id,
          data.token1Id,
        );
      }

      // Fallback: use config DEFAULT_POOL_ID if factory discovery failed
      // This handles pools created outside the factory (e.g., via direct beacon proxy instantiation)
      if (!resolvedPoolId && defaultPoolId) {
        const [block, tx] = defaultPoolId.split(':').map(Number);
        console.log('[AddLiquidity] Factory returned no pool, using default pool:', defaultPoolId);
        resolvedPoolId = { block, tx };
      }

      let protostone: string;

      if (resolvedPoolId) {
        // Pool exists: call factory.AddLiquidity (opcode 11) with full Uniswap-style
        // params for slippage protection. Pool opcode 1 has no min checks, so the
        // user could lose value to MEV / reserve drift between quote and confirm.
        const slippagePercent = data.maxSlippage ? parseFloat(data.maxSlippage) : 0.5;
        const slippageFactor = (10000 - Math.floor(slippagePercent * 100)) / 10000;
        const amount0Min = BigInt(Math.floor(Number(amount0Alks) * slippageFactor)).toString();
        const amount1Min = BigInt(Math.floor(Number(amount1Alks) * slippageFactor)).toString();

        // Block height — query the WASM provider directly (same pattern as
        // useRemoveLiquidityMutation / useSwapMutation). Reading from
        // localStorage was unreliable: stale "NaN" from a previous broken
        // session would propagate into the cellpack and the SDK's
        // cellpack-number parser fell back to its edict parser, surfacing as
        // "Invalid edict format. Expected 'block:tx:amount:target' …".
        const deadline = (await getFutureBlockHeight(data.deadlineBlocks || 5, provider as any)).toString();

        protostone = buildFactoryAddLiquidityProtostones({
          factoryId: ALKANE_FACTORY_ID,
          tokenA: data.token0Id,
          tokenB: data.token1Id,
          amountADesired: amount0Alks,
          amountBDesired: amount1Alks,
          amountAMin: amount0Min,
          amountBMin: amount1Min,
          deadline,
        });
        console.log('[AddLiquidity] Pool found at', `${resolvedPoolId.block}:${resolvedPoolId.tx}`, '- using factory opcode 11 with slippage', slippagePercent, '%');
      } else {
        // Pool doesn't exist: use factory opcode 1 (CreateNewPool)
        protostone = buildCreateNewPoolProtostone({
          factoryId: ALKANE_FACTORY_ID,
          token0Id: data.token0Id,
          token1Id: data.token1Id,
          amount0: amount0Alks,
          amount1: amount1Alks,
        });
        console.log('[AddLiquidity] Pool does NOT exist, using factory opcode 1 (CreateNewPool)');
      }

      console.log('[AddLiquidity] Protostone:', protostone);

      // Build input requirements
      const inputRequirements = buildAddLiquidityInputRequirements({
        token0Id: data.token0Id,
        token1Id: data.token1Id,
        amount0: amount0Alks,
        amount1: amount1Alks,
      });

      console.log('[AddLiquidity] Input requirements:', inputRequirements);

      console.log('[AddLiquidity] ═══════════════════════════════════════════');
      console.log('[AddLiquidity] Executing...');
      console.log('[AddLiquidity] inputRequirements:', inputRequirements);
      console.log('[AddLiquidity] protostone:', protostone);
      console.log('[AddLiquidity] feeRate:', data.feeRate);

      const btcNetwork = getBitcoinNetwork(network);

      const isBrowserWallet = walletType === 'browser';

      // Symbolic addresses (`p2tr:0`, `p2wpkh:0`) used to resolve to the SDK's
      // dummy wallet — see useSwapMutation.ts header for the 2026-03-01 token-loss
      // tx that motivated `txContext`. Always actual addresses now.
      const toAddresses = [primaryAddress];
      console.log('[AddLiquidity] From addresses:', txContext.feeSourceAddresses, '(browser:', isBrowserWallet, ')');
      console.log('[AddLiquidity] To addresses:', toAddresses);
      console.log('[AddLiquidity] Change address:', txContext.btcChangeAddress);

      try {

        // Split-tx mode requires the SDK's `execute_full` path (which is the
        // only one that branches into `execute_split`). The PSBT-return path
        // (`autoConfirm: false`) is single-tx only and silently ignores the
        // splitTransactions flag — exactly the symptom that broke
        // useAtomicWrapAddLiquidityMutation on mainnet (combined wrap +
        // addLiquidity fuel cost > MINIMUM_FUEL_CHANGE1, OOG without split).
        //
        // When the caller asked for split-tx, switch to autoConfirm=true so
        // the SDK signs + broadcasts both Tx A and Tx B internally. Manual
        // alkane UTXO injection / input patching below is skipped in that
        // branch — for atomic wrap+addLiquidity the alkanes come from the
        // wrap protostone so injection isn't needed anyway.
        // Browser wallets must still receive unsigned PSBTs for their wallet
        // prompts; only keystore wallets can safely auto-confirm in-process.
        const wantsSplit = data.splitTransactions === true;
        const useAutoConfirm = walletType === 'keystore';
        const result = await provider.alkanesExecuteTyped({
          txContext,
          // Atomic wrap+addLiquidity passes overrides (custom protostones, BTC input, signer output)
          inputRequirements: data.overrideInputRequirements || inputRequirements,
          protostones: data.overrideProtostones || protostone,
          feeRate: data.feeRate,
          autoConfirm: useAutoConfirm,
          toAddresses: data.overrideToAddresses || toAddresses,
          network,
          // Opt-in: SDK splits wrap+addLiquidity into a CPFP chain so each
          // tx fits under the per-tx fuel floor. See useAtomicWrapAddLiquidityMutation.
          splitTransactions: wantsSplit,
          // Caller-supplied UTXO cache — feeds prefetched_utxos so the
          // SDK skips its `getrawtransaction` + `protorunesbyoutpoint`
          // fanouts. Mirrors swap / wrap / unwrap / send / removeLiquidity
          // for consistency; the cache is already mounted via
          // WalletStatePrewarmer at connect time.
          cachedUtxos: utxoCache.utxos,
          // Pin to metashrew height we already know — SDK skips its
          // waitForIndexer poll loop. Mirrors subfrost-mobile.
          maxIndexedHeight: utxoCache.height,
        });

        console.log('[AddLiquidity] Called alkanesExecuteTyped (browser:', isBrowserWallet, ')');

        console.log('[AddLiquidity] Execute result:', JSON.stringify(result, null, 2));

        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[AddLiquidity] Transaction auto-completed, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[AddLiquidity] Got readyToSign, signing PSBT...');
          const readyToSign = result.readyToSign;

          // Convert PSBT to base64.
          //
          // The SDK selects its own alkane-bearing inputs from `prefetched_utxos`
          // (the `(N with alkane assertion)` line in the log just before this
          // point). We used to follow up with a `discoverAlkaneUtxos` +
          // `injectAlkaneInputs` pass that bolted EVERY known alkane UTXO
          // onto the PSBT — a regtest-era workaround from 11e1e3ef (Jan 2026)
          // for the days when the SDK's protorunesbyaddress returned `0x`.
          // On mainnet that pass shipped the user's entire alkane wallet to
          // the signer: the OYL approval dialog showed 30 inputs (5 from the
          // SDK + 25 of ours) for a swap that needed 4. Removed 2026-05-11 —
          // trust the SDK's selection.
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

          console.log('[AddLiquidity] Using PSBT from SDK (addresses already correct, no patching needed)');

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
          if (isBrowserWallet) {
            const result = patchInputsOnly({
              psbtBase64,
              network: btcNetwork,
              taprootAddress: taprootAddress!,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            });
            psbtBase64 = result.psbtBase64;
            if (result.inputsPatched > 0) {
              console.log(`[AddLiquidity] Patched ${result.inputsPatched} input(s) for browser wallet compatibility`);
            }
          }

          // For keystore wallets, request user confirmation before signing.
          // `data.token0Amount` / `data.token1Amount` are already display
          // values (see param doc on AddLiquidityTransactionData) — do NOT
          // divide by 1e8. Same bug we fixed in useRemoveLiquidityMutation
          // a few commits back.
          if (walletType === 'keystore') {
            const ourAddresses = [
              account?.taproot?.address,
              account?.nativeSegwit?.address,
            ].filter((a): a is string => !!a);
            const t0Sym = getTokenSymbol(data.token0Id, data.token0Symbol);
            const t1Sym = getTokenSymbol(data.token1Id, data.token1Symbol);
            const plan = buildPlanFromTx({
              psbtBase64,
              cache: utxoCache,
              ourAddresses,
              network: btcNetwork,
              feeRateSatVb: data.feeRate,
              label: `Add Liquidity ${t0Sym} + ${t1Sym}`,
              summary:
                `Deposits ${data.token0Amount} ${t0Sym} and ${data.token1Amount} ${t1Sym} ` +
                `to mint LP tokens (slippage tolerance ${data.maxSlippage ?? '0.5'}%).`,
            });
            // Predicted LP receive lands on the first cellpack-bound
            // output paying us. We don't know the exact LP amount without
            // calling the contract — mark uncertain.
            const targetIdx = plan.outputs.findIndex(
              (o) => o.isOurs && !o.isOpReturn,
            );
            if (targetIdx >= 0 && data.poolId) {
              plan.outputs[targetIdx].alkanes = [
                ...(plan.outputs[targetIdx].alkanes ?? []),
                {
                  alkaneId: `${data.poolId.block}:${data.poolId.tx}`,
                  symbol: 'LP',
                  amount: BigInt(0),
                  uncertain: true,
                },
              ];
            }
            const approved = await requestConfirmation({
              type: 'addLiquidity',
              title: 'Confirm Add Liquidity',
              token0Amount: data.token0Amount,
              token0Symbol: t0Sym,
              token0Id: data.token0Id,
              token1Amount: data.token1Amount,
              token1Symbol: t1Sym,
              token1Id: data.token1Id,
              feeRate: data.feeRate,
              plan: [plan],
            });

            if (!approved) {
              throw new Error('Transaction rejected by user');
            }
          }

          // Single signing path. Browser wallets handle all input types in one
          // signPsbt call. Keystore is taproot-only (BIP86) and `signSegwitPsbt`
          // throws — so the same `signTaprootPsbt` is correct for both.
          console.log('[AddLiquidity] Signing PSBT…');
          const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[AddLiquidity] Transaction built:', txid);
          console.log('[AddLiquidity] Inputs:', tx.ins.length);
          console.log('[AddLiquidity] Outputs:');
          tx.outs.forEach((output, idx) => {
            const script = Buffer.from(output.script).toString('hex');
            if (script.startsWith('6a')) {
              console.log(`  [${idx}] OP_RETURN (protostone) ${script.length / 2} bytes`);
            } else {
              try {
                const addr = bitcoin.address.fromOutputScript(output.script, btcNetwork);
                console.log(`  [${idx}] ${output.value} sats -> ${addr}`);
              } catch {
                console.log(`  [${idx}] ${output.value} sats -> unknown script`);
              }
            }
          });

          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          if (typeof window !== 'undefined') {
            try {
              const { pendingTxStore } = await import('@/lib/alkanes/pendingTxStore');
              await pendingTxStore.add(txHex);
            } catch (error) {
              console.warn('[AddLiquidity] pendingTxStore.add failed:', error);
            }
          }
          console.log('[AddLiquidity] Broadcast successful:', broadcastTxid);

          return {
            success: true,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[AddLiquidity] Complete, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[AddLiquidity] Transaction ID:', txId);
        return { success: true, transactionId: txId };

      } catch (error) {
        console.error('[AddLiquidity] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[AddLiquidity] Success! txid:', data.transactionId);

      // Invalidate balance queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-utxo-cache'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance-fast'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['pool-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lp-positions'] });
      // Invalidate activity feed so it shows the new liquidity transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
    },
  });
}
