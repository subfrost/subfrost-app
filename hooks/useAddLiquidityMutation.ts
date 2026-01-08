/**
 * useAddLiquidityMutation.ts
 *
 * This hook handles adding liquidity to AMM pools.
 *
 * ## IMPORTANT: Factory vs Pool Opcodes (January 2026)
 *
 * There are TWO different contracts with different opcodes:
 *
 * ### FACTORY Contract (e.g., 4:65522)
 * Only has opcodes 0-3 for management:
 *   - 0: InitFactory
 *   - 1: CreateNewPool
 *   - 2: FindExistingPoolId
 *   - 3: GetAllPools
 *
 * The FACTORY_OPCODES in constants/index.ts includes opcodes 11 (AddLiquidity)
 * but this is actually a POOL operation that the factory routes to the pool.
 *
 * ### POOL Contract (e.g., 2:3 for DIESEL/frBTC pool)
 * Has the actual operation opcodes:
 *   - 0: Init
 *   - 1: AddLiquidity (mint LP tokens)
 *   - 2: RemoveLiquidity (burn LP tokens)
 *   - 3: Swap
 *   - 4: SimulateSwap
 *
 * ### Why AddLiquidity Works with Factory
 *
 * AddLiquidity uses a single protostone that calls factory opcode 11.
 * The factory then internally routes this to create/find the pool and
 * execute the AddLiquidity operation. This is different from Swap and
 * RemoveLiquidity which must call the pool directly.
 *
 * ### Contrast with Swap/RemoveLiquidity
 *
 * - Swap: Must call POOL directly with two-protostone pattern (see useSwapMutation.ts)
 * - RemoveLiquidity: Must call POOL directly (see useRemoveLiquidityMutation.ts)
 * - AddLiquidity: Can call FACTORY which routes to pool (this file)
 *
 * @see constants/index.ts - FACTORY_OPCODES documentation
 * @see useSwapMutation.ts - Two-protostone pattern for swaps
 * @see useRemoveLiquidityMutation.ts - Two-protostone pattern for burns
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { FACTORY_OPCODES } from '@/constants';
import { getFutureBlockHeight } from '@/utils/amm';
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

export type AddLiquidityTransactionData = {
  token0Id: string;      // alkane id (e.g., "2:0" for DIESEL)
  token1Id: string;      // alkane id (e.g., "32:0" for frBTC)
  token0Amount: string;  // display amount (e.g., "1.5")
  token1Amount: string;  // display amount
  token0Decimals?: number; // default 8
  token1Decimals?: number; // default 8
  maxSlippage?: string;  // percent string, e.g. '0.5' (unused for now, minLP=0)
  feeRate: number;       // sats/vB
  deadlineBlocks?: number; // default 3
};

/**
 * Convert display amount to alks (atomic units)
 * Default is 8 decimals for alkane tokens
 */
function toAlks(amount: string, decimals: number = 8): string {
  const bn = new BigNumber(amount);
  return bn.multipliedBy(Math.pow(10, decimals)).integerValue(BigNumber.ROUND_FLOOR).toString();
}

/**
 * Build protostone string for AddLiquidity operation
 * Format: [factory_block,factory_tx,opcode(11),token0_block,token0_tx,token1_block,token1_tx,amount0,amount1,minLP,deadline]:pointer:refund
 */
function buildAddLiquidityProtostone(params: {
  factoryId: string;
  token0Id: string;
  token1Id: string;
  amount0: string;
  amount1: string;
  minLP: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const {
    factoryId,
    token0Id,
    token1Id,
    amount0,
    amount1,
    minLP,
    deadline,
    pointer = 'v0',
    refund = 'v0',
  } = params;

  const [factoryBlock, factoryTx] = factoryId.split(':');
  const [token0Block, token0Tx] = token0Id.split(':');
  const [token1Block, token1Tx] = token1Id.split(':');

  // Build cellpack: [factory_block, factory_tx, opcode(11), token0_block, token0_tx, token1_block, token1_tx, amount0, amount1, minLP, deadline]
  const cellpack = [
    factoryBlock,
    factoryTx,
    FACTORY_OPCODES.AddLiquidity, // '11'
    token0Block,
    token0Tx,
    token1Block,
    token1Tx,
    amount0,
    amount1,
    minLP,
    deadline,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for AddLiquidity
 * Format: "block0:tx0:amount0,block1:tx1:amount1"
 */
function buildAddLiquidityInputRequirements(params: {
  token0Id: string;
  token1Id: string;
  amount0: string;
  amount1: string;
}): string {
  const { token0Id, token1Id, amount0, amount1 } = params;

  const [block0, tx0] = token0Id.split(':');
  const [block1, tx1] = token1Id.split(':');

  return `${block0}:${tx0}:${amount0},${block1}:${tx1}:${amount1}`;
}

export function useAddLiquidityMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  // Get bitcoin network for PSBT parsing
  const getBitcoinNetwork = () => {
    switch (network) {
      case 'mainnet':
        return bitcoin.networks.bitcoin;
      case 'testnet':
      case 'signet':
        return bitcoin.networks.testnet;
      case 'regtest':
      case 'regtest-local':
      case 'subfrost-regtest':
      case 'oylnet':
        return bitcoin.networks.regtest;
      default:
        return bitcoin.networks.bitcoin;
    }
  };

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

      // Get addresses
      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      // Convert display amounts to alks
      const amount0Alks = toAlks(data.token0Amount, data.token0Decimals ?? 8);
      const amount1Alks = toAlks(data.token1Amount, data.token1Decimals ?? 8);

      console.log('[AddLiquidity] Amounts in alks:', { amount0Alks, amount1Alks });

      // Get block height for deadline
      const deadline = await getFutureBlockHeight(
        data.deadlineBlocks || 3,
        provider as any
      );

      console.log('[AddLiquidity] Deadline block:', deadline);

      // For MVP, use minLP = 0 (no slippage protection)
      // TODO: Calculate minLP based on pool reserves and slippage
      const minLP = '0';

      // Build protostone
      const protostone = buildAddLiquidityProtostone({
        factoryId: ALKANE_FACTORY_ID,
        token0Id: data.token0Id,
        token1Id: data.token1Id,
        amount0: amount0Alks,
        amount1: amount1Alks,
        minLP,
        deadline: deadline.toString(),
      });

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

      const btcNetwork = getBitcoinNetwork();

      try {
        // Execute using alkanesExecuteTyped with SDK defaults:
        // - fromAddresses: ['p2wpkh:0', 'p2tr:0'] (sources from both SegWit and Taproot)
        // - changeAddress: 'p2wpkh:0' (BTC change -> SegWit)
        // - alkanesChangeAddress: 'p2tr:0' (alkane change -> Taproot)
        // - toAddresses: auto-generated from protostone vN references
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: data.feeRate,
          autoConfirm: false,
        });

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

          // Sign the PSBT with both keys (SegWit first, then Taproot)
          // The PSBT may have inputs from both address types
          console.log('[AddLiquidity] Signing PSBT with SegWit key first, then Taproot key...');
          let signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[AddLiquidity] Transaction built:', txid);

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
