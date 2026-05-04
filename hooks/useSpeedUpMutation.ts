/**
 * Speed up a still-pending tx via RBF.
 *
 * Pipeline:
 *   1. Caller passes the original tx hex (from pendingTxStore) and a
 *      new fee rate.
 *   2. Hook fetches each input's prevout (value + scriptpubkey) from
 *      the Esplora proxy. The bridge needs values to compute the
 *      original fee rate; the browser-wallet sign path additionally
 *      needs scriptpubkey for PSBT witnessUtxo.
 *   3. Calls `provider.rebuildTxWithFeeRate(...)` — returns the new
 *      UNSIGNED tx hex with the change output reduced.
 *   4. Re-signs:
 *      - keystore: uses the WASM provider's sign method headlessly
 *        (mnemonic is already loaded).
 *      - browser wallet: builds a PSBT (witnessUtxo + tapInternalKey
 *        per input), hands to `signTaprootPsbt` from WalletContext,
 *        finalizes, extracts the broadcast hex.
 *   5. Broadcasts. The new tx replaces the original in the mempool.
 *   6. Pushes the new tx hex to `pendingTxStore` so the predict
 *      overlay picks it up immediately.
 *
 * Limitations (Phase 2 — single-tx only):
 *   - Split-tx bundles are NOT handled. The bridge call would
 *     succeed (rebuilding the leaf tx in isolation), but the parent
 *     split tx would still be unaffected, which is fine when only
 *     the leaf is in our pending store. Fully bundled RBF (rebuild
 *     parent + chain leaves with new outpoints) lands in Phase 3.
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

interface PrevoutInfo {
  txid: string;
  vout: number;
  value_sats: number;
  scriptpubkey: string; // hex
}

/**
 * Fetch each input's prevout (value + scriptpubkey) via the Esplora
 * proxy. Both fields are needed: the cargo bridge takes value to
 * compute the original fee rate; the browser-wallet PSBT builder
 * also needs scriptpubkey for witnessUtxo.
 */
async function fetchPrevoutInfo(
  tx: bitcoin.Transaction,
  network: string,
): Promise<PrevoutInfo[]> {
  const out: PrevoutInfo[] = [];
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
        if (
          typeof prevout?.value === 'number' &&
          typeof prevout?.scriptpubkey === 'string'
        ) {
          out.push({
            txid: prevTxid,
            vout: input.index,
            value_sats: prevout.value,
            scriptpubkey: prevout.scriptpubkey,
          });
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
  rebuildBundleWithFeeRate?(
    parentTxHex: string,
    childTxHex: string,
    newFeeRateSatVb: number,
    parentPrevoutValuesJson: string,
    extraChildPrevoutValuesJson: string,
    ourAddressesJson: string,
    network: string,
  ): Promise<unknown>;
  pendingTxStoreList?(): Promise<unknown>;
  walletSignPsbtBase64?(psbtBase64: string): Promise<string>;
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

interface BundleRebuildPayload {
  parent_tx_hex: string;
  child_tx_hex: string;
  original_total_fee_sats: number;
  new_total_fee_sats: number;
  original_total_vsize: number;
  new_total_vsize: number;
  new_fee_rate: number;
  parent_change_output_index: number;
  child_change_output_index: number;
}

/**
 * Detect whether `childTx` chains from any tx in `parentCandidates`.
 * Returns the parent hex if found, else undefined.
 *
 * Exported for vitest. The hook uses this to decide between single-tx
 * and bundle RBF — if a child's input prev_outpoint references another
 * pending tx in our store, that's a split→main chain.
 */
export function findParentInPending(
  childTx: bitcoin.Transaction,
  parentCandidates: { txid: string; hex: string }[],
): { hex: string; txid: string } | undefined {
  const candidateTxids = new Set(parentCandidates.map((c) => c.txid));
  for (const input of childTx.ins) {
    const prevTxid = Buffer.from(input.hash).reverse().toString('hex');
    if (candidateTxids.has(prevTxid)) {
      return parentCandidates.find((c) => c.txid === prevTxid);
    }
  }
  return undefined;
}

/**
 * Map the app's network string to bitcoinjs-lib's Network constant.
 */
function bitcoinNetworkFor(network: string | undefined): bitcoin.Network {
  if (!network) return bitcoin.networks.bitcoin;
  if (network.includes('regtest')) return bitcoin.networks.regtest;
  if (network === 'signet' || network === 'testnet') return bitcoin.networks.testnet;
  return bitcoin.networks.bitcoin;
}

/**
 * Build a PSBT from an unsigned tx hex by re-attaching witnessUtxo
 * data per input. For taproot inputs, also patches in `tapInternalKey`
 * so browser wallets that scrutinize PSBTs (Xverse, OKX) can sign.
 *
 * Exported so the vitest mirror can pin the shape.
 */
export function buildPsbtForRbf(params: {
  unsignedHex: string;
  prevouts: PrevoutInfo[];
  taprootXOnlyHex?: string;
  network: bitcoin.Network;
}): bitcoin.Psbt {
  const { unsignedHex, prevouts, taprootXOnlyHex, network } = params;
  const tx = bitcoin.Transaction.fromHex(unsignedHex);
  const psbt = new bitcoin.Psbt({ network });
  psbt.setVersion(tx.version);
  psbt.setLocktime(tx.locktime);

  for (const input of tx.ins) {
    const txid = Buffer.from(input.hash).reverse().toString('hex');
    const vout = input.index;
    const prev = prevouts.find((p) => p.txid === txid && p.vout === vout);
    if (!prev) {
      throw new Error(`prevout missing for ${txid}:${vout}`);
    }
    const script = Buffer.from(prev.scriptpubkey, 'hex');
    const inputData: Parameters<bitcoin.Psbt['addInput']>[0] = {
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: { script, value: BigInt(prev.value_sats) },
    };
    // Detect P2TR (segwit v1): OP_1 + 32-byte program.
    const isTaproot =
      script.length === 34 && script[0] === 0x51 && script[1] === 0x20;
    if (isTaproot && taprootXOnlyHex) {
      inputData.tapInternalKey = Buffer.from(taprootXOnlyHex, 'hex');
    }
    psbt.addInput(inputData);
  }

  for (const output of tx.outs) {
    psbt.addOutput({
      script: output.script,
      value: BigInt(output.value),
    });
  }

  return psbt;
}

// ---------------------------------------------------------------------------
// Bundle RBF — runs the parent + child rebuild and re-signs both.
// ---------------------------------------------------------------------------

interface BundleRbfArgs {
  parentHex: string;
  childHex: string;
  newFeeRate: number;
  newFeeRateArg: number;
  ourAddresses: string[];
  networkArg: string;
  network: string | undefined;
  walletType: string | undefined;
  account: ReturnType<typeof useWallet>['account'];
  signTaprootPsbt: ReturnType<typeof useWallet>['signTaprootPsbt'];
  bridge: BridgeProvider;
}

async function runBundleRbf(args: BundleRbfArgs): Promise<SpeedUpResult> {
  const {
    parentHex,
    childHex,
    newFeeRate,
    networkArg,
    network,
    ourAddresses,
    walletType,
    account,
    signTaprootPsbt,
    bridge,
  } = args;

  // Fetch prevouts for parent + child external inputs separately.
  const parentTx = bitcoin.Transaction.fromHex(parentHex);
  const childTx = bitcoin.Transaction.fromHex(childHex);
  const parentPrevouts = await fetchPrevoutInfo(parentTx, network ?? 'mainnet');
  // child_extra: all child inputs whose prev_outpoint is NOT the parent.
  const parentTxid = parentTx.getId();
  const childAllPrevouts = await fetchPrevoutInfo(childTx, network ?? 'mainnet');
  const childExtra = childAllPrevouts.filter((p) => p.txid !== parentTxid);

  if (typeof bridge.rebuildBundleWithFeeRate !== 'function') {
    throw new Error('SDK missing rebuildBundleWithFeeRate — bump @alkanes/ts-sdk');
  }

  const raw = await bridge.rebuildBundleWithFeeRate(
    parentHex,
    childHex,
    newFeeRate,
    JSON.stringify(
      parentPrevouts.map(({ txid, vout, value_sats }) => ({ txid, vout, value_sats })),
    ),
    JSON.stringify(
      childExtra.map(({ txid, vout, value_sats }) => ({ txid, vout, value_sats })),
    ),
    JSON.stringify(ourAddresses),
    networkArg,
  );
  const plan = raw as BundleRebuildPayload;

  // Re-sign both. Parent: use its own prevouts. Child: parent's
  // (post-rebuild) outputs at the chained vout + child's external
  // prevouts. We reconstruct the child's full prevout set by parsing
  // the new parent and taking the outputs it now exposes.
  const newParentTx = bitcoin.Transaction.fromHex(plan.parent_tx_hex);
  const newParentTxid = newParentTx.getId();
  const childChainedPrevouts: PrevoutInfo[] = [];
  const tempChild = bitcoin.Transaction.fromHex(plan.child_tx_hex);
  for (const input of tempChild.ins) {
    const inTxid = Buffer.from(input.hash).reverse().toString('hex');
    if (inTxid === newParentTxid) {
      const out = newParentTx.outs[input.index];
      if (!out) {
        throw new Error(
          `child references new parent ${inTxid}:${input.index} but output missing`,
        );
      }
      childChainedPrevouts.push({
        txid: inTxid,
        vout: input.index,
        value_sats: Number(out.value),
        scriptpubkey: Buffer.from(out.script).toString('hex'),
      });
    }
  }
  const childPrevoutsForSigning = [...childChainedPrevouts, ...childExtra];

  const xOnly =
    account?.taproot?.pubKeyXOnly ??
    (() => {
      const pk = account?.taproot?.pubkey;
      if (!pk) return undefined;
      return pk.length === 66 ? pk.slice(2) : pk;
    })();

  const signOne = async (
    unsignedHex: string,
    prevoutsForSigning: PrevoutInfo[],
  ): Promise<string> => {
    if (walletType === 'keystore') {
      if (typeof bridge.walletSignPsbtBase64 !== 'function') {
        throw new Error('keystore: provider missing walletSignPsbtBase64');
      }
      const psbt = buildPsbtForRbf({
        unsignedHex,
        prevouts: prevoutsForSigning,
        taprootXOnlyHex: xOnly,
        network: bitcoinNetworkFor(network),
      });
      return await bridge.walletSignPsbtBase64(psbt.toBase64());
    }
    if (walletType === 'browser') {
      if (!xOnly) throw new Error('browser wallet missing taproot pubkey');
      const psbt = buildPsbtForRbf({
        unsignedHex,
        prevouts: prevoutsForSigning,
        taprootXOnlyHex: xOnly,
        network: bitcoinNetworkFor(network),
      });
      const signedPsbtBase64 = await signTaprootPsbt(psbt.toBase64());
      const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, {
        network: bitcoinNetworkFor(network),
      });
      try {
        return signedPsbt.extractTransaction().toHex();
      } catch {
        signedPsbt.finalizeAllInputs();
        return signedPsbt.extractTransaction().toHex();
      }
    }
    throw new Error(`unsupported walletType=${walletType ?? 'unknown'}`);
  };

  const signedParentHex = await signOne(plan.parent_tx_hex, parentPrevouts);
  const signedChildHex = await signOne(plan.child_tx_hex, childPrevoutsForSigning);

  // Broadcast parent first (mempool will reject child if parent
  // isn't there yet). Then child. The mempool-replacement is atomic
  // from the user's perspective.
  const newParentBroadcastTxid = await bridge.broadcastTransaction(signedParentHex);
  const newChildBroadcastTxid = await bridge.broadcastTransaction(signedChildHex);

  // Mirror BOTH new hexes into IDB so the predict overlay updates.
  try {
    await pendingTxStore.add(signedParentHex);
    await pendingTxStore.add(signedChildHex);
  } catch {
    /* non-fatal */
  }

  return {
    newTxid: newChildBroadcastTxid,
    newFeeRate: plan.new_fee_rate,
    newFeeSats: plan.new_total_fee_sats,
    feeIncreaseSats: plan.new_total_fee_sats - plan.original_total_fee_sats,
  };

  // The parent txid is informational; surface via console for now.
  // (Future UI: show "new parent txid + new child txid" in the modal.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = newParentBroadcastTxid;
}

export function useSpeedUpMutation() {
  const { account, network, walletType, signTaprootPsbt } = useWallet();
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

      const tx = bitcoin.Transaction.fromHex(txHex);
      const prevouts = await fetchPrevoutInfo(tx, network ?? 'mainnet');
      const ourAddresses = [account?.taproot?.address, account?.nativeSegwit?.address]
        .filter((a): a is string => !!a);

      const networkArg = (() => {
        if (!network) return 'mainnet';
        if (network.includes('regtest')) return 'regtest';
        if (network === 'signet') return 'signet';
        if (network === 'testnet') return 'testnet';
        return 'mainnet';
      })();

      const prevoutValuesPayload = prevouts.map(({ txid, vout, value_sats }) => ({
        txid,
        vout,
        value_sats,
      }));

      const bridge = provider as unknown as BridgeProvider;

      // -----------------------------------------------------------
      // Bundle detection: if any of `txHex`'s inputs reference
      // another pending tx in our store, that other tx is the
      // PARENT (split) and `txHex` is the CHILD (main). We must
      // rebuild both atomically — replacing only the child would
      // leave the parent in mempool with a stale fee, and replacing
      // only the parent orphans the child.
      // -----------------------------------------------------------
      const pendingHexes: string[] = [];
      try {
        const list = await pendingTxStore.list();
        for (const h of list) if (h !== txHex) pendingHexes.push(h);
      } catch {
        /* non-fatal — bundle detection just won't fire */
      }
      // Also pull from the WASM in-memory store.
      if (typeof bridge.pendingTxStoreList === 'function') {
        try {
          const wasmList = await bridge.pendingTxStoreList();
          if (Array.isArray(wasmList)) {
            for (const h of wasmList) {
              if (typeof h === 'string' && h !== txHex && !pendingHexes.includes(h)) {
                pendingHexes.push(h);
              }
            }
          }
        } catch {
          /* non-fatal */
        }
      }
      const parentCandidates = pendingHexes
        .map((hex) => {
          try {
            return { hex, txid: bitcoin.Transaction.fromHex(hex).getId() };
          } catch {
            return undefined;
          }
        })
        .filter((c): c is { hex: string; txid: string } => !!c);
      const parentInPending = findParentInPending(tx, parentCandidates);

      if (parentInPending && typeof bridge.rebuildBundleWithFeeRate === 'function') {
        return runBundleRbf({
          parentHex: parentInPending.hex,
          childHex: txHex,
          newFeeRate,
          newFeeRateArg: newFeeRate,
          ourAddresses,
          networkArg,
          network: network ?? undefined,
          walletType: walletType ?? undefined,
          account,
          signTaprootPsbt,
          bridge,
        });
      }

      const raw = await bridge.rebuildTxWithFeeRate(
        txHex,
        newFeeRate,
        JSON.stringify(prevoutValuesPayload),
        JSON.stringify(ourAddresses),
        networkArg,
      );
      const plan = raw as RebuildPayload;

      let broadcastHex: string | undefined;

      if (walletType === 'keystore') {
        // Headless sign via the WASM provider's walletSignPsbtBase64 —
        // the keystore mnemonic is loaded at unlock, so this method
        // signs + finalizes + extracts the tx in one call. Returns
        // ready-to-broadcast hex.
        if (typeof bridge.walletSignPsbtBase64 !== 'function') {
          throw new Error(
            'Provider missing walletSignPsbtBase64 — bump @alkanes/ts-sdk to ≥0.1.5-138a9cf',
          );
        }
        const xOnly =
          account?.taproot?.pubKeyXOnly ??
          (() => {
            const pk = account?.taproot?.pubkey;
            if (!pk) return undefined;
            return pk.length === 66 ? pk.slice(2) : pk;
          })();
        try {
          const psbt = buildPsbtForRbf({
            unsignedHex: plan.tx_hex,
            prevouts,
            taprootXOnlyHex: xOnly,
            network: bitcoinNetworkFor(network),
          });
          broadcastHex = await bridge.walletSignPsbtBase64(psbt.toBase64());
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const stack = e instanceof Error && e.stack ? `\n${e.stack.slice(0, 400)}` : '';
          throw new Error(`keystore sign failed: ${msg}${stack}`);
        }
      } else if (walletType === 'browser') {
        // Browser wallet: build PSBT, hand to signTaprootPsbt, finalize.
        // Prefer the already-x-only field if WalletContext exposes it
        // (saves the slice and makes the call safe regardless of which
        // wallet returned the public key).
        const xOnly =
          account?.taproot?.pubKeyXOnly ??
          (() => {
            const pk = account?.taproot?.pubkey;
            if (!pk) return undefined;
            return pk.length === 66 ? pk.slice(2) : pk;
          })();
        if (!xOnly) {
          throw new Error('Browser wallet missing taproot public key — reconnect');
        }
        const psbt = buildPsbtForRbf({
          unsignedHex: plan.tx_hex,
          prevouts,
          taprootXOnlyHex: xOnly,
          network: bitcoinNetworkFor(network),
        });
        const signedPsbtBase64 = await signTaprootPsbt(psbt.toBase64());
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, {
          network: bitcoinNetworkFor(network),
        });
        // UniSat returns finalized; Xverse / OYL / OKX return un-finalized.
        let txObj: bitcoin.Transaction;
        try {
          txObj = signedPsbt.extractTransaction();
        } catch {
          signedPsbt.finalizeAllInputs();
          txObj = signedPsbt.extractTransaction();
        }
        broadcastHex = txObj.toHex();
      } else {
        throw new Error(`Speed-up not supported for walletType=${walletType ?? 'unknown'}`);
      }

      const newTxid = await bridge.broadcastTransaction(broadcastHex);

      // Mirror to IDB so the predict overlay picks it up immediately.
      try {
        await pendingTxStore.add(broadcastHex);
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
