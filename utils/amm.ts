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

// Provider type for getFutureBlockHeight
interface Provider {
  sandshrew?: {
    bitcoindRpc?: {
      getBlockCount?: () => Promise<number>;
    };
  };
  bitcoin?: {
    getBlockCount?: () => Promise<number>;
  };
}

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
  // Try sandshrew provider first, then bitcoin provider
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
