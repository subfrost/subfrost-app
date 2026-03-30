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
 * REQUIRED PATTERN:
 * ```typescript
 * const toAddresses = useActualAddresses ? [taprootAddress] : ['p2tr:0'];
 * const changeAddr = useActualAddresses ? segwitAddress : 'p2wpkh:0';
 * const alkanesChangeAddr = useActualAddresses ? taprootAddress : 'p2tr:0';
 * ```
 * ============================================================================
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
// NOTE: Only patching INPUTS (witnessUtxo + redeemScript), NOT outputs
// Output patching was removed - see useSwapMutation.ts for why
import { patchInputsOnly } from '@/lib/psbt-patching';
import { buildCreateNewPoolProtostone, buildAddLiquidityToPoolProtostone, buildAddLiquidityInputRequirements } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, toAlks, extractPsbtBase64 } from '@/lib/alkanes/helpers';
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
      return null;
    }
    if (result?.status === 0 && result?.execution?.data) {
      const hexData = (result.execution.data as string).replace('0x', '');
      if (hexData.length >= 64) {
        const buf = Buffer.from(hexData, 'hex');
        const block = Number(buf.readBigUInt64LE(0));
        const tx = Number(buf.readBigUInt64LE(16));
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
            const block = Number(buf.readBigUInt64LE(dataStart));
            const tx = Number(buf.readBigUInt64LE(dataStart + 16));
            if (block > 0 && block < 100000 && tx >= 0 && tx < 100000) {
              return { block, tx };
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
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
  // JOURNAL (2026-03-26): On devnet, esplora_address::utxo returns non-array
  // result (string error or null) causing "utxos.filter is not a function".
  // This fix was accidentally reverted once during a bulk file revert — do not remove.
  const rawResult = utxoData?.result ?? utxoData;
  const utxos = Array.isArray(rawResult) ? rawResult : [];

  // 2. Filter for dust UTXOs (<=1000 sats) - alkane tokens live on dust outputs
  const dustUtxos = utxos.filter((u: any) => u.value <= 1000);

  if (dustUtxos.length === 0) {
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
    }
    return null;
  });

  const results = await Promise.all(checks);
  const alkaneUtxos = results.filter((r): r is NonNullable<typeof r> => r !== null);


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
  // Use pure Uint8Array — wallets reject Buffer with "Expected Uint8Array" error
  const tapInternalKey = tapInternalKeyHex ? new Uint8Array(Buffer.from(tapInternalKeyHex, 'hex')) : undefined;

  let injectedCount = 0;
  for (const utxo of alkaneUtxos) {
    const key = `${utxo.txid}:${utxo.vout}`;
    if (existingInputs.has(key)) {
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
  }

  if (injectedCount > 0) {
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

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // Get addresses - use actual addresses instead of SDK descriptors
      // This fixes the "Available: []" issue where SDK couldn't find alkane UTXOs
      //
      // JOURNAL ENTRY (2026-03-01): Support single-address wallets (UniSat, OKX)
      // UniSat/OKX only provide one address type at a time (user-configurable).
      // We need at least ONE address, but don't require both taproot AND segwit.
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      // For alkane operations, prefer taproot if available (alkanes use P2TR)
      const primaryAddress = taprootAddress || segwitAddress;

      // Convert display amounts to alks
      const amount0Alks = toAlks(data.token0Amount, data.token0Decimals ?? 8);
      const amount1Alks = toAlks(data.token1Amount, data.token1Decimals ?? 8);


      // Determine pool ID: use provided poolId, discover via factory, or use default
      let resolvedPoolId = data.poolId || null;

      if (!resolvedPoolId) {
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
      } else {
        // Pool doesn't exist: use factory opcode 1 (CreateNewPool)
        protostone = buildCreateNewPoolProtostone({
          factoryId: ALKANE_FACTORY_ID,
          token0Id: data.token0Id,
          token1Id: data.token1Id,
          amount0: amount0Alks,
          amount1: amount1Alks,
        });
      }


      // Build input requirements
      const inputRequirements = buildAddLiquidityInputRequirements({
        token0Id: data.token0Id,
        token1Id: data.token1Id,
        amount0: amount0Alks,
        amount1: amount1Alks,
      });



      const btcNetwork = getBitcoinNetwork(network);

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';

      // ============================================================================
      // ⚠️ CRITICAL: Browser wallets need ACTUAL addresses, not symbolic ⚠️
      // ============================================================================
      // Symbolic addresses (p2tr:0, p2wpkh:0) resolve to the SDK's DUMMY wallet.
      // Bug fixed: 2026-03-01 - see useSwapMutation.ts for full documentation.
      // ============================================================================
      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      // JOURNAL ENTRY (2026-03-01): For single-address wallets, use primaryAddress
      // TypeScript can't infer from the early return that primaryAddress is defined, use assertion
      const toAddresses = useActualAddresses
        ? [primaryAddress!]
        : ['p2tr:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';


      try {
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: data.feeRate,
          autoConfirm: false,
          fromAddresses,
          toAddresses,
          changeAddress: changeAddr,
          alkanesChangeAddress: alkanesChangeAddr,
          ordinalsStrategy: 'burn',
        });



        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          return { success: true, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          const readyToSign = result.readyToSign;

          // Convert PSBT to base64
          let psbtBase64: string = extractPsbtBase64(readyToSign.psbt);

          // === Alkane UTXO Injection ===
          // The SDK's internal protorunesbyaddress is broken (returns 0x on regtest),
          // so the PSBT is built WITHOUT alkane-bearing inputs. We manually discover
          // alkane UTXOs and inject them into the PSBT before signing.
          const alkaneUtxos = await discoverAlkaneUtxos(taprootAddress!, '/api/rpc');

          if (alkaneUtxos.length > 0) {
            const tapInternalKeyHex = account?.taproot?.pubKeyXOnly;
            psbtBase64 = injectAlkaneInputs(
              psbtBase64,
              alkaneUtxos,
              taprootAddress!,
              btcNetwork,
              tapInternalKeyHex,
            );
          } else {
          }

          // ============================================================================
          // ⚠️ CRITICAL: PSBT PATCHING REMOVED - DO NOT RE-ADD ⚠️
          // ============================================================================
          // Date Removed: 2026-03-01 (same as useSwapMutation.ts fix)
          // See useSwapMutation.ts:444-483 for full documentation.
          //
          // alkanes-rs SDK creates PSBTs with correct real addresses for browser wallets.
          // patchPsbtForBrowserWallet was CORRUPTING these addresses.
          // ============================================================================


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
            }
          }

          // For keystore wallets, request user confirmation before signing
          if (walletType === 'keystore') {
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
              throw new Error('Transaction rejected by user');
            }
          }

          // Sign PSBT — browser wallets sign all input types in a single call,
          // so we must NOT call signPsbt twice (causes "inputType: sh without redeemScript").
          let signedPsbtBase64: string;
          if (isBrowserWallet) {
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          tx.outs.forEach((output, idx) => {
            const script = Buffer.from(output.script).toString('hex');
            if (script.startsWith('6a')) {
            } else {
              try {
                const addr = bitcoin.address.fromOutputScript(output.script, btcNetwork);
              } catch {
              }
            }
          });

          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);

          return {
            success: true,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          return { success: true, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        return { success: true, transactionId: txId };

      } catch (error) {
        console.error('[AddLiquidity] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {

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
