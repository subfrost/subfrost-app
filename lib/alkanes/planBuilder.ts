/**
 * Build a `TxPlan` from a not-yet-broadcast PSBT (or unsigned tx hex)
 * + the prefetched wallet UTXO cache. Mutation hooks call this right
 * before `requestConfirmation` so the keystore confirm modal can show
 * the user exactly which UTXOs are being spent and which outputs are
 * being created.
 *
 * Why this lives in `lib/alkanes/` rather than as a hook: it's a pure
 * function over (psbt, cache, addresses) → plan. The mutation hooks
 * call it inside their async mutationFn where React hooks aren't
 * available. The cache + addresses come in as args.
 *
 * What it doesn't do: cellpack-aware alkane output prediction (i.e.
 * for swap/addLiq the output side amounts depend on contract state).
 * Callers that have a quote (from `usePoolStateLive` or `useSwapQuotes`)
 * pass the predicted outputs in via `outputAlkaneOverrides` keyed by
 * output index — those override the edict-derived (or empty) alkanes
 * with `uncertain: true` set so the modal shows the "≈" prefix.
 */

import * as bitcoin from 'bitcoinjs-lib';
import type {
  PlanInput,
  PlanOutput,
  PlanAlkaneEntry,
  TxPlan,
} from '@/context/TransactionConfirmContext';
import type { CachedUtxo, WalletUtxoCache } from '@/queries/account';

const TAPROOT_PREFIX = Buffer.from([0x51, 0x20]);
const OP_RETURN = 0x6a;

/** Decode a script to a bech32/base58 address, or null for OP_RETURN. */
function scriptToAddress(script: Buffer, network: bitcoin.Network): string | null {
  if (script.length > 0 && script[0] === OP_RETURN) return null;
  // Try every network format until one parses; mainnet/testnet/regtest
  // all have distinct HRPs so the first match wins.
  for (const net of [network, bitcoin.networks.bitcoin, bitcoin.networks.testnet, bitcoin.networks.regtest]) {
    try {
      return bitcoin.address.fromOutputScript(script, net);
    } catch {
      /* continue */
    }
  }
  // Manual P2TR fallback (bitcoinjs-lib v7 dropped this from fromOutputScript
  // on some networks).
  if (
    script.length === 34 &&
    script[0] === TAPROOT_PREFIX[0] &&
    script[1] === TAPROOT_PREFIX[1]
  ) {
    return null; // can't infer HRP without knowing the network — caller should pass network
  }
  return null;
}

export interface BuildPlanArgs {
  /** Either a PSBT (base64 or hex) or a raw unsigned tx hex. */
  psbtBase64?: string;
  txHex?: string;
  /** Pre-warmed UTXO cache from `useWalletUtxoCache`. */
  cache: WalletUtxoCache;
  /** Wallet's owned addresses. */
  ourAddresses: string[];
  /** bitcoinjs network constant. */
  network: bitcoin.Network;
  /** sat/vB rate for display. */
  feeRateSatVb?: number;
  /** Optional plan label/summary. */
  label?: string;
  summary?: string;
  /**
   * Per-output-index overrides for alkane amounts. Used when the caller
   * has a contract quote (swap output prediction, LP receive prediction)
   * that the unsigned tx alone can't reveal.
   */
  outputAlkaneOverrides?: Record<number, PlanAlkaneEntry[]>;
  /**
   * Per-output-index override for `isOurs`. Useful when our address
   * detection misses an address (e.g. for non-standard paths). Most
   * callers omit this.
   */
  outputOursOverrides?: Record<number, boolean>;
}

export function buildPlanFromTx(args: BuildPlanArgs): TxPlan {
  const { cache, ourAddresses, network, feeRateSatVb, label, summary } = args;
  let tx: bitcoin.Transaction;
  if (args.txHex) {
    tx = bitcoin.Transaction.fromHex(args.txHex);
  } else if (args.psbtBase64) {
    const psbt = bitcoin.Psbt.fromBase64(args.psbtBase64, { network });
    // PSBT.unsignedTx is the underlying Transaction.
    tx = (psbt as unknown as { __CACHE: { __TX: bitcoin.Transaction } }).__CACHE.__TX;
  } else {
    throw new Error('buildPlanFromTx: provide psbtBase64 or txHex');
  }

  const ourSet = new Set(ourAddresses);

  // Inputs — annotate with cached prevout info when we own them.
  const inputs: PlanInput[] = tx.ins.map((vin) => {
    const txid = Buffer.from(vin.hash).reverse().toString('hex');
    const cached: CachedUtxo | undefined = cache.byOutpoint.get(`${txid}:${vin.index}`);
    const alkanes: PlanAlkaneEntry[] | undefined = cached?.alkanes.length
      ? cached.alkanes.map((a) => ({
          alkaneId: `${a.block}:${a.tx}`,
          amount: a.amount,
        }))
      : undefined;
    return {
      txid,
      vout: vin.index,
      valueSats: cached?.value ?? 0,
      address: cached?.address,
      isOurs: cached ? ourSet.has(cached.address) : false,
      alkanes,
    };
  });

  // Outputs — annotate with addresses and override alkanes when we have a quote.
  const outputs: PlanOutput[] = tx.outs.map((vout, idx) => {
    const script = Buffer.from(vout.script);
    const addr = scriptToAddress(script, network);
    const isOpReturn = script.length > 0 && script[0] === OP_RETURN;
    const isOurs =
      args.outputOursOverrides?.[idx] ??
      (!!addr && ourSet.has(addr));
    const alkanes = args.outputAlkaneOverrides?.[idx];
    return {
      address: addr,
      valueSats: Number(vout.value),
      isOpReturn,
      isOurs,
      alkanes,
    };
  });

  const totalIn = inputs.reduce((acc, i) => acc + i.valueSats, 0);
  const totalOut = outputs.reduce((acc, o) => acc + o.valueSats, 0);
  const feeSats = Math.max(0, totalIn - totalOut);

  return {
    label,
    summary,
    inputs,
    outputs,
    feeSats,
    feeRateSatVb,
  };
}
