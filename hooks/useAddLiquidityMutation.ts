/**
 * useAddLiquidityMutation.ts
 *
 * This hook handles adding liquidity to AMM pools.
 *
 * ## Architecture (2026-01-28)
 *
 * This hook calls the POOL contract directly (not the factory) for adding liquidity,
 * matching the pattern used by useSwapMutation and useRemoveLiquidityMutation.
 *
 * Flow:
 *   1. Check if pool exists via factory opcode 2 (FindPoolId)
 *   2. If pool EXISTS: Call pool directly with opcode 1 (AddLiquidity)
 *   3. If NO pool exists: Use factory opcode 1 (CreateNewPool) to create the pool
 *
 * ## Two-Protostone Pattern
 *
 * Add liquidity requires TWO protostones (both edicts in p0):
 *   - p0: Two edicts transferring token0 AND token1 to p1
 *   - p1: Cellpack protostone calling pool with opcode 1 (AddLiquidity)
 *
 * Both edicts are in the same protostone (p0), targeting p1 (the cellpack).
 * This pattern was proven working in CreateNewPool tx a29d0307 (block 1470).
 * The pool receives both tokens as `incomingAlkanes`.
 * Without the edicts, the pool receives zero tokens and fails with "expected 2 alkane inputs".
 *
 * ## Why Call Pool Directly (Not Factory)
 *
 * The factory's AddLiquidity (opcode 11) and the pool's AddLiquidity (opcode 1) are
 * different entry points. The pool contract has the actual liquidity logic. Calling the
 * pool directly is the same pattern used by swap (opcode 3) and remove (opcode 2).
 *
 * @see useSwapMutation.ts - Same two-protostone pattern calling pool directly
 * @see useRemoveLiquidityMutation.ts - Same two-protostone pattern calling pool directly
 * @see constants/index.ts - FACTORY_OPCODES documentation
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
import { patchPsbtForBrowserWallet } from '@/lib/psbt-patching';
import { buildCreateNewPoolProtostone, buildAddLiquidityToPoolProtostone, buildAddLiquidityInputRequirements } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, toAlks, extractPsbtBase64, signAndBroadcastSplitPsbt } from '@/lib/alkanes/helpers';

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
  maxSlippage?: string;  // percent string, e.g. '0.5' (unused for now, minLP=0)
  feeRate: number;       // sats/vB
  deadlineBlocks?: number; // default 3
  poolId?: { block: string | number; tx: string | number }; // Pool to add liquidity to
};

/**
 * Check if a pool exists for the given token pair via factory opcode 2 (FindPoolId).
 * Uses SDK's alkanesSimulate to call the factory without a real transaction.
 * Returns the pool AlkaneId if found, or null if not.
 */
async function findPoolId(
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
      calldata: [2, t0Block, t0Tx, t1Block, t1Tx], // opcode 2 = FindPoolId
      height: 1000000,
      txindex: 0,
      pointer: 0,
      refund_pointer: 0,
      vout: 0,
      transaction: [],
      block: [],
    });

    const result = await provider.alkanesSimulate(factoryId, context, 'latest');

    // If there's an error containing "doesn't exist", pool doesn't exist
    if (result?.execution?.error) {
      console.log('[AddLiquidity] Pool does not exist:', result.execution.error);
      return null;
    }
    // status 0 = success, pool exists - parse pool ID from response data
    if (result?.status === 0 && result?.execution?.data) {
      const hexData = (result.execution.data as string).replace('0x', '');
      if (hexData.length >= 32) {
        // AlkaneId is 2 u128s (block, tx) in little-endian
        const blockHex = hexData.substring(0, 32);
        const txHex = hexData.substring(32, 64);
        const block = Number(BigInt('0x' + blockHex.match(/../g)!.reverse().join('')));
        const tx = Number(BigInt('0x' + txHex.match(/../g)!.reverse().join('')));
        console.log('[AddLiquidity] Pool found:', `${block}:${tx}`);
        return { block, tx };
      }
      console.log('[AddLiquidity] Pool exists (status 0) but could not parse ID');
      return null;
    }
    return null;
  } catch (error) {
    console.warn('[AddLiquidity] Pool existence check failed:', error);
    return null;
  }
}

/**
 * Discover alkane-bearing UTXOs at the given taproot address.
 *
 * Workaround: SDK UTXO selection doesn't find alkane UTXOs automatically.
 * Uses esplora_address::utxo to find dust UTXOs, then checks each via
 * alkanes_protorunesbyoutpoint (which works correctly).
 */
async function discoverAlkaneUtxos(
  taprootAddress: string,
  rpcUrl: string = '/api/rpc',
): Promise<{ txid: string; vout: number; value: number; alkanes: { block: number; tx: number; amount: number }[] }[]> {
  console.log('[AddLiquidity] Discovering alkane UTXOs at', taprootAddress);

  // 1. Fetch all UTXOs at the taproot address
  const utxoResp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'esplora_address::utxo',
      params: [taprootAddress],
      id: 1,
    }),
  });
  const utxoData = await utxoResp.json();
  const utxos = utxoData.result || [];

  // 2. Filter for dust UTXOs (<=1000 sats) - alkane tokens live on dust outputs
  const dustUtxos = utxos.filter((u: any) => u.value <= 1000);
  console.log(`[AddLiquidity] Found ${utxos.length} UTXOs, ${dustUtxos.length} dust UTXOs to check`);

  if (dustUtxos.length === 0) {
    console.log('[AddLiquidity] No dust UTXOs found - no alkane tokens available');
    return [];
  }

  // 3. Check each dust UTXO for alkane balances (in parallel)
  const checks = dustUtxos.map(async (utxo: any) => {
    try {
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_protorunesbyoutpoint',
          params: [utxo.txid, utxo.vout],
          id: 1,
        }),
      });
      const data = await resp.json();
      const balances = data?.result?.balance_sheet?.cached?.balances || [];
      if (balances.length > 0) {
        return {
          txid: utxo.txid as string,
          vout: utxo.vout as number,
          value: utxo.value as number,
          alkanes: balances.map((b: any) => ({ block: Number(b.block), tx: Number(b.tx), amount: Number(b.amount) })),
        };
      }
    } catch (e) {
      console.warn(`[AddLiquidity] Failed to check outpoint ${utxo.txid}:${utxo.vout}:`, e);
    }
    return null;
  });

  const results = await Promise.all(checks);
  const alkaneUtxos = results.filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`[AddLiquidity] Found ${alkaneUtxos.length} alkane-bearing UTXOs:`,
    alkaneUtxos.map(u => `${u.txid.slice(0, 8)}:${u.vout} -> ${u.alkanes.map((a: { block: number; tx: number; amount: number }) => `[${a.block}:${a.tx}]=${a.amount}`).join(', ')}`));

  return alkaneUtxos;
}

/**
 * Inject alkane-bearing UTXOs into a PSBT that's missing them.
 *
 * The SDK builds PSBTs without alkane UTXOs because its UTXO selection doesn't
 * find them automatically. This function adds the missing alkane inputs so the
 * protostone edicts can transfer tokens correctly.
 *
 * Returns the modified PSBT as base64.
 */
function injectAlkaneInputs(
  psbtBase64: string,
  alkaneUtxos: { txid: string; vout: number; value: number }[],
  taprootAddress: string,
  btcNetwork: bitcoin.Network,
  tapInternalKeyHex?: string,
): string {
  if (alkaneUtxos.length === 0) return psbtBase64;

  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });

  // Get existing input outpoints to avoid duplicates
  const existingInputs = new Set(
    psbt.txInputs.map(input => {
      const txid = Buffer.from(input.hash).reverse().toString('hex');
      return `${txid}:${input.index}`;
    })
  );

  const taprootScript = bitcoin.address.toOutputScript(taprootAddress, btcNetwork);
  const tapInternalKey = tapInternalKeyHex ? Buffer.from(tapInternalKeyHex, 'hex') : undefined;

  let injectedCount = 0;
  for (const utxo of alkaneUtxos) {
    const key = `${utxo.txid}:${utxo.vout}`;
    if (existingInputs.has(key)) {
      console.log(`[AddLiquidity] Alkane UTXO ${key} already in PSBT, skipping`);
      continue;
    }

    const inputData: Parameters<typeof psbt.addInput>[0] = {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: taprootScript,
        value: BigInt(utxo.value),
      },
    };

    if (tapInternalKey) {
      inputData.tapInternalKey = tapInternalKey;
    }

    psbt.addInput(inputData);
    injectedCount++;
    console.log(`[AddLiquidity] Injected alkane UTXO ${key} (${utxo.value} sats)`);
  }

  if (injectedCount > 0) {
    console.log(`[AddLiquidity] Injected ${injectedCount} alkane input(s) into PSBT`);
    console.log(`[AddLiquidity] PSBT now has ${psbt.txInputs.length} total inputs`);
  }

  return psbt.toBase64();
}

export function useAddLiquidityMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
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
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // Get addresses - use actual addresses instead of SDK descriptors
      // This fixes the "Available: []" issue where SDK couldn't find alkane UTXOs
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      console.log('[AddLiquidity] Using addresses:', { taprootAddress, segwitAddress });

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
        // Pool exists: call pool directly with opcode 1 (AddLiquidity)
        // Same pattern as useSwapMutation and useRemoveLiquidityMutation
        protostone = buildAddLiquidityToPoolProtostone({
          poolId: resolvedPoolId,
          token0Id: data.token0Id,
          token1Id: data.token1Id,
          amount0: amount0Alks,
          amount1: amount1Alks,
        });
        console.log('[AddLiquidity] Pool found at', `${resolvedPoolId.block}:${resolvedPoolId.tx}`, '- calling pool directly with opcode 1');
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

      // For browser wallets, use actual addresses for UTXO discovery.
      // For keystore wallets, symbolic addresses resolve correctly via loaded mnemonic.
      const fromAddresses = isBrowserWallet
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      try {
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: data.feeRate,
          autoConfirm: false,
          fromAddresses,
          toAddresses: ['p2tr:0'],
          changeAddress: 'p2wpkh:0',
          alkanesChangeAddress: 'p2tr:0',
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

          // Handle split PSBT if present (ordinals_strategy: 'preserve')
          if (readyToSign.split_psbt) {
            console.log('[AddLiquidity] Split PSBT detected — protecting inscriptions...');
            await signAndBroadcastSplitPsbt({
              splitPsbt: readyToSign.split_psbt,
              network: btcNetwork,
              isBrowserWallet,
              taprootAddress,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
              signTaprootPsbt,
              signSegwitPsbt,
              broadcastTransaction: (txHex: string) => provider.broadcastTransaction(txHex),
              patchPsbtForBrowserWallet,
            });
          }

          // Convert PSBT to base64
          let psbtBase64: string = extractPsbtBase64(readyToSign.psbt);

          // === Alkane UTXO Injection ===
          // The SDK's internal protorunesbyaddress is broken (returns 0x on regtest),
          // so the PSBT is built WITHOUT alkane-bearing inputs. We manually discover
          // alkane UTXOs and inject them into the PSBT before signing.
          console.log('[AddLiquidity] Discovering alkane UTXOs for injection...');
          const alkaneUtxos = await discoverAlkaneUtxos(taprootAddress, '/api/rpc');

          if (alkaneUtxos.length > 0) {
            const tapInternalKeyHex = account?.taproot?.pubKeyXOnly;
            psbtBase64 = injectAlkaneInputs(
              psbtBase64,
              alkaneUtxos,
              taprootAddress,
              btcNetwork,
              tapInternalKeyHex,
            );
          } else {
            console.warn('[AddLiquidity] No alkane UTXOs found - protostone edicts will have no tokens to transfer');
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
              console.log('[AddLiquidity] Patched', result.inputsPatched, 'P2SH inputs with redeemScript');
            }
            console.log('[AddLiquidity] Patched PSBT outputs for browser wallet');
          }

          // For keystore wallets, request user confirmation before signing
          if (walletType === 'keystore') {
            console.log('[AddLiquidity] Keystore wallet - requesting user confirmation...');
            const approved = await requestConfirmation({
              type: 'addLiquidity',
              title: 'Confirm Add Liquidity',
              token0Amount: (parseFloat(data.token0Amount) / 1e8).toString(),
              token0Symbol: getTokenSymbol(data.token0Id, data.token0Symbol),
              token0Id: data.token0Id,
              token1Amount: (parseFloat(data.token1Amount) / 1e8).toString(),
              token1Symbol: getTokenSymbol(data.token1Id, data.token1Symbol),
              token1Id: data.token1Id,
              feeRate: data.feeRate,
            });

            if (!approved) {
              console.log('[AddLiquidity] User rejected transaction');
              throw new Error('Transaction rejected by user');
            }
            console.log('[AddLiquidity] User approved transaction');
          }

          // Sign PSBT — browser wallets sign all input types in a single call,
          // so we must NOT call signPsbt twice (causes "inputType: sh without redeemScript").
          let signedPsbtBase64: string;
          if (isBrowserWallet) {
            console.log('[AddLiquidity] Browser wallet: signing PSBT once (all input types)...');
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            console.log('[AddLiquidity] Keystore: signing PSBT with SegWit, then Taproot...');
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }

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
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['pool-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lp-positions'] });
      // Invalidate activity feed so it shows the new liquidity transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
    },
  });
}
