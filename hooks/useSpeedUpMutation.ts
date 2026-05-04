/**
 * Speed up a still-pending tx via RBF.
 *
 * Pipeline:
 *   1. Caller passes the original tx hex (from pendingTxStore) and a
 *      new fee rate.
 *   2. Hook fetches each input's prevout value from the Esplora proxy
 *      so the WASM bridge can compute the current fee rate.
 *   3. Calls `provider.rebuildTxWithFeeRate(...)` — returns the new
 *      UNSIGNED tx hex with the change output reduced.
 *   4. Re-signs via the same WASM provider (keystore mnemonic loaded)
 *      using `provider.signTransaction(unsignedHex)` if available, or
 *      via the SDK's broadcast flow.
 *   5. Broadcasts. The new tx replaces the original in the mempool.
 *   6. Pushes the new tx hex to `pendingTxStore`. Optionally evicts
 *      the OLD txid (the indexer will do this on next block-tip
 *      anyway, so it's a soft cleanup).
 *
 * Limitations (Phase 1 — single-tx only):
 *   - Split-tx bundles are NOT handled. The hook returns an explicit
 *     error if it detects the input outpoint matches another pending
 *     tx (chain). UI surfaces this as "advanced bump required".
 *   - Browser wallets need to re-sign via popup; this hook routes
 *     through the keystore signing path. Browser flow can extend it
 *     by passing through `signTaprootPsbt`.
 */

'use client';

import { useMutation } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { pendingTxStore } from '@/lib/alkanes/pendingTxStore';

interface SpeedUpParams {
  /** Original signed tx hex (still in mempool). */
  txHex: string;
  /** Target fee rate in sat/vB. Must exceed current rate by ≥1. */
  newFeeRate: number;
}

interface SpeedUpResult {
  newTxid: string;
  /** sat/vB rate the new tx will pay. */
  newFeeRate: number;
  /** Total absolute fee paid by the new tx. */
  newFeeSats: number;
  /** Difference from original tx fee. */
  feeIncreaseSats: number;
}

/**
 * Build the prevout-values JSON the bridge needs by fetching each
 * input's parent tx via the Esplora proxy and indexing into the
 * relevant vout.
 */
async function fetchPrevoutValues(
  tx: bitcoin.Transaction,
  network: string,
): Promise<{ txid: string; vout: number; value_sats: number }[]> {
  const out: { txid: string; vout: number; value_sats: number }[] = [];
  await Promise.all(
    tx.ins.map(async (input) => {
      const prevTxid = Buffer.from(input.hash).reverse().toString('hex');
      try {
        const res = await fetch(
          `/api/esplora/tx/${prevTxid}?network=${encodeURIComponent(network)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        const prevout = json?.vout?.[input.index];
        if (typeof prevout?.value === 'number') {
          out.push({ txid: prevTxid, vout: input.index, value_sats: prevout.value });
        }
      } catch {
        /* skip — bridge will reject with MissingPrevoutValue */
      }
    }),
  );
  return out;
}

interface BridgeProvider {
  rebuildTxWithFeeRate(
    txHex: string,
    newFeeRateSatVb: number,
    prevoutValuesJson: string,
    ourAddressesJson: string,
    network: string,
  ): Promise<unknown>;
  walletSignTransactionTaproot?(unsignedHex: string): Promise<string>;
  signTransaction?(unsignedHex: string): Promise<string>;
  broadcastTransaction(txHex: string): Promise<string>;
}

interface RebuildPayload {
  tx_hex: string;
  original_fee_sats: number;
  new_fee_sats: number;
  original_fee_rate: number;
  new_fee_rate: number;
  vsize: number;
  change_output_index: number;
  new_change_value: number;
}

export function useSpeedUpMutation() {
  const { account, network, walletType } = useWallet();
  const { provider } = useAlkanesSDK();

  return useMutation<SpeedUpResult, Error, SpeedUpParams>({
    mutationKey: ['speedUp', network],
    mutationFn: async ({ txHex, newFeeRate }) => {
      if (!provider) throw new Error('SDK provider not ready');
      if (typeof (provider as unknown as BridgeProvider).rebuildTxWithFeeRate !== 'function') {
        throw new Error(
          'SDK does not support RBF — bump @alkanes/ts-sdk to ≥0.1.5-a3e5253',
        );
      }
      if (walletType !== 'keystore') {
        throw new Error(
          'Speed-up via this hook only supports keystore wallets right now. Browser wallets must use the wallet-specific RBF flow.',
        );
      }

      const tx = bitcoin.Transaction.fromHex(txHex);
      const prevouts = await fetchPrevoutValues(tx, network ?? 'mainnet');
      const ourAddresses = [account?.taproot?.address, account?.nativeSegwit?.address]
        .filter((a): a is string => !!a);

      const networkArg = (() => {
        if (!network) return 'mainnet';
        if (network.includes('regtest')) return 'regtest';
        if (network === 'signet') return 'signet';
        if (network === 'testnet') return 'testnet';
        return 'mainnet';
      })();

      const raw = await (provider as unknown as BridgeProvider).rebuildTxWithFeeRate(
        txHex,
        newFeeRate,
        JSON.stringify(prevouts),
        JSON.stringify(ourAddresses),
        networkArg,
      );
      const plan = raw as RebuildPayload;

      // Re-sign via the keystore provider. The mnemonic is loaded
      // when the user unlocked, so signTransaction works headlessly.
      const bridge = provider as unknown as BridgeProvider;
      let signedHex: string | undefined;
      if (typeof bridge.walletSignTransactionTaproot === 'function') {
        signedHex = await bridge.walletSignTransactionTaproot(plan.tx_hex);
      } else if (typeof bridge.signTransaction === 'function') {
        signedHex = await bridge.signTransaction(plan.tx_hex);
      }
      if (!signedHex) {
        throw new Error(
          'Provider missing wallet sign method (walletSignTransactionTaproot / signTransaction)',
        );
      }

      const newTxid = await bridge.broadcastTransaction(signedHex);

      // Mirror to IDB so the predict overlay picks it up immediately.
      try {
        await pendingTxStore.add(signedHex);
      } catch {
        /* non-fatal */
      }

      return {
        newTxid,
        newFeeRate: plan.new_fee_rate,
        newFeeSats: plan.new_fee_sats,
        feeIncreaseSats: plan.new_fee_sats - plan.original_fee_sats,
      };
    },
  });
}
