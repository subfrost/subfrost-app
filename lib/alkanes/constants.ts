/**
 * Shared constants for alkanes operations.
 *
 * Single source of truth — imported by React hooks and integration tests.
 */

/** Factory router opcode for SwapExactTokensForTokens (exact-in, min-out) */
export const FACTORY_SWAP_OPCODE = 13;

/** Factory router opcode for SwapTokensForExactTokens (exact-out, max-in) */
export const FACTORY_SWAP_EXACT_OUT_OPCODE = 14;

/** Factory router opcode for AddLiquidity (Uniswap-style with slippage + deadline) */
export const FACTORY_ADD_LIQUIDITY_OPCODE = 11;

/** Factory router opcode for Burn / RemoveLiquidity (Uniswap-style with slippage + deadline) */
export const FACTORY_BURN_OPCODE = 12;

/** frBTC wrap opcode (exchange BTC for frBTC) — contract [32:0] */
export const FRBTC_WRAP_OPCODE = 77;

/** frBTC unwrap opcode (exchange frBTC for BTC) — contract [32:0] */
export const FRBTC_UNWRAP_OPCODE = 78;

/**
 * frZEC wrap opcode (deposit ZEC, mint frZEC on BTC alkanes).
 *
 * frZEC is a deployed contract at [4:n], NOT a genesis alkane.
 * It exists on BOTH chains:
 *   - BTC alkanes: frZEC at [4:n] — CGGMP21 signer watches ZEC chain, mints frZEC on BTC
 *   - ZEC alkanes: frBTC at [4:m] — FROST signer watches BTC chain, mints frBTC on ZEC
 *
 * The actual alkane ID comes from getConfig(network).FRZEC_ALKANE_ID.
 */
export const FRZEC_WRAP_OPCODE = 77;

/** frZEC unwrap opcode (burn frZEC, queue ZEC payment via CGGMP21) */
export const FRZEC_UNWRAP_OPCODE = 78;

/** frETH wrap opcode (deposit ETH to vault, mint frETH on BTC alkanes) — contract at [4:n] */
export const FRETH_WRAP_OPCODE = 77;

/** frETH unwrap opcode (burn frETH, release ETH from vault via FROST) */
export const FRETH_UNWRAP_OPCODE = 78;

/**
 * frETH FROST signer addresses per network.
 *
 * Unlike frZEC (CGGMP21/P2PKH), frETH uses FROST (Schnorr/P2TR) because
 * the Ethereum vault authenticates via BIP340 Schnorr verification.
 */
export const FRETH_SIGNER_ADDRESSES: Record<string, string> = {
  mainnet: '',
  devnet: '',
  regtest: '',
};

/**
 * Universal Router opcodes — hybrid CLOB+AMM DEX aggregator at [4:70002].
 *
 * The router compares CLOB and AMM quotes, routing to whichever source
 * provides a better price. On devnet the router is initialized with
 * controller=[4:70000] and factory=[4:65498].
 *
 * Source: reference/subfrost-alkanes/alkanes/universal-router/src/lib.rs
 */
export const ROUTER_OPCODES = {
  Initialize: 0,
  Swap: 1,
  Quote: 2,
  AddRoute: 3,
  GetRoutes: 10,
  GetController: 11,
  GetName: 99,
} as const;

/**
 * Pool contract opcodes (NOT factory opcodes).
 * These are used when calling the pool contract directly.
 */
export const POOL_OPCODES = {
  Init: 0,
  AddLiquidity: 1,
  RemoveLiquidity: 2,
  Swap: 3,
  SimulateSwap: 4,
} as const;

/**
 * Signer addresses per network — derived from frBTC contract opcode 103 (GET_SIGNER).
 *
 * frBTC signer address is computed dynamically via getSignerAddressDynamic()
 * which queries opcode 103 and applies BIP341 taproot tweak.
 * These constants are kept for test compatibility only — not used in production.
 * @deprecated Use getSignerAddressDynamic() instead
 */
export const SIGNER_ADDRESSES: Record<string, string> = {
  mainnet: 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7',
  regtest: 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  'subfrost-regtest': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  oylnet: 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  devnet: 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
};

/**
 * frZEC signer addresses per network — derived from frZEC contract opcode 103 (GET_SIGNER).
 *
 * Unlike frBTC (P2TR), frZEC uses P2PKH addresses (t1...) because Zcash uses ECDSA.
 * The CGGMP21 threshold signing group controls this address.
 *
 * If the frZEC contract is redeployed with a different CGGMP21 key, update here.
 */
export const FRZEC_SIGNER_ADDRESSES: Record<string, string> = {
  // Zcash mainnet t1... address (CGGMP21 group key)
  // TODO: Set after mainnet deployment
  mainnet: '',
  // Devnet uses a deterministic test key
  devnet: '',
  regtest: '',
};
