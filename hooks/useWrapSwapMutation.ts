/**
 * useWrapSwapMutation - One-click BTC to DIESEL (or any token) via atomic wrap + swap
 *
 * ## How It Works
 *
 * This hook combines wrap (BTC → frBTC) and swap (frBTC → DIESEL) into a single
 * Bitcoin transaction using two protostones chained together:
 *
 * 1. **p0 (Wrap)**: Calls frBTC contract with opcode 77
 *    - Input: BTC directed to signer address (v1)
 *    - Output: frBTC directed to p1 (next protostone) via pointer=p1
 *
 * 2. **p1 (Swap)**: Calls pool contract with opcode 3
 *    - Input: frBTC from p0 arrives as `incomingAlkanes`
 *    - Output: DIESEL (or target token) to user address (v0)
 *
 * ## Transaction Output Ordering
 *
 * - Output 0 (v0): User taproot address (receives final DIESEL)
 * - Output 1 (v1): Signer address (receives BTC for wrap)
 * - Output 2+: Change, OP_RETURN
 *
 * ## Why This Matters
 *
 * Previously, BTC → DIESEL required TWO transactions:
 * 1. Wrap BTC to frBTC (wait for confirmation)
 * 2. Swap frBTC to DIESEL
 *
 * Now it's ONE atomic transaction - simpler UX, fewer fees, instant.
 *
 * @see useWrapMutation.ts - Standalone wrap logic
 * @see useSwapMutation.ts - Standalone swap logic with two-protostone pattern
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import {
  calculateMinimumFromSlippage,
  getFutureBlockHeight,
} from '@/utils/amm';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// Pool operation codes
const POOL_OPCODES = {
  Swap: 3,
};

// frBTC wrap opcode
const FRBTC_WRAP_OPCODE = 77;

// Hardcoded signer addresses per network (same as useWrapMutation)
// Derived from frBTC contract [32:0] opcode 103 (GET_SIGNER).
// If the frBTC contract is redeployed, update these. See useWrapMutation.ts header.
const SIGNER_ADDRESSES: Record<string, string> = {
  'regtest': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  'subfrost-regtest': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  'oylnet': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
};

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type WrapSwapTransactionData = {
  btcAmount: string;        // BTC amount in display units (e.g., "0.5")
  buyAmount: string;        // Expected output amount in alks
  buyCurrency: string;      // Target token alkane id (e.g., "2:0" for DIESEL)
  maxSlippage: string;      // Percent string, e.g., '0.5'
  feeRate: number;          // sats/vB
  poolId: { block: string | number; tx: string | number };
  deadlineBlocks?: number;  // Default 3
};

/**
 * Build combined wrap+swap protostone string
 *
 * Two protostones chained:
 * - p0: Wrap (frBTC contract) with pointer=p1 to forward frBTC to swap
 * - p1: Swap (pool contract) receives frBTC and outputs target token
 *
 * Format: [frbtc_block,frbtc_tx,77]:p1:v0,[pool_block,pool_tx,3,minOutput,deadline]:v0:v0
 */
function buildWrapSwapProtostone(params: {
  frbtcId: string;
  poolId: { block: string | number; tx: string | number };
  minOutput: string;
  deadline: string;
}): string {
  const { frbtcId, poolId, minOutput, deadline } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');
  const poolBlock = poolId.block.toString();
  const poolTx = poolId.tx.toString();

  // p0: Wrap - call frBTC contract (opcode 77)
  // pointer=p1 directs minted frBTC to next protostone (swap)
  // refund=v0 sends any refunds to user
  // Convert block/tx to numbers for proper protobuf encoding
  const blockNum = parseInt(frbtcBlock, 10);
  const txNum = parseInt(frbtcTx, 10);
  const wrapCellpack = `${blockNum},${txNum},${FRBTC_WRAP_OPCODE}`;
  const p0 = `[${wrapCellpack}]:p1:v0`;

  // p1: Swap - call pool contract (opcode 3)
  // Receives frBTC from p0 as incomingAlkanes
  // pointer=v0 sends output tokens to user
  const swapCellpack = [poolBlock, poolTx, POOL_OPCODES.Swap, minOutput, deadline].join(',');
  const p1 = `[${swapCellpack}]:v0:v0`;

  // Chain both protostones
  return `${p0},${p1}`;
}

export function useWrapSwapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const wrapFee = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

  // Get signer address for network
  const getSignerAddress = (): string => {
    const signer = SIGNER_ADDRESSES[network];
    if (!signer) {
      throw new Error(`No signer address configured for network: ${network}`);
    }
    return signer;
  };

  // Get bitcoin network for PSBT parsing
  const getBitcoinNetwork = (): bitcoin.Network => {
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
      default:
        return bitcoin.networks.regtest;
    }
  };

  return useMutation({
    mutationFn: async (data: WrapSwapTransactionData) => {
      console.log('═════════════════════════════════════════════════════════');
      console.log('[WrapSwap] ████ ONE-CLICK BTC → TOKEN MUTATION STARTED ████');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('[WrapSwap] Input data:', JSON.stringify(data, null, 2));
      console.log('[WrapSwap] Network:', network);
      console.log('[WrapSwap] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
      console.log('[WrapSwap] wrapFee:', wrapFee);

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!data.poolId) throw new Error('Pool ID is required');

      // Get addresses
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      const signerAddress = getSignerAddress();
      const btcNetwork = getBitcoinNetwork();

      console.log('[WrapSwap] Addresses:', { taprootAddress, segwitAddress, signerAddress });

      // Convert BTC to sats
      const btcAmountSats = new BigNumber(data.btcAmount)
        .multipliedBy(100000000)
        .integerValue(BigNumber.ROUND_FLOOR)
        .toString();

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
      const deadlineBlocks = data.deadlineBlocks || 3;
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[WrapSwap] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      // Build combined protostone
      const protostone = buildWrapSwapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
        poolId: data.poolId,
        minOutput: new BigNumber(minAmountOut).integerValue(BigNumber.ROUND_FLOOR).toString(),
        deadline: deadline.toString(),
      });

      console.log('[WrapSwap] Built protostone:', protostone);

      // Input requirements: BTC to signer (v1)
      const inputRequirements = `B:${btcAmountSats}:v1`;
      console.log('[WrapSwap] Input requirements:', inputRequirements);

      // Build address arrays
      const fromAddresses: string[] = [];
      if (segwitAddress) fromAddresses.push(segwitAddress);
      if (taprootAddress) fromAddresses.push(taprootAddress);

      // toAddresses: [user (v0), signer (v1)]
      const toAddresses = [taprootAddress, signerAddress];

      console.log('[WrapSwap] From addresses:', fromAddresses);
      console.log('[WrapSwap] To addresses:', toAddresses);

      console.log('═════════════════════════════════════════════════════════');
      console.log('[WrapSwap] ████ EXECUTING ATOMIC WRAP+SWAP ████');
      console.log('═══════════════════════════════════════════════════════════');

      try {
        // Execute using alkanesExecuteTyped
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: data.feeRate,
          autoConfirm: false, // We handle signing
          fromAddresses,
          toAddresses,
          changeAddress: segwitAddress || taprootAddress,
          alkanesChangeAddress: taprootAddress,
        });

        console.log('[WrapSwap] Execute result:', JSON.stringify(result, null, 2));

        // Check if SDK auto-completed
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[WrapSwap] Transaction auto-completed, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Handle readyToSign state
        if (result?.readyToSign) {
          console.log('[WrapSwap] Got readyToSign state, signing...');
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

          // Sign with both keys
          console.log('[WrapSwap] Signing PSBT with SegWit, then Taproot...');
          let signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);

          // Finalize and extract
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[WrapSwap] Transaction ID:', txid);

          // Log outputs for debugging
          console.log('[WrapSwap] Transaction outputs:');
          tx.outs.forEach((output, idx) => {
            const script = Buffer.from(output.script).toString('hex');
            if (script.startsWith('6a')) {
              console.log(`  [${idx}] OP_RETURN (protostone)`);
            } else {
              try {
                const addr = bitcoin.address.fromOutputScript(output.script, btcNetwork);
                const label = addr === taprootAddress ? 'USER' :
                              addr === signerAddress ? 'SIGNER' : 'OTHER';
                console.log(`  [${idx}] ${label}: ${output.value} sats -> ${addr}`);
              } catch {
                console.log(`  [${idx}] Unknown: ${output.value} sats`);
              }
            }
          });

          // Broadcast
          console.log('[WrapSwap] Broadcasting transaction...');
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[WrapSwap] Broadcast successful:', broadcastTxid);

          return { success: true, transactionId: broadcastTxid || txid };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[WrapSwap] Execution complete, txid:', txId);
          return { success: true, transactionId: txId };
        }

        throw new Error('WrapSwap execution did not return a transaction ID');
      } catch (error: any) {
        console.error('═════════════════════════════════════════════════════════════');
        console.error('[WrapSwap] ████ EXECUTE ERROR ████');
        console.error('═════════════════════════════════════════════════════════════');
        console.error('[WrapSwap] Error:', error?.message);
        console.error('[WrapSwap] Stack:', error?.stack);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[WrapSwap] ✓ Success! txid:', data.transactionId);

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

      console.log('[WrapSwap] Queries invalidated - UI will refresh when indexer processes block');
    },
  });
}
