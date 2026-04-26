/**
 * useUnwrapMutation - Unwrap frBTC back to BTC
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
 * const toAddresses = useActualAddresses ? [segwitAddress] : ['p2wpkh:0'];
 * const changeAddr = useActualAddresses ? segwitAddress : 'p2wpkh:0';
 * const alkanesChangeAddr = useActualAddresses ? taprootAddress : 'p2tr:0';
 * ```
 * ============================================================================
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## frBTC Unwrap (opcode 78) — UPDATED 2026-04-26: mainnet also affected
 *
 * Opcode 78 (Unwrap) is NOT supported on either mainnet or hosted regtest.
 * Both deployments of `[32:0]` are running an older fr-btc WASM that lacks
 * this opcode. Verified via `alkanes_simulate` on both endpoints:
 *
 *   target: 32:0, inputs: ["78"]
 *   → mainnet:        "ALKANES: revert: Error: Unrecognized opcode" (status: 1)
 *   → hosted regtest: "ALKANES: revert: Error: Unrecognized opcode" (status: 1)
 *
 * Opcode 77 (Wrap), 99 (GetName), and 103 (GetSigner) DO work on both, so
 * wraps mint correctly and signer-routing works. Only Unwrap is broken.
 *
 * ## What this means for the user
 *
 * If a user submits an unwrap PSBT, the BTC fee/inputs go through (the tx
 * confirms on Bitcoin), but the contract revert means the frBTC is NOT
 * burned. The protorune runtime routes the alkanes to `alkanes_change_address`
 * (i.e. back to the user's taproot at a new outpoint). End result: user
 * pays the BTC fee, frBTC migrates to a new outpoint, NO BTC release happens.
 *
 * This is the same UX hosted regtest produces (verified tx d6a37e2e... at
 * block 9121 — frBTC moved to vout 0, no BTC return). Hosted regtest is a
 * faithful production emulator for this opcode gap.
 *
 * ## What this hook should do
 *
 * Until the frBTC contract is upgraded to support opcode 78, this hook is
 * effectively a no-op-with-fee-cost from a user's perspective. The UI should
 * either:
 *   1. Disable the Unwrap path entirely on networks where opcode 78 is
 *      unimplemented (current state: mainnet + hosted regtest).
 *   2. Pre-flight a simulate before broadcasting and surface a clear error
 *      ("Unwrap not yet supported by the deployed contract") instead of
 *      letting the user pay a fee for nothing.
 *
 * Devnet still works correctly (fresh deploy from prod_wasms/fr_btc.wasm
 * supports opcode 78). Test enforcement in tier1/unwrap-frbtc.test.ts
 * applies to live networks (mainnet + hosted regtest), not devnet.
 *
 * ## Hosted regtest unwrap blocker (2026-04-26) — NOT a frontend bug
 *
 * Symptom: keystore wallet, hosted regtest, fresh wrap mints frBTC at the correct
 * outpoint, but unwrap fails with `Wallet error: Insufficient alkanes: need X of 32:0, have 0`.
 *
 * The frontend now correctly:
 *   - loads the session mnemonic into the WASM provider on `regtest`
 *     (AlkanesSDKContext.tsx:235 — added 'regtest' to allowlist 2026-04-26)
 *   - passes actual coinType=1 keystore addresses via useActualAddresses (this hook line ~122)
 *   - resolves `from_addresses` to the real outpoint owner
 *
 * Verified via JSON-RPC that the outpoint exists and contains the alkane balance:
 *   alkanes_protorunesbyoutpoint({ txid: '<wrap_txid>', vout: 1 }) → balance present
 *   alkanes_protorunesbyaddress({ address: '<our_taproot>' }) → outpoint listed with balance
 *
 * BUT the SDK's UTXO discovery uses the espo essentials index (REST endpoint
 * /api/rpc/regtest/get-alkanes-utxo + JSON-RPC essentials.get_address_outpoints
 * via /api/rpc/regtest/espo). On hosted regtest BOTH return:
 *   - get-alkanes-utxo: lists outpoints with `alkanes: {}` (empty) for ALL outpoints
 *   - essentials.get_address_outpoints: `outpoints: []`
 *
 * Even after a fresh successful wrap (txid 689b151e443988ad095ccd226055dda1bdf51566594ef01a83cc32fb0a91c620,
 * 9,990 frBTC verified at vout 1) the espo essentials index for the address remained empty.
 *
 * This is the same root cause as the metabot regtest-local blocker documented elsewhere in
 * CLAUDE.md: espo essentials skips writing balance entries when the trace return status is
 * not Success (espo: src/modules/essentials/utils/balances/lib.rs:378-379). On hosted regtest
 * traces are stored, but for some reason the balance index population still fails. Same shape:
 * outpoint indexer (alkanes_protorunesbyoutpoint) is correct, address indexer (espo essentials)
 * is empty.
 *
 * Frontend cannot fix this — the SDK's UTXO selection bypasses the outpoint indexer.
 * Two real fix paths, both out of frontend scope:
 *   1. fr-btc contract: remove or non-revert the seen/<txid> guard
 *   2. espo essentials: read balances from protorunes_by_outpoint instead of trace events
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
// NOTE: Only patching INPUTS (witnessUtxo + redeemScript), NOT outputs
// Output patching was removed - see useSwapMutation.ts for why
import { patchInputsOnly } from '@/lib/psbt-patching';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { buildUnwrapProtostone, buildUnwrapInputRequirements } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, extractPsbtBase64, toAlks } from '@/lib/alkanes/helpers';

bitcoin.initEccLib(ecc);

export type UnwrapTransactionBaseData = {
  amount: string; // display units (frBTC)
  feeRate: number; // sats/vB
};

export function useUnwrapMutation() {
  const { account, network, isConnected, signSegwitPsbt, signTaprootPsbt, walletType, browserWallet } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (unwrapData: UnwrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      // Ensure browser wallet session is active before building PSBT
      if (walletType === 'browser') {
        const { ensureWalletSession } = await import('@/lib/wallet/browserWalletSigning');
        await ensureWalletSession();
      }
      if (!provider) throw new Error('Provider not available');

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
      console.log('[useUnwrapMutation] Using addresses:', { taprootAddress, segwitAddress, primaryAddress });

      // Verify wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      // ============================================================================
      // PRE-FLIGHT GUARD: Verify the contract supports opcode 78 (Unwrap)
      // ============================================================================
      // [JOURNAL 2026-04-26] Both mainnet and hosted regtest are running an older
      // fr-btc WASM that doesn't implement opcode 78 (Unwrap). Without this guard,
      // the user would broadcast a tx, pay the BTC fee, and the contract would
      // silently reject the unwrap intent — frBTC stays minted, no BTC release.
      //
      // We simulate the protostone target before broadcasting. If the contract
      // returns "Unrecognized opcode" we abort with a clear error so the user
      // doesn't waste sats. Devnet supports opcode 78 (fresh deploy), so the
      // simulate succeeds there and the unwrap proceeds normally.
      //
      // Skip the pre-flight on devnet to keep its tests fast (opcode 78 is known
      // to work there, and the local indexer's simulate has different overhead).
      // ============================================================================
      if (network !== 'devnet') {
        try {
          const [frbtcBlock, frbtcTx] = FRBTC_ALKANE_ID.split(':');
          const sandshrewUrl = (provider as any).sandshrew_rpc_url?.() || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/rpc/${network}`;
          const simResp = await fetch(sandshrewUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alkanes_simulate',
              params: [{
                target: `${frbtcBlock}:${frbtcTx}`,
                inputs: ['78'],
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '0',
                txindex: 0,
                vout: 0,
              }],
              id: 1,
            }),
          });
          const simJson = await simResp.json();
          const simErr = simJson?.result?.execution?.error || '';
          if (typeof simErr === 'string' && simErr.includes('Unrecognized opcode')) {
            throw new Error(
              `Unwrap is not supported by the deployed frBTC contract on this network ` +
              `(opcode 78 not implemented). The contract needs to be upgraded before ` +
              `unwrap will work. Your frBTC is safe and can be swapped to BTC instead.`,
            );
          }
        } catch (preflightErr: any) {
          // Re-throw our own thrown errors so the user sees them
          if (preflightErr?.message?.includes('Unwrap is not supported')) {
            throw preflightErr;
          }
          // Otherwise (RPC failure, network blip) just log and proceed —
          // we don't want a flaky preflight to block a legitimate unwrap.
          console.warn('[useUnwrapMutation] Preflight opcode-78 check failed (non-fatal):', preflightErr);
        }
      }

      const unwrapAmount = toAlks(unwrapData.amount);

      // Build protostone for unwrap operation
      const protostone = buildUnwrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });

      // Input requirements: frBTC amount to unwrap
      const inputRequirements = buildUnwrapInputRequirements({
        frbtcId: FRBTC_ALKANE_ID,
        amount: unwrapAmount,
      });

      // Get recipient address (taproot for alkanes, but BTC goes to segwit)
      const recipientAddress = account?.nativeSegwit?.address || account?.taproot?.address;
      if (!recipientAddress) throw new Error('No recipient address available');

      // Determine btcNetwork for PSBT operations
      const btcNetwork = getBitcoinNetwork(network);

      console.log('[useUnwrapMutation] Executing unwrap:', {
        amount: unwrapAmount,
        frbtcId: FRBTC_ALKANE_ID,
        recipient: recipientAddress,
        feeRate: unwrapData.feeRate,
      });

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';

      // ============================================================================
      // ⚠️ CRITICAL: Browser wallets need ACTUAL addresses, not symbolic ⚠️
      // ============================================================================
      // Symbolic addresses (p2tr:0, p2wpkh:0) resolve to the SDK's DUMMY wallet.
      // Bug fixed: 2026-03-01 - see useSwapMutation.ts for full documentation.
      // ============================================================================
      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      // Unwrap outputs BTC to segwit address (or taproot if no segwit)
      // TypeScript can't infer from the early return that at least one address exists
      const toAddresses = useActualAddresses
        ? [(segwitAddress || taprootAddress)!]
        : ['p2wpkh:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      // JOURNAL ENTRY (2026-03-01): For single-address wallets, use primaryAddress
      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';

      console.log('[useUnwrapMutation] From addresses:', fromAddresses, '(browser:', isBrowserWallet, ')');
      console.log('[useUnwrapMutation] To addresses:', toAddresses);
      console.log('[useUnwrapMutation] Change address:', changeAddr);


      const result = await provider.alkanesExecuteTyped({
        toAddresses,
        inputRequirements,
        protostones: protostone,
        feeRate: unwrapData.feeRate,
        autoConfirm: false,
        fromAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
      });

      console.log('[useUnwrapMutation] Called alkanesExecuteTyped (browser:', isBrowserWallet, ')');

      console.log('[useUnwrapMutation] Execute result:', JSON.stringify(result, null, 2));

      // Handle auto-completed transaction
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[useUnwrapMutation] Transaction auto-completed, txid:', txId);
        return { success: true, transactionId: txId };
      }

      // Handle readyToSign state (need to sign PSBT manually)
      if (result?.readyToSign) {
        console.log('[useUnwrapMutation] Got readyToSign, signing PSBT...');
        const readyToSign = result.readyToSign;

        // Convert PSBT to base64
        let psbtBase64 = extractPsbtBase64(readyToSign.psbt);

        // ============================================================================
        // ⚠️ CRITICAL: PSBT PATCHING REMOVED - DO NOT RE-ADD ⚠️
        // ============================================================================
        // Date Removed: 2026-03-01 (same as useSwapMutation.ts fix)
        // See useSwapMutation.ts:444-483 for full documentation.
        //
        // alkanes-rs SDK creates PSBTs with correct real addresses for browser wallets.
        // patchPsbtForBrowserWallet was CORRUPTING these addresses.
        // ============================================================================

        console.log('[useUnwrapMutation] Using PSBT from SDK (addresses already correct, no patching needed)');

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
        let finalPsbtBase64 = psbtBase64;
        if (isBrowserWallet) {
          const result = patchInputsOnly({
            psbtBase64,
            network: btcNetwork,
            taprootAddress: taprootAddress!,
            segwitAddress,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
          });
          finalPsbtBase64 = result.psbtBase64;
          if (result.inputsPatched > 0) {
            console.log(`[useUnwrapMutation] Patched ${result.inputsPatched} input(s) for browser wallet compatibility`);
          }
        }

        // For keystore wallets, request user confirmation before signing
        if (walletType === 'keystore') {
          console.log('[useUnwrapMutation] Keystore wallet - requesting user confirmation...');
          const approved = await requestConfirmation({
            type: 'unwrap',
            title: 'Confirm Unwrap',
            fromAmount: unwrapData.amount,
            fromSymbol: 'frBTC',
            toAmount: unwrapData.amount,
            toSymbol: 'BTC',
            feeRate: unwrapData.feeRate,
          });

          if (!approved) {
            console.log('[useUnwrapMutation] User rejected transaction');
            throw new Error('Transaction rejected by user');
          }
          console.log('[useUnwrapMutation] User approved transaction');
        }

        // Sign PSBT — browser wallets sign all input types in a single call,
        // so we must NOT call signPsbt twice (causes "inputType: sh without redeemScript").
        let signedPsbtBase64: string;
        if (isBrowserWallet) {
          console.log('[useUnwrapMutation] Browser wallet: signing PSBT once (all input types)...');
          signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);
        } else {
          console.log('[useUnwrapMutation] Keystore: signing PSBT with SegWit, then Taproot...');
          signedPsbtBase64 = await signSegwitPsbt(finalPsbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        }

        // Finalize and extract transaction
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();

        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = tx.getId();

        console.log('[useUnwrapMutation] Transaction built:', txid);

        // Broadcast
        const broadcastTxid = await provider.broadcastTransaction(txHex);
        console.log('[useUnwrapMutation] Broadcast successful:', broadcastTxid);

        return {
          success: true,
          transactionId: broadcastTxid || txid,
        };
      }

      // Handle complete state
      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        console.log('[useUnwrapMutation] Complete, txid:', txId);
        return { success: true, transactionId: txId };
      }

      // Fallback
      const txId = result?.txid || result?.reveal_txid;
      console.log('[useUnwrapMutation] Transaction ID:', txId);
      return { success: true, transactionId: txId };
    },
    onSuccess: (data) => {
      console.log('[useUnwrapMutation] Unwrap successful, invalidating balance queries...');

      // Invalidate all balance-related queries to refresh UI immediately
      const walletAddress = account?.taproot?.address;

      // Invalidate sellable currencies (shows frBTC balance in swap UI)
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });

      // Invalidate BTC balance queries
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });

      // Invalidate frBTC premium data
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });

      // Invalidate pool-related queries
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      // Invalidate activity feed so it shows the new unwrap transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[useUnwrapMutation] Balance queries invalidated for address:', walletAddress);
    },
  });
}
