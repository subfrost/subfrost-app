/**
 * useLimitOrderMutation.ts
 *
 * Places a limit order on the Carbine CLOB. Wraps execution through
 * useSandshrewProvider → execute.ts so devnet auto-routing is applied.
 *
 * Contract: Carbine controller proxy [4:70000].
 * Opcode 20 (PlaceLimitOrder): caller sends base (sell) or quote (buy) token
 * as incomingAlkanes alongside the protostone.
 *
 * Calldata format:
 *   [controller_block, controller_tx, 20,
 *    base_block, base_tx, quote_block, quote_tx,
 *    side, price_scaled, amount_scaled]
 *
 * side: 0 = buy, 1 = sell
 * price_scaled  = human_price  * 1e8  (e.g. 0.000001 frBTC/DIESEL = 100 raw)
 * amount_scaled = human_amount * 1e8  (e.g. 1 DIESEL = 100000000 raw)
 *
 * For sell (side=1): inputRequirements = base_token:amount_scaled
 * For buy  (side=0): inputRequirements = quote_token:(price_scaled * amount_scaled / 1e8)
 *
 * =============================================================================
 * JOURNAL — "Insufficient alkanes" on sell orders debugging (2026-04-01)
 * =============================================================================
 *
 * ## Root Cause
 *   alkanesExecuteWithStrings and alkanesExecuteFull both use the quspo/espo
 *   UTXO data API to discover unspent alkane outpoints. On devnet, quspo can
 *   return stale or incomplete data — "have 0 DIESEL" even when the wallet
 *   clearly has a balance. This manifests as:
 *     Error: "Insufficient alkanes: have 0, need N"
 *
 *   The CORRECT approach: use alkanesExecuteTyped (same method useSwapMutation
 *   uses for successful DIESEL swaps). It uses a different UTXO selection path
 *   that resolves correctly on devnet.
 *
 * ## Fix: Route through execute.ts via useSandshrewProvider
 *   execute.ts detects devnet via sandshrew_rpc_url().includes('localhost:18888')
 *   and auto-switches to alkanesExecuteFull (the primary alkanes indexer, always
 *   complete data) when on devnet.
 *
 *   MANDATORY pattern:
 *     const provider = useSandshrewProvider();
 *     await provider.alkanesExecuteTyped({ ... });
 *
 *   FORBIDDEN pattern (bypasses devnet detection):
 *     const { provider: sdkProvider } = useAlkanesSDK();
 *     await sdkProvider.alkanesExecuteTyped({ ... });  // ← WRONG
 *
 *   LimitOrderPanel.tsx currently calls sdkProvider directly — this is legacy
 *   code that was not yet migrated. The useLimitOrderMutation hook (this file)
 *   is the correct pattern to use going forward.
 *
 * ## useActualAddresses is MANDATORY (devnet + browser wallets)
 *   On devnet, symbolic addresses (p2tr:0, p2wpkh:0) resolve to the SDK's
 *   dummy wallet derivation, NOT the connected wallet. Tokens land at the wrong
 *   address → "insufficient balance" even with real balance.
 *   Pattern enforced here:
 *     const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';
 *   See CLAUDE.md "Address Handling" section for full explanation.
 *
 * ## "Insufficient alkanes" vs stale devnet state
 *   If you still see "insufficient alkanes" after routing through useSandshrewProvider:
 *   1. First, hard reset the devnet — stale state from wrong-address tokens is the
 *      most common cause.
 *   2. Verify the wallet actually has the token via alkanes_simulate opcode query.
 *   3. Only then investigate the UTXO selection path further.
 *
 * =============================================================================
 * JOURNAL (2026-04-02): "Insufficient alkanes" on devnet = STALE CACHE
 * =============================================================================
 * If limit orders fail with "Insufficient alkanes: need X, have 0" on devnet,
 * use DevnetControlPanel → "Clear & Reload" to wipe stale IndexedDB cache.
 * This resets the in-browser Bitcoin node and re-runs the full boot sequence,
 * which re-deploys contracts and re-mints tokens at fresh addresses.
 * The sandshrew_rpc_url() detection in execute.ts works correctly for fresh boots.
 * =============================================================================
 *
 * =============================================================================
 * CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01)
 * =============================================================================
 * When using browser wallets, you MUST pass ACTUAL addresses to
 * toAddresses/changeAddress/alkanesChangeAddress -- NOT symbolic addresses like
 * 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet!
 * See useSwapMutation.ts header comment for full documentation.
 * =============================================================================
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useDevnet } from '@/context/DevnetContext';
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
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType, browserWallet } = useWallet();
  const provider = useSandshrewProvider();
  const { controls: devnetControls } = useDevnet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: LimitOrderParams) => {
      console.log('[LimitOrder] ═══════════════════════════════════════════');
      console.log('[LimitOrder] Starting PlaceLimitOrder transaction');
      console.log('[LimitOrder] Params:', JSON.stringify(params, null, 2));

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
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';

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
          ordinalsStrategy: 'exclude',
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
          // CRITICAL: use devnetControls.mineBlocks (harness path) NOT generatetoaddress.
          // generatetoaddress advances bitcoind WITHOUT running the metashrew indexer,
          // creating a permanent height gap that causes "Indexer sync timed out" on
          // the next alkanesExecuteTyped call (the WASM checks metashrew_height == getblockcount).
          // devnetControls.mineBlocks(1) runs the harness mineBlocks which indexes synchronously.
          if (network === 'devnet') {
            try {
              await devnetControls.mineBlocks(1);
              console.log('[LimitOrder] Devnet: mined 1 block via harness (sync-safe)');
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
