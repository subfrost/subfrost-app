/**
 * useSwapUnwrapMutation - One-click Token to BTC (e.g., DIESEL → BTC) via atomic swap + unwrap
 *
 * ## How It Works
 *
 * This hook combines swap (DIESEL → frBTC) and unwrap (frBTC → BTC) into a single
 * Bitcoin transaction using three protostones chained together:
 *
 * 1. **p0 (Edict)**: Transfer sell tokens (DIESEL) to p1 (swap call)
 *    - Format: [sellBlock:sellTx:sellAmount:p1]
 *
 * 2. **p1 (Swap)**: Calls factory contract with opcode 13 (SwapExactTokensForTokens)
 *    - Input: DIESEL from p0 as `incomingAlkanes`
 *    - Output: frBTC directed to p2 (unwrap call) via pointer=p2
 *
 * 3. **p2 (Unwrap)**: Calls frBTC contract with opcode 78
 *    - Input: frBTC from p1 as `incomingAlkanes`
 *    - Output: BTC to user address (v0)
 *
 * Note: We route through the factory (opcode 13) instead of calling the pool
 * directly because the deployed pool logic is missing the Swap opcode (3).
 *
 * ## Transaction Output Ordering
 *
 * - Output 0 (v0): User taproot address (receives final BTC)
 * - Output 1 (v1): Signer address (for unwrap BTC output)
 * - Output 2+: Change, OP_RETURN
 *
 * ### Journal: 2026-01-28 — Factory router fix applied
 *
 * Previously p1 called the pool directly with opcode 3 (Swap). The deployed pool
 * WASM at [4:65496] is missing opcode 3 — an older build. Swaps silently failed
 * on-chain (no alkane state changes, no revert visible to user).
 *
 * FIX: p1 now calls the factory [4:65498] with opcode 13 (SwapExactTokensForTokens).
 * The factory has working router logic that executes swaps through pools internally.
 * Cellpack format: [factory_block, factory_tx, 13, path_len, ...path, amount_in, min_out, deadline]
 *
 * See useSwapMutation.ts journal entry for full investigation details.
 *
 * @see useWrapSwapMutation.ts - The reverse flow (BTC → Token)
 * @see useSwapMutation.ts - Standalone swap logic
 * @see useUnwrapMutation.ts - Standalone unwrap logic
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

// Factory router opcode for swap
const FACTORY_SWAP_OPCODE = 13; // SwapExactTokensForTokens

// frBTC unwrap opcode (redeem frBTC for BTC)
const FRBTC_UNWRAP_OPCODE = 78;

// Hardcoded signer addresses per network (same as useUnwrapMutation)
const SIGNER_ADDRESSES: Record<string, string> = {
  'regtest': 'bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft',
  'subfrost-regtest': 'bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft',
  'oylnet': 'bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft',
};

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type SwapUnwrapTransactionData = {
  sellCurrency: string;     // Token to sell (e.g., "2:0" for DIESEL)
  sellAmount: string;       // Amount in alks
  expectedBtcAmount: string; // Expected BTC output in alks (sats)
  maxSlippage: string;      // Percent string, e.g., '0.5'
  feeRate: number;          // sats/vB
  poolId?: { block: string | number; tx: string | number }; // Pool reference (not used for routing)
  deadlineBlocks?: number;  // Default 3
};

/**
 * Build combined swap+unwrap protostone string
 *
 * Three protostones chained:
 * - p0: Edict to transfer sell tokens to p1 (swap call)
 * - p1: Factory swap (opcode 13) with pointer=p2 to forward frBTC to unwrap
 * - p2: Unwrap call receives frBTC and outputs BTC
 *
 * Format: [sellBlock:sellTx:sellAmount:p1]:v0:v0,[factory_block,factory_tx,13,...]:p2:v0,[frbtc_block,frbtc_tx,78]:v0:v0
 */
function buildSwapUnwrapProtostone(params: {
  sellTokenId: string;      // e.g., "2:0" for DIESEL
  sellAmount: string;
  frbtcId: string;
  factoryId: string;
  minFrbtcOutput: string;   // Minimum frBTC from swap (before unwrap)
  deadline: string;
}): string {
  const { sellTokenId, sellAmount, frbtcId, factoryId, minFrbtcOutput, deadline } = params;

  const [sellBlock, sellTx] = sellTokenId.split(':');
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');
  const [factoryBlock, factoryTx] = factoryId.split(':');

  // p0: Edict - Transfer sell tokens to p1 (the swap call)
  // Format: [block:tx:amount:target]
  const edict = `[${sellBlock}:${sellTx}:${sellAmount}:p1]`;
  const p0 = `${edict}:v0:v0`;

  // p1: Swap - call factory with SwapExactTokensForTokens (opcode 13)
  // Receives sell tokens from p0 as incomingAlkanes
  // Path: sellToken → frBTC
  // pointer=p2 directs frBTC output to the unwrap call
  const swapCellpack = [
    factoryBlock,
    factoryTx,
    FACTORY_SWAP_OPCODE, // 13
    2, // path_len
    sellBlock,
    sellTx,
    frbtcBlock,
    frbtcTx,
    sellAmount,
    minFrbtcOutput,
    deadline,
  ].join(',');
  const p1 = `[${swapCellpack}]:p2:v0`;

  // p2: Unwrap - call frBTC contract (opcode 78)
  // Receives frBTC from p1 as incomingAlkanes
  // pointer=v0 sends BTC output to user
  const unwrapCellpack = [frbtcBlock, frbtcTx, FRBTC_UNWRAP_OPCODE].join(',');
  const p2 = `[${unwrapCellpack}]:v0:v0`;

  // Chain all three protostones
  return `${p0},${p1},${p2}`;
}

export function useSwapUnwrapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { FRBTC_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig(network);

  // Fetch dynamic frBTC wrap/unwrap fees
  const { data: premiumData } = useFrbtcPremium();
  const unwrapFee = premiumData?.unwrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;

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
    mutationFn: async (data: SwapUnwrapTransactionData) => {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[SwapUnwrap] ████ ONE-CLICK TOKEN → BTC MUTATION STARTED ████');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[SwapUnwrap] Input data:', JSON.stringify(data, null, 2));
      console.log('[SwapUnwrap] Network:', network);
      console.log('[SwapUnwrap] FRBTC_ALKANE_ID:', FRBTC_ALKANE_ID);
      console.log('[SwapUnwrap] unwrapFee:', unwrapFee);

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Get addresses
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      const signerAddress = getSignerAddress();
      const btcNetwork = getBitcoinNetwork();

      console.log('[SwapUnwrap] Addresses:', { taprootAddress, segwitAddress, signerAddress });

      // Calculate minimum frBTC from swap (accounting for slippage)
      // The swap outputs frBTC which then gets unwrapped to BTC
      const minFrbtcFromSwap = calculateMinimumFromSlippage({
        amount: data.expectedBtcAmount, // frBTC amount ≈ BTC amount (1:1 minus fees)
        maxSlippage: data.maxSlippage,
      });

      console.log('[SwapUnwrap] Sell amount:', data.sellAmount);
      console.log('[SwapUnwrap] Expected BTC:', data.expectedBtcAmount);
      console.log('[SwapUnwrap] Min frBTC from swap:', minFrbtcFromSwap);

      // Get deadline block height
      const deadlineBlocks = data.deadlineBlocks || 3;
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[SwapUnwrap] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      // Build combined protostone
      const protostone = buildSwapUnwrapProtostone({
        sellTokenId: data.sellCurrency,
        sellAmount: new BigNumber(data.sellAmount).integerValue(BigNumber.ROUND_FLOOR).toString(),
        frbtcId: FRBTC_ALKANE_ID,
        factoryId: ALKANE_FACTORY_ID,
        minFrbtcOutput: new BigNumber(minFrbtcFromSwap).integerValue(BigNumber.ROUND_FLOOR).toString(),
        deadline: deadline.toString(),
      });

      console.log('[SwapUnwrap] Built protostone:', protostone);

      // Input requirements: The sell token (DIESEL)
      const [sellBlock, sellTx] = data.sellCurrency.split(':');
      const inputRequirements = `${sellBlock}:${sellTx}:${new BigNumber(data.sellAmount).integerValue(BigNumber.ROUND_FLOOR).toString()}`;
      console.log('[SwapUnwrap] Input requirements:', inputRequirements);

      // Build address arrays
      const fromAddresses: string[] = [];
      if (segwitAddress) fromAddresses.push(segwitAddress);
      if (taprootAddress) fromAddresses.push(taprootAddress);

      // toAddresses: [user (v0), signer (v1)]
      // Note: For unwrap, the signer receives the frBTC and sends BTC to user
      const toAddresses = [taprootAddress, signerAddress];

      console.log('[SwapUnwrap] From addresses:', fromAddresses);
      console.log('[SwapUnwrap] To addresses:', toAddresses);

      console.log('═══════════════════════════════════════════════════════════════');
      console.log('[SwapUnwrap] ████ EXECUTING ATOMIC SWAP+UNWRAP ████');
      console.log('═══════════════════════════════════════════════════════════════');

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

        console.log('[SwapUnwrap] Execute result:', JSON.stringify(result, null, 2));

        // Check if SDK auto-completed
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[SwapUnwrap] Transaction auto-completed, txid:', txId);
          return { success: true, transactionId: txId };
        }

        // Handle readyToSign state
        if (result?.readyToSign) {
          console.log('[SwapUnwrap] Got readyToSign state, signing...');
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
          console.log('[SwapUnwrap] Signing PSBT with SegWit, then Taproot...');
          let signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);

          // Finalize and extract
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[SwapUnwrap] Transaction ID:', txid);

          // Log outputs for debugging
          console.log('[SwapUnwrap] Transaction outputs:');
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
          console.log('[SwapUnwrap] Broadcasting transaction...');
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[SwapUnwrap] Broadcast successful:', broadcastTxid);

          return { success: true, transactionId: broadcastTxid || txid };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[SwapUnwrap] Execution complete, txid:', txId);
          return { success: true, transactionId: txId };
        }

        throw new Error('SwapUnwrap execution did not return a transaction ID');
      } catch (error: any) {
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('[SwapUnwrap] ████ EXECUTE ERROR ████');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('[SwapUnwrap] Error:', error?.message);
        console.error('[SwapUnwrap] Stack:', error?.stack);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[SwapUnwrap] ✓ Success! txid:', data.transactionId);

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

      console.log('[SwapUnwrap] Queries invalidated - UI will refresh when indexer processes block');
    },
  });
}
