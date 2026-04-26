/**
 * Per-network capability matrix for deployed alkane contracts.
 *
 * The opcode interface a contract implements is fixed at deploy time. We do
 * NOT runtime-probe contracts to discover their interface — the source code
 * IS the interface, and the network's deployed version determines which
 * features the frontend can use.
 *
 * When a contract is upgraded on a network, update this file to reflect the
 * new capability set. The reference is the contract source in
 * `reference/subfrost-alkanes/alkanes/<contract-name>/alkanes.toml` —
 * specifically the `[opcodes]` table.
 *
 * Frontend consumers should:
 *   1. Read the relevant capability flag at the top of a hook / UI component
 *   2. Hide UI / disable mutations when the flag is false
 *   3. NOT call the contract opcode and rely on a runtime "Unrecognized
 *      opcode" error to fall back — that's slow, racy, and obscures intent.
 *
 * To add a new feature flag:
 *   1. Add a typed boolean to `FrBtcFeatures` (or new contract's interface).
 *   2. Set the value per network based on the deployed contract version.
 *   3. Reference the contract source commit / version that establishes the
 *      capability so future readers can verify.
 */

export interface FrBtcFeatures {
  /** Opcode 77 — Wrap BTC into frBTC. */
  wrap: boolean;
  /** Opcode 78 — Unwrap frBTC back to BTC. */
  unwrap: boolean;
}

/**
 * fr-btc contract `[32:0]` capability matrix.
 *
 * As of 2026-04-26:
 *   - Mainnet `[32:0]`: older build, opcode 78 returns "Unrecognized opcode".
 *     Verified via alkanes_simulate at height 946777.
 *   - Hosted regtest `[32:0]`: same older build as mainnet (faithful prod
 *     emulator). Verified at height 9125.
 *   - Devnet: fresh deploy from `prod_wasms/fr_btc.wasm` which mirrors the
 *     latest `subfrost-alkanes/alkanes/fr-btc/alkanes.toml` — supports
 *     opcode 78.
 *
 * When the live contract is upgraded, flip `unwrap: false → true` for the
 * affected network here. The Unwrap UI path will activate immediately;
 * no other code change required.
 */
export const FRBTC_FEATURES: Record<string, FrBtcFeatures> = {
  mainnet: { wrap: true, unwrap: false },
  testnet: { wrap: true, unwrap: false },
  signet: { wrap: true, unwrap: false },
  regtest: { wrap: true, unwrap: false },              // hosted regtest.subfrost.io
  'subfrost-regtest': { wrap: true, unwrap: false },   // alias
  'regtest-local': { wrap: true, unwrap: false },      // metabot — same stale build
  'qubitcoin-regtest': { wrap: true, unwrap: false },
  oylnet: { wrap: true, unwrap: false },
  devnet: { wrap: true, unwrap: true },                // fresh deploy, latest source
};

/**
 * Get the fr-btc capability set for a network.
 * Returns the mainnet defaults if the network is unrecognized — assumes
 * unknown networks behave like prod (older contract, no unwrap).
 */
export function getFrBtcFeatures(network: string): FrBtcFeatures {
  return FRBTC_FEATURES[network] ?? FRBTC_FEATURES.mainnet;
}
