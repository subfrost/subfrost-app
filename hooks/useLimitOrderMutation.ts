/**
 * useLimitOrderMutation.ts
 *
 * Places a limit order on the Carbine order book. Extracted and improved from
 * the inline logic in app/swap/components/LimitOrderPanel.tsx (lines 75-133).
 *
 * Contract: Carbine controller (e.g. 4:70000).
 * Opcode 20 (PlaceLimitOrder): Send base or quote token as incomingAlkanes.
 *
 * Calldata format:
 *   [controller_block, controller_tx, 20, baseA_block, baseA_tx, quoteB_block, quoteB_tx,
 *    side, priceScaled, amountScaled]
 *
 * For sell orders: inputRequirements sends base token (amount)
 * For buy orders: inputRequirements sends quote token (price * amount)
 *
 * ============================================================================
 * CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01)
 * ============================================================================
 * When using browser wallets, you MUST pass ACTUAL addresses to
 * toAddresses/changeAddress/alkanesChangeAddress -- NOT symbolic addresses like
 * 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet!
 * See useSwapMutation.ts header comment for full documentation.
 * ============================================================================
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export interface LimitOrderParams {
  controllerId: string;  // Carbine controller alkane ID e.g. "4:70000"
  baseTokenId: string;   // Base token e.g. "2:0" (DIESEL)
  quoteTokenId: string;  // Quote token e.g. "32:0" (frBTC)
  side: 0 | 1;          // 0 = buy, 1 = sell
  price: string;         // Price in quote tokens per base token, scaled to u128
  amount: string;        // Base token amount in atomic units
  feeRate: number;
}

export function useLimitOrderMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: LimitOrderParams) => {
      console.log('[LimitOrder] ═══════════════════════════════════════════');
      console.log('[LimitOrder] Starting PlaceLimitOrder transaction');
      console.log('[LimitOrder] Params:', JSON.stringify(params, null, 2));

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // Get addresses - support single-address wallets (UniSat, OKX)
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      const primaryAddress = taprootAddress || segwitAddress;
      console.log('[LimitOrder] Using addresses:', { taprootAddress, segwitAddress, primaryAddress });

      // Parse IDs
      const [cBlock, cTx] = params.controllerId.split(':');
      const [baseBlock, baseTx] = params.baseTokenId.split(':');
      const [quoteBlock, quoteTx] = params.quoteTokenId.split(':');

      // Build protostone: PlaceLimitOrder opcode 20
      // Calldata: [controller_block, controller_tx, 20, base_block, base_tx, quote_block, quote_tx, side, price, amount]
      const protostone = `[${cBlock},${cTx},20,${baseBlock},${baseTx},${quoteBlock},${quoteTx},${params.side},${params.price},${params.amount}]:v0:v0`;

      // Input requirements depend on side:
      // sell (side=1): send base token (the amount being sold)
      // buy (side=0): send quote token (price * amount / 1e8 to account for scaling)
      let inputRequirements: string;
      if (params.side === 1) {
        // Sell: send base token
        inputRequirements = `${params.baseTokenId}:${params.amount}`;
      } else {
        // Buy: send quote token (price * amount, both already in atomic units)
        // Price and amount are both scaled to 1e8, so multiply and divide by 1e8
        const priceBI = BigInt(params.price);
        const amountBI = BigInt(params.amount);
        const quoteAmount = (priceBI * amountBI / BigInt(1e8)).toString();
        inputRequirements = `${params.quoteTokenId}:${quoteAmount}`;
      }

      console.log('[LimitOrder] Protostone:', protostone);
      console.log('[LimitOrder] Input requirements:', inputRequirements);
      console.log('[LimitOrder] Side:', params.side === 0 ? 'BUY' : 'SELL');

      const btcNetwork = getBitcoinNetwork(network);
      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';

      // Browser wallets need ACTUAL addresses, not symbolic
      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      const toAddresses = useActualAddresses
        ? [primaryAddress!]
        : ['p2tr:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';

      console.log('[LimitOrder] From addresses:', fromAddresses, '(browser:', isBrowserWallet, ')');
      console.log('[LimitOrder] To addresses:', toAddresses);

      try {
        const result = await provider.alkanesExecuteTyped({
          inputRequirements,
          protostones: protostone,
          feeRate: params.feeRate,
          autoConfirm: false,
          fromAddresses,
          toAddresses,
          changeAddress: changeAddr,
          alkanesChangeAddress: alkanesChangeAddr,
          ordinalsStrategy: 'burn',
        });

        console.log('[LimitOrder] Execute result:', JSON.stringify(result, null, 2));

        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[LimitOrder] Transaction auto-completed, txid:', txId);
          return { success: true as const, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[LimitOrder] Got readyToSign, signing PSBT...');
          const readyToSign = result.readyToSign;

          let psbtBase64: string = extractPsbtBase64(readyToSign.psbt);

          // Input patching for browser wallets
          if (isBrowserWallet) {
            const patchResult = patchInputsOnly({
              psbtBase64,
              network: btcNetwork,
              taprootAddress: taprootAddress!,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            });
            psbtBase64 = patchResult.psbtBase64;
            if (patchResult.inputsPatched > 0) {
              console.log(`[LimitOrder] Patched ${patchResult.inputsPatched} input(s) for browser wallet compatibility`);
            }
          }

          // Sign PSBT -- browser wallets sign all input types in a single call
          let signedPsbtBase64: string;
          if (isBrowserWallet) {
            console.log('[LimitOrder] Browser wallet: signing PSBT once (all input types)...');
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            console.log('[LimitOrder] Keystore: signing PSBT with SegWit, then Taproot...');
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[LimitOrder] Transaction built:', txid);

          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[LimitOrder] Broadcast successful:', broadcastTxid);

          // On devnet, mine a block so the transaction is included.
          // Without this, the tx sits in mempool and the Carbine controller
          // never executes — the order never appears on-chain.
          if (network === 'devnet') {
            try {
              const segwitAddr = account?.nativeSegwit?.address;
              if (segwitAddr) {
                await fetch('http://localhost:18888', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'generatetoaddress',
                    params: [1, segwitAddr],
                    id: 1,
                  }),
                });
                console.log('[LimitOrder] Devnet: mined 1 block');
              }
            } catch (e) {
              console.warn('[LimitOrder] Devnet mine failed (non-fatal):', e);
            }
          }

          return {
            success: true as const,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[LimitOrder] Complete, txid:', txId);
          return { success: true as const, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[LimitOrder] Transaction ID:', txId);
        return { success: true as const, transactionId: txId };

      } catch (error) {
        console.error('[LimitOrder] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[LimitOrder] Success! txid:', data.transactionId);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['user-orders'] });
    },
  });
}
