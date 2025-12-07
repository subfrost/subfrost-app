import BigNumber from 'bignumber.js';

// Define FormattedUtxo type locally - supports both naming conventions
type FormattedUtxo = {
  txId?: string;
  txid?: string;
  outputIndex?: number;
  vout?: number;
  satoshis?: number;
  value?: number;
  scriptPk?: string;
  scriptPubKey?: string;
  address: string;
  inscriptions?: any[];
  runes?: any[] | Record<string, any>;
  alkanes?: Record<string, { value: string; name?: string; symbol?: string }>;
  indexed?: boolean;
  confirmations?: number;
};

// Provider type for getFutureBlockHeight - supports both old and WASM providers
interface Provider {
  sandshrew?: {
    bitcoindRpc?: {
      getBlockCount?: () => Promise<number>;
    };
  };
  bitcoin?: {
    getBlockCount?: () => Promise<number>;
  };
  // WASM WebProvider methods
  metashrewHeight?: () => Promise<number>;
}

// ==========================================
// AMM MATH FUNCTIONS (Constant Product AMM)
// Reference: @oyl/sdk/src/amm/utils.ts
// ==========================================

export interface SwapBuyAmountResult {
  buyAmount: bigint;
  sellTokenFeeAmount: bigint;
}

/**
 * Calculate output amount for exact input swap (constant product AMM)
 * This matches the reference implementation in @oyl/sdk/src/amm/utils.ts
 *
 * Formula: amount_out = (amount_in_with_fee * reserve_out) / (reserve_in + amount_in_with_fee)
 *
 * @param sellAmount - Amount of tokens being sold (in atomic units)
 * @param sellTokenReserve - Current reserve of sell token in pool
 * @param buyTokenReserve - Current reserve of buy token in pool
 * @param feeRate - Fee rate in per-1000 (e.g., 10 = 1% fee)
 */
export function swapBuyAmount({
  sellAmount,
  sellTokenReserve,
  buyTokenReserve,
  feeRate,
}: {
  sellAmount: bigint;
  sellTokenReserve: bigint;
  buyTokenReserve: bigint;
  feeRate: bigint;
}): SwapBuyAmountResult {
  if (sellAmount <= 0n) throw new Error('swapBuyAmount: Insufficient sell amount');
  if (sellTokenReserve <= 0n || buyTokenReserve <= 0n) throw new Error('swapBuyAmount: Insufficient liquidity');

  const sellAmountWithFee = sellAmount * (1000n - feeRate);
  const numerator = sellAmountWithFee * buyTokenReserve;
  const denominator = sellTokenReserve * 1000n + sellAmountWithFee;
  const buyAmount = numerator / denominator;
  const sellTokenFeeAmount = (sellAmount * feeRate) / 1000n;

  return { buyAmount, sellTokenFeeAmount };
}

/**
 * Calculate input amount for exact output swap
 * Formula: amount_in = (reserve_in * amount_out * 1000) / ((reserve_out - amount_out) * (1000 - fee)) + 1
 */
export function swapSellAmount({
  buyAmount,
  sellTokenReserve,
  buyTokenReserve,
  feeRate,
}: {
  buyAmount: bigint;
  sellTokenReserve: bigint;
  buyTokenReserve: bigint;
  feeRate: bigint;
}): bigint {
  if (buyAmount <= 0n) throw new Error('swapSellAmount: Insufficient buy amount');
  if (sellTokenReserve <= 0n || buyTokenReserve <= 0n) throw new Error('swapSellAmount: Insufficient liquidity');
  if (buyAmount >= buyTokenReserve) throw new Error('swapSellAmount: Insufficient liquidity for output');

  const numerator = sellTokenReserve * buyAmount * 1000n;
  const denominator = (buyTokenReserve - buyAmount) * (1000n - feeRate);

  return numerator / denominator + 1n; // Round up
}

/**
 * Apply wrap fee (BTC -> frBTC)
 */
export function applyWrapFee(amount: bigint, feePerThousand: number): bigint {
  return (amount * BigInt(1000 - feePerThousand)) / 1000n;
}

/**
 * Apply unwrap fee (frBTC -> BTC)
 */
export function applyUnwrapFee(amount: bigint, feePerThousand: number): bigint {
  return (amount * BigInt(1000 - feePerThousand)) / 1000n;
}

/**
 * Calculate minimum received with slippage (bigint version)
 */
export function calculateMinimumFromSlippageBigInt(amount: bigint, maxSlippagePercent: number): bigint {
  const slippageBps = BigInt(Math.floor(maxSlippagePercent * 100)); // Convert to basis points
  return (amount * (10000n - slippageBps)) / 10000n;
}

/**
 * Calculate maximum sent with slippage (bigint version)
 */
export function calculateMaximumFromSlippageBigInt(amount: bigint, maxSlippagePercent: number): bigint {
  const slippageBps = BigInt(Math.ceil(maxSlippagePercent * 100));
  return (amount * (10000n + slippageBps)) / 10000n;
}

// ==========================================
// STRING-BASED SLIPPAGE FUNCTIONS (for backward compat)
// ==========================================

export function calculateMinimumFromSlippage({
  amount,
  maxSlippage,
}: {
  amount: string;
  maxSlippage: string | number;
}): string {
  const slippageFraction = BigNumber(maxSlippage).dividedBy(100);
  return BigNumber(amount)
    .times(BigNumber(1).minus(slippageFraction))
    .integerValue(BigNumber.ROUND_FLOOR)
    .toString();
}

export function calculateMaximumFromSlippage({
  amount,
  maxSlippage,
}: {
  amount: string;
  maxSlippage: string | number;
}): string {
  const slippageFraction = BigNumber(maxSlippage).dividedBy(100);
  return BigNumber(amount)
    .times(BigNumber(1).plus(slippageFraction))
    .integerValue(BigNumber.ROUND_CEIL)
    .toString();
}

export const getFutureBlockHeight = async (blocks = 0, provider: Provider) => {
  // Try WASM provider first (metashrewHeight), then sandshrew, then bitcoin
  if (provider.metashrewHeight) {
    const currentBlockHeight = await provider.metashrewHeight();
    return currentBlockHeight + blocks;
  }

  const getBlockCount = provider.sandshrew?.bitcoindRpc?.getBlockCount
    || provider.bitcoin?.getBlockCount;

  if (!getBlockCount) {
    throw new Error('No getBlockCount method available on provider');
  }

  const currentBlockHeight = await getBlockCount();
  return currentBlockHeight + blocks;
};

const alkaneUtxohasInscriptionsOrRunes = (u: FormattedUtxo): boolean => {
  const hasInscriptions = Array.isArray(u.inscriptions) && u.inscriptions.length > 0;
  const hasRunes = Array.isArray(u.runes)
    ? u.runes.length > 0
    : !!(u.runes && typeof u.runes === 'object' && Object.keys(u.runes).length > 0);
  return hasInscriptions || hasRunes;
};

export const assertAlkaneUtxosAreClean = (utxos: FormattedUtxo[]): void => {
  const offendingIndex = utxos.findIndex(alkaneUtxohasInscriptionsOrRunes);

  if (offendingIndex !== -1) {
    throw new Error(
      `UTXO at index ${offendingIndex} contains Inscriptions or Runes; ` +
        `split it from your Alkane UTXO set before proceeding.`,
    );
  }
};
