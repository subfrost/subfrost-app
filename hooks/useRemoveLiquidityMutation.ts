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

export type RemoveLiquidityTransactionData = {
  lpTokenId: string;       // LP token alkane id (e.g., "3:123")
  lpAmount: string;        // amount of LP tokens to burn (display units)
  lpDecimals?: number;     // LP token decimals (default 8)
  minAmount0?: string;     // minimum token0 to receive (display units, optional)
  minAmount1?: string;     // minimum token1 to receive (display units, optional)
  token0Decimals?: number; // token0 decimals (default 8)
  token1Decimals?: number; // token1 decimals (default 8)
  feeRate: number;         // sats/vB
  deadlineBlocks?: number; // blocks until deadline (default 3)
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
 * Build protostone string for RemoveLiquidity (Burn) operation
 * Format: [factory_block,factory_tx,opcode(12),lp_block,lp_tx,lpAmount,minAmount0,minAmount1,deadline]:pointer:refund
 */
function buildRemoveLiquidityProtostone(params: {
  factoryId: string;
  lpTokenId: string;
  lpAmount: string;
  minAmount0: string;
  minAmount1: string;
  deadline: string;
  pointer?: string;
  refund?: string;
}): string {
  const {
    factoryId,
    lpTokenId,
    lpAmount,
    minAmount0,
    minAmount1,
    deadline,
    pointer = 'v0',
    refund = 'v0',
  } = params;

  const [factoryBlock, factoryTx] = factoryId.split(':');
  const [lpBlock, lpTx] = lpTokenId.split(':');

  // Build cellpack: [factory_block, factory_tx, opcode(12), lp_block, lp_tx, lpAmount, minAmount0, minAmount1, deadline]
  const cellpack = [
    factoryBlock,
    factoryTx,
    FACTORY_OPCODES.Burn, // '12'
    lpBlock,
    lpTx,
    lpAmount,
    minAmount0,
    minAmount1,
    deadline,
  ].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

/**
 * Build input requirements string for RemoveLiquidity
 * Format: "lp_block:lp_tx:lpAmount"
 */
function buildRemoveLiquidityInputRequirements(params: {
  lpTokenId: string;
  lpAmount: string;
}): string {
  const { lpTokenId, lpAmount } = params;
  const [block, tx] = lpTokenId.split(':');
  return `${block}:${tx}:${lpAmount}`;
}

export function useRemoveLiquidityMutation() {
  const { account, network, isConnected, signTaprootPsbt } = useWallet();
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
      case 'subfrost-regtest':
      case 'oylnet':
        return bitcoin.networks.regtest;
      default:
        return bitcoin.networks.bitcoin;
    }
  };

  return useMutation({
    mutationFn: async (data: RemoveLiquidityTransactionData) => {
      console.log('[RemoveLiquidity] ═══════════════════════════════════════════');
      console.log('[RemoveLiquidity] Starting remove liquidity transaction');
      console.log('[RemoveLiquidity] Input data:', JSON.stringify(data, null, 2));

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // Get addresses for validation
      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      // Convert display amounts to alks
      const lpAmountAlks = toAlks(data.lpAmount, data.lpDecimals ?? 8);
      const minAmount0Alks = data.minAmount0 ? toAlks(data.minAmount0, data.token0Decimals ?? 8) : '0';
      const minAmount1Alks = data.minAmount1 ? toAlks(data.minAmount1, data.token1Decimals ?? 8) : '0';

      console.log('[RemoveLiquidity] Amounts in alks:', { lpAmountAlks, minAmount0Alks, minAmount1Alks });

      // Get block height for deadline
      const deadline = await getFutureBlockHeight(
        data.deadlineBlocks || 3,
        provider as any
      );

      console.log('[RemoveLiquidity] Deadline block:', deadline);

      // Build protostone
      const protostone = buildRemoveLiquidityProtostone({
        factoryId: ALKANE_FACTORY_ID,
        lpTokenId: data.lpTokenId,
        lpAmount: lpAmountAlks,
        minAmount0: minAmount0Alks,
        minAmount1: minAmount1Alks,
        deadline: deadline.toString(),
      });

      console.log('[RemoveLiquidity] Protostone:', protostone);

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

          // Sign the PSBT
          const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

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
    },
  });
}
