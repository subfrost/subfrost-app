/**
 * Wallet Capability Registry
 *
 * Maps wallet IDs to optional capabilities that the wallet extension exposes
 * directly. Only this module touches `window.<provider>` for capabilities —
 * mutations call the registry by wallet id and never reach into the DOM
 * themselves.
 *
 * ## Why a registry?
 *
 * Browser wallets inject their providers globally (`window.unisat`,
 * `window.oyl`, `window.XverseProviders`, etc.) the moment the user installs
 * the extension. Reaching into those globals from a mutation hook is unsafe
 * for two reasons:
 *
 *   1. The provider object exists even when the user is connected to a
 *      DIFFERENT wallet. Calling `window.unisat.getBitcoinUtxos()` while the
 *      user is signed in via Xverse triggers UniSat's "connect site" popup
 *      out of nowhere. This was the regression observed on 2026-04-28
 *      (mainnet swap: Xverse user got a UniSat prompt before the Xverse
 *      sign prompt).
 *
 *   2. Each mutation that wanted the same capability had to repeat the same
 *      `if (isBrowserWallet && window.unisat?.x)` boilerplate, which is
 *      easy to write incorrectly (the bug above) and impossible to extend
 *      to other wallets without N parallel changes.
 *
 * ## How it works
 *
 * Each wallet that supports a capability registers an adapter under its id
 * in the `CAPABILITIES` map. The public functions in this module dispatch
 * on the connected wallet id and invoke the adapter — or return `null` if
 * the wallet doesn't support the capability. There is no fallback to
 * "another wallet's API" — by construction, only the active wallet's
 * adapter runs.
 *
 * Adding a new wallet capability:
 *   1. Add the wallet's adapter to `CAPABILITIES[walletId]`.
 *   2. Mutations automatically benefit. Done.
 *
 * Adding a new capability shape:
 *   1. Add an optional method to `WalletCapabilities`.
 *   2. Implement it in whichever wallet adapters expose it.
 *   3. Add a public `<capability>ForWallet(walletId)` dispatcher below.
 *
 * ## Today's capability surface
 *
 * - `getCleanBtcUtxos()` — returns spendable BTC UTXOs filtered by the
 *   wallet itself to exclude inscriptions/runes. Currently only UniSat
 *   exposes this; other wallets return `null` and the SDK falls back to
 *   its own UTXO selection. The safety mechanism for those wallets is
 *   `ordinals_strategy: 'preserve'` in the SDK (per-UTXO ord_outputs scan
 *   + alkane-aware `build_split_psbt`) plus the `cachedUtxos` alkane
 *   filter in `lib/alkanes/execute.ts`. `getCleanBtcUtxos` is a perf
 *   shortcut that lets us trust UniSat's own indexer instead of running
 *   our own ord-output fanout — not a safety invariant. OYL, Xverse,
 *   Phantom, and OKX rely entirely on the SDK preserve path.
 *
 * Source: bug report 2026-04-28 — Xverse-connected user got a stray UniSat
 * "connect site" popup on swap because both swap and wrap mutations probed
 * `window.unisat.getBitcoinUtxos()` whenever any browser wallet was active.
 */

/**
 * Wallet ID literal type. Mirrors `WalletId` in `browserWalletSigning.ts`
 * but tolerates the broader set of ids declared in `constants/wallets.ts`
 * (oyl, okx, tokeo, leather, phantom, magic-eden, orange, wizz, keplr, ...).
 * Using `string` keeps the registry open-ended without forcing a type
 * change every time a new wallet is added.
 */
export type ConnectedWalletId = string | null | undefined;

/**
 * UTXO outpoint string accepted by the alkanes-rs SDK for the
 * `payment_utxos` option. Format: `<txid>:<vout>:<satoshis>`.
 */
export type PaymentUtxoString = string;

/**
 * Per-wallet capability surface. All methods are optional; a wallet only
 * needs to implement what it actually exposes.
 */
interface WalletCapabilities {
  /**
   * Returns BTC-only spendable UTXOs (no inscriptions, no runes, no
   * alkanes) as `txid:vout:sats` strings — already in the format the
   * alkanes-rs SDK consumes via `payment_utxos`.
   *
   * Returns `null` if the wallet API is unavailable or fails.
   */
  getCleanBtcUtxos?: () => Promise<PaymentUtxoString[] | null>;

  /**
   * Native BTC send. The wallet picks UTXOs (skipping inscriptions / runes /
   * alkanes per its own asset detection), builds, signs, and broadcasts a
   * transaction internally; returns the broadcast txid. Resolves to `null`
   * when the wallet doesn't expose the API on this version — caller falls
   * back to a manual PSBT path. Errors (user rejection, network failure,
   * insufficient funds) are bubbled up via `throw`.
   */
  sendBtc?: (toAddress: string, satoshis: number, feeRate: number) => Promise<string | null>;
}

/**
 * UniSat-specific adapters. Lives entirely behind the registry — no other
 * file in the app should touch `window.unisat` for capability calls (signing
 * is handled separately in `browserWalletSigning.ts`).
 */
const unisatCapabilities: WalletCapabilities = {
  async getCleanBtcUtxos() {
    if (typeof window === 'undefined') return null;
    const unisat = (window as any).unisat;
    if (!unisat?.getBitcoinUtxos) return null;
    try {
      const btcUtxos = await unisat.getBitcoinUtxos();
      if (!btcUtxos?.length) return null;
      return btcUtxos.map((u: any) => `${u.txid}:${u.vout}:${u.satoshis}`);
    } catch {
      // Wallet rejected, locked, or API errored — let the SDK fall back to lua.
      return null;
    }
  },
  async sendBtc(toAddress, satoshis, feeRate) {
    if (typeof window === 'undefined') return null;
    const unisat = (window as any).unisat;
    if (!unisat?.sendBitcoin) return null;
    // Errors (user rejection, insufficient funds, network) propagate to caller.
    return await unisat.sendBitcoin(toAddress, satoshis, { feeRate });
  },
};

/**
 * Master registry. Add new wallet entries here as their extensions ship the
 * relevant APIs. Wallets without an entry simply don't have any capabilities
 * registered — calls return `null` and the SDK takes its default path.
 */
const CAPABILITIES: Record<string, WalletCapabilities> = {
  unisat: unisatCapabilities,

  // OKX intentionally absent — relies on the SDK's `'preserve'` mode for
  // inscription/rune safety (matches OYL/Xverse/Phantom). Add an entry only
  // if OKX ships a `getBitcoinUtxos`-equivalent in a future version.
  //
  // Other wallets without entries (oyl, xverse, tokeo, leather, phantom, ...)
  // follow the same pattern.
};

/**
 * Dispatch a capability call to the connected wallet's adapter.
 *
 * @internal — exported only for tests; mutations should use the named
 * helpers below.
 */
export function getCapability<K extends keyof WalletCapabilities>(
  walletId: ConnectedWalletId,
  capability: K,
): WalletCapabilities[K] | undefined {
  if (!walletId) return undefined;
  const adapter = CAPABILITIES[walletId];
  return adapter?.[capability];
}

/**
 * Public helper: get clean BTC UTXOs from the connected wallet, or `null`
 * if the wallet doesn't expose the capability or the call fails.
 *
 * Mutations should call this once per transaction build:
 *
 * ```ts
 * const paymentUtxos = await getCleanBtcUtxosForWallet(browserWallet?.info?.id);
 * await provider.alkanesExecuteTyped({ ..., paymentUtxos: paymentUtxos ?? undefined });
 * ```
 *
 * Returning `null` (rather than `[]`) is intentional: an empty array would
 * tell the SDK "this wallet has zero clean UTXOs" and the build would fail.
 * `null` means "no preference, use your own UTXO selection" — the safe
 * default for non-UniSat wallets.
 */
export async function getCleanBtcUtxosForWallet(
  walletId: ConnectedWalletId,
): Promise<PaymentUtxoString[] | null> {
  const fn = getCapability(walletId, 'getCleanBtcUtxos');
  if (!fn) return null;
  return fn();
}

/**
 * Public helper: ask the connected wallet to send BTC natively. Returns the
 * broadcast txid on success, or `null` when the wallet doesn't expose the
 * API (caller should fall back to a manual PSBT pipeline). Errors are
 * thrown — not swallowed — so user rejection / insufficient funds / network
 * failures surface to the caller.
 *
 * UniSat is the only wallet supported today (`window.unisat.sendBitcoin`).
 * UniSat's own asset detection guarantees no UTXO carrying inscriptions /
 * runes / alkanes is spent, which is the safety property we'd otherwise
 * need to enforce client-side via per-UTXO `protorunesbyoutpoint` lookups.
 */
export async function sendBtcViaWallet(
  walletId: ConnectedWalletId,
  toAddress: string,
  satoshis: number,
  feeRate: number,
): Promise<string | null> {
  const fn = getCapability(walletId, 'sendBtc');
  if (!fn) return null;
  return fn(toAddress, satoshis, feeRate);
}
