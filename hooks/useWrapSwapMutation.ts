/**
 * useWrapSwapMutation - One-click BTC to DIESEL (or any token) via atomic wrap + swap
 *
 * ## ⚠️ DEPRECATED — Single-tx atomic wrap+swap does NOT work
 *
 * This hook is retained for reference but is NO LONGER USED by SwapShell.
 * BTC→Token swaps now use a two-step flow: wrapMutation → mine → swapMutation.
 * See SwapShell.tsx handleSwap() for the working implementation.
 *
 * ### Journal: 2026-02-01 — Protostone pointer=pN doesn't work for cellpacks
 *
 * PROBLEM: BTC→DIESEL swaps broadcast and confirm, but only the wrap executes.
 * The user receives frBTC instead of DIESEL. Pool reserves unchanged.
 *
 * INVESTIGATION:
 *   1. Traced txids be0b988f... and 94eb6608... on regtest.
 *   2. Both show: vout 0 = 99,900,000 frBTC (user taproot), vout 1 = 1 BTC (signer).
 *      No DIESEL received. Pool reserves unchanged.
 *   3. Simulated factory opcode 13 WITHOUT alkanes → "balance underflow,
 *      transferring(frBTC 99900000), from(factory 4:65498), balance(0)".
 *      The factory received ZERO frBTC — the pointer=p1 chain didn't deliver tokens.
 *   4. Simulated factory opcode 13 WITH alkanes → works perfectly (returns DIESEL).
 *   5. Root cause: the protostone `pointer` field only supports OUTPUT INDICES (v0, v1),
 *      NOT protostone indices (p0, p1). The SDK type definitions confirm this:
 *      `pointer?: number` and `refundPointer?: number` — plain output indices.
 *      The `pN` syntax is only valid in EDICT targets ([block:tx:amount:p1]),
 *      not in the pointer field after the cellpack ([cellpack]:pointer:refund).
 *   6. When the SDK encounters `p1` in the pointer position, it either falls back to
 *      v0 (default) or v1. Either way, frBTC goes to an output, not to the next
 *      protostone. The swap protostone receives zero incomingAlkanes.
 *
 * FIX: SwapShell now uses two separate transactions:
 *   Step 1: wrapMutation (BTC → frBTC)
 *   Step 2: mine block + swapMutation (frBTC → DIESEL via edict two-protostone pattern)
 *   The edict pattern [32:0:amount:p1] correctly delivers frBTC to the swap cellpack.
 *
 * NOTE: The same issue likely affects useSwapUnwrapMutation (Token→BTC) which uses
 * pointer=p2 on the swap cellpack to chain into the unwrap cellpack.
 *
 * ## Original Design (non-functional)
 *
 * Two protostones chained:
 * - p0: Wrap cellpack [32,0,77]:p1:v0 — frBTC should go to p1 (but doesn't)
 * - p1: Swap cellpack [4,65498,13,...]:v0:v0 — should receive frBTC (but gets nothing)
 *
 * @see useWrapMutation.ts - Standalone wrap logic (works)
 * @see useSwapMutation.ts - Standalone swap logic with edict pattern (works)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
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

bitcoin.initEccLib(ecc);

// Factory router opcode for swap
const FACTORY_SWAP_OPCODE = 13; // SwapExactTokensForTokens

// frBTC wrap opcode
const FRBTC_WRAP_OPCODE = 77;

// Hardcoded signer addresses per network (same as useWrapMutation)
// Derived from frBTC contract [32:0] opcode 103 (GET_SIGNER).
// If the frBTC contract is redeployed, update these. See useWrapMutation.ts header.
const SIGNER_ADDRESSES: Record<string, string> = {
  'mainnet': 'bc1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqd3ndxc',
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
  buySymbol?: string;       // Symbol for confirmation display (e.g., "DIESEL")
  maxSlippage: string;      // Percent string, e.g., '0.5'
  feeRate: number;          // sats/vB
  poolId?: { block: string | number; tx: string | number }; // Pool reference (not used for routing)
  deadlineBlocks?: number;  // Default 3
};

/**
 * Build combined wrap+swap protostone string
 *
 * Two protostones chained:
 * - p0: Wrap (frBTC contract) with pointer=p1 to forward frBTC to swap
 * - p1: Swap (factory contract opcode 13) receives frBTC and outputs target token
 *
 * Format: [frbtc_block,frbtc_tx,77]:p1:v0,[factory_block,factory_tx,13,path_len,...path,amount_in,min_out,deadline]:v0:v0
 */
function buildWrapSwapProtostone(params: {
  frbtcId: string;
  factoryId: string;
  buyTokenId: string;
  frbtcAmount: string;      // Expected frBTC amount after wrap fee
  minOutput: string;
  deadline: string;
}): string {
  const { frbtcId, factoryId, buyTokenId, frbtcAmount, minOutput, deadline } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');
  const [factoryBlock, factoryTx] = factoryId.split(':');
  const [buyBlock, buyTx] = buyTokenId.split(':');

  // p0: Wrap - call frBTC contract (opcode 77)
  // pointer=p1 directs minted frBTC to next protostone (swap)
  // refund=v0 sends any refunds to user
  const blockNum = parseInt(frbtcBlock, 10);
  const txNum = parseInt(frbtcTx, 10);
  const wrapCellpack = `${blockNum},${txNum},${FRBTC_WRAP_OPCODE}`;
  const p0 = `[${wrapCellpack}]:p1:v0`;

  // p1: Swap - call factory with SwapExactTokensForTokens (opcode 13)
  // Receives frBTC from p0 as incomingAlkanes
  // Path: frBTC → buyToken
  // pointer=v0 sends output tokens to user
  const swapCellpack = [
    factoryBlock,
    factoryTx,
    FACTORY_SWAP_OPCODE, // 13
    2, // path_len
    frbtcBlock,
    frbtcTx,
    buyBlock,
    buyTx,
    frbtcAmount,
    minOutput,
    deadline,
  ].join(',');
  const p1 = `[${swapCellpack}]:v0:v0`;

  // Chain both protostones
  return `${p0},${p1}`;
}

export function useWrapSwapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID, ALKANE_FACTORY_ID } = getConfig(network);

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

      // Get deadline block height (regtest uses large offset so deadline never expires)
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';
      const deadlineBlocks = isRegtest ? 1000 : (data.deadlineBlocks || 3);
      const deadline = await getFutureBlockHeight(deadlineBlocks, provider as any);
      console.log('[WrapSwap] Deadline:', deadline, `(+${deadlineBlocks} blocks)`);

      // Build combined protostone
      const protostone = buildWrapSwapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
        factoryId: ALKANE_FACTORY_ID,
        buyTokenId: data.buyCurrency,
        frbtcAmount: frbtcAmountAfterFee,
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

          // For keystore wallets, request user confirmation before signing
          if (walletType === 'keystore') {
            console.log('[WrapSwap] Keystore wallet - requesting user confirmation...');
            const approved = await requestConfirmation({
              type: 'swap',
              title: 'Confirm BTC Swap',
              description: 'Wrap BTC to frBTC, then swap',
              fromAmount: data.btcAmount,
              fromSymbol: 'BTC',
              toAmount: (parseFloat(data.buyAmount) / 1e8).toString(),
              toSymbol: getTokenSymbol(data.buyCurrency, data.buySymbol),
              toId: data.buyCurrency,
              feeRate: data.feeRate,
            });

            if (!approved) {
              console.log('[WrapSwap] User rejected transaction');
              throw new Error('Transaction rejected by user');
            }
            console.log('[WrapSwap] User approved transaction');
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
